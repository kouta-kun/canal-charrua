import os
import typing
import uuid
from contextlib import asynccontextmanager
from typing import Annotated

import magic
import pydantic
from fastapi import FastAPI, Request, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

import challenge
from db import database


@asynccontextmanager
async def lifespan(app: FastAPI):
    await database.initialize_db()
    yield


app = FastAPI(lifespan=lifespan)


@app.get('/api/challenge')
async def get_new_challenge():
    challenge_id, random_string, rounds = await challenge.create_challenge()
    return {
        'challenge_id': challenge_id,
        'input': random_string,
        'rounds': rounds,
    }


class CreatePost(pydantic.BaseModel):
    subject: typing.Optional[str]
    content: str
    parent: typing.Optional[int]
    challenge_id: int
    challenge_result: str
    image_id: typing.Optional[str]


@app.get('/api/image/{img_id}')
async def get_image(img_id: str):
    if not os.path.exists(os.path.join('files',img_id)) or '/' in img_id or '..' in img_id:
        raise ValueError("image not found")

    with open(os.path.join('files',img_id+'.mime'), 'r') as f:
        mimetype = f.read().strip()

    return FileResponse(
        os.path.join('files',img_id), media_type=mimetype
    )

@app.post("/api/file-upload")
async def upload_file(file: Annotated[UploadFile, File()]):
    if file.size > 1024 * 1024 * 32:
        raise ValueError("File too big.")

    filecontent = file.file.read()
    realmimetype = magic.from_buffer(filecontent, mime=True)

    if realmimetype not in (
            'image/png', 'image/bmp',
            'image/jpeg', 'image/gif'
    ):
        raise ValueError("Only images allowed.")

    os.makedirs('files', exist_ok=True)
    imguuid = str(uuid.uuid1())

    with open(os.path.join('files', imguuid), 'wb') as f:
        f.write(filecontent)

    with open(os.path.join('files', imguuid + '.mime'), 'w') as f:
        f.write(realmimetype)

    return {'id': imguuid}


@app.post('/api/post')
async def create_post(body: CreatePost, request: Request):
    await challenge.validate(body.challenge_id, body.challenge_result)
    return {
        'id': await make_post(body, request)
    }


async def make_post(body, request):
    if len(body.content) == 0 and body.image_id is None:
        raise ValueError('No posts vacíos!!!')
    response = await database.create_post(body.subject, body.content,
                                       body.parent, body.image_id,
                                       request.client.host)
    return response


@app.get('/api/threads')
async def thread_list(page: typing.Optional[int] = 0):
    return [t async for t in database.get_threads_frontpage(page)]

@app.get('/api/pagecount')
async def page_count():
    return {'count': await database.page_count()}


app.add_middleware(CORSMiddleware, allow_origins=['*'],
                   allow_methods=['*'])
