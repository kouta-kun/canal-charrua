import asyncio
import base64
import hashlib
import math
import time
import typing

import aiosqlite
import maxminddb

reader = maxminddb.open_database('geoacumen.mmdb')


def get_poster_id(poster_ip, thread_id):
    hasher = hashlib.sha256()
    hasher.update(poster_ip.encode('utf-8'))
    hasher.update(str(thread_id).encode('utf-8'))
    hd = hasher.hexdigest()
    poster_id = base64.b64encode(hd[-6:].encode('utf-8'), b'!?')
    return poster_id


def get_country(poster_ip):
    country = reader.get(poster_ip).get('country', {}).get('iso_code', 'Desconocido')
    if country == 'None':
        country = 'Desconocido'
    return country


class DB:
    def __init__(self, db_path='charrua.db'):
        self._db_path = db_path
        self._lock = asyncio.Lock()

    async def __aenter__(self) -> aiosqlite.Connection:
        await self._lock.acquire()
        self._db = await aiosqlite.connect(self._db_path)
        return self._db

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self._db.close()
        self.db = None
        self._lock.release()

    async def initialize_db(self):
        async with self as db:
            await db.execute(
                '''
                create table if not exists post(
                    id integer primary key,
                    subject text,
                    parent integer,
                    source_ip text,
                    content text,
                    image_id text,
                    submission_date date not null
                )
                '''
            )
            await db.execute(
                '''
                create table if not exists challenge(
                    id integer primary key,
                    in_text text not null,
                    rounds integer not null,
                    used boolean not null
                )
                '''
            )
            cursor: aiosqlite.Cursor = await db.cursor()
            await cursor.execute(
                '''
                select count(*) from pragma_table_info('post') where name='sticky'
                '''
            )
            if (await cursor.fetchone())[0] == 0:
                await cursor.execute('''
                    alter table post add column sticky boolean not null default false
                ''')

            await db.commit()

    async def get_threads_frontpage(self, page: int):
        async with self as db:
            cursor: aiosqlite.Cursor = await db.cursor()
            await cursor.execute('''
            select
                p1.id, p1.subject, p1.content,
                p1.submission_date,
                coalesce((
                    select max(pl.submission_date) from post pl 
                    where pl.parent = p1.id), 
                    p1.submission_date
                ) as last_post_date, p1.source_ip, p1.image_id, p1.sticky
            from post p1
            where p1.parent is null and p1.sticky = true
            union
            select
                p1.id, p1.subject, p1.content,
                p1.submission_date,
                coalesce((
                    select max(pl.submission_date) from post pl 
                    where pl.parent = p1.id), 
                    p1.submission_date
                ) as last_post_date, p1.source_ip, p1.image_id, p1.sticky
            from post p1
            where p1.parent is null
            order by sticky desc, last_post_date desc
            limit 10 offset ?
            ''', (page * 10,))
            for thread in list(await cursor.fetchall()):
                thread_id = thread[0]
                await cursor.execute('''
                select p2.id, p2.subject, p2.content, p2.submission_date, p2.source_ip, p2.image_id
                from post p2
                where p2.parent = ?
                order by id
                ''', (thread_id,))
                messages = await cursor.fetchall()
                poster_ip = str(thread[5])
                parent = {
                    'id': thread_id,
                    'subject': thread[1],
                    'content': thread[2],
                    'submission_date': thread[3],
                    'poster_id': get_poster_id(poster_ip, thread_id),
                    'country': get_country(poster_ip),
                    'image_id': thread[6],
                    'sticky': bool(thread[7]),
                    'children': [
                        {
                            'id': msg[0],
                            'subject': msg[1],
                            'content': msg[2],
                            'submission_date': msg[3],
                            'poster_id': get_poster_id(msg[4], thread_id),
                            'country': get_country(msg[4]),
                            'image_id': msg[5],
                        }
                        for msg in messages
                    ]
                }
                yield parent

    async def create_challenge(self, random_string, rounds):
        async with self as db:
            cursor: aiosqlite.Cursor = await db.cursor()
            await cursor.execute(
                '''
            insert into challenge(in_text, rounds, used) 
            values(?, ?, false) returning id
            ''',
                (random_string, rounds))
            challenge_id = (await cursor.fetchone())[0]
            await db.commit()
            return challenge_id

    async def get_challenge(self, challenge_id: int):
        async with self as db:
            cursor: aiosqlite.Cursor = await db.cursor()
            await cursor.execute('''
            select in_text, rounds, used from challenge where id = ?
            ''', (challenge_id,))
            return await cursor.fetchone()

    async def create_post(self,
                          subject: str,
                          content: str,
                          parent_id: typing.Optional[int],
                          image_id: typing.Optional[str],
                          source_ip: str):
        async with self as db:
            cursor: aiosqlite.Cursor = await db.cursor()
            await cursor.execute('''
            insert into post(
                subject, parent, source_ip,
                content, submission_date, image_id
            ) values (?, ?, ?, ?, ?, ?)
            returning id
            ''', (
                subject, parent_id, source_ip, content, int(time.time() * 1000), image_id
            ))
            post_id = (await cursor.fetchone())[0]
            await db.commit()
            return post_id

    async def mark_as_used(self, challenge_id):
        async with self as db:
            await db.execute('''
            update challenge set used = true where id = ?
            ''', (challenge_id,))
            await db.commit()

    async def page_count(self):
        async with self as db:
            cursor = await db.cursor()
            await cursor.execute('''
            select count(*) / 10.0 as pagecount from post where parent is null;
            ''')
            return min(int(math.ceil((await cursor.fetchone())[0])), 10)

database = DB()