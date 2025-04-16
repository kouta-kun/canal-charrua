import hashlib
import random
from db import database

async def create_challenge():
    random_string = ''.join(random.choices('abcdef!@#$%123456', k=16))
    rounds = random.randint(8, 32)
    challenge_id = await database.create_challenge(
        random_string, rounds
    )
    return challenge_id, random_string, rounds


async def validate(challenge_id: int, challenge_result: str):
    input_string, rounds, used = await database.get_challenge(
        challenge_id
    )
    if used:
        raise ValueError('Challenge is already used!!!')
    for i in range(rounds):
        input_string = hashlib.sha256(input_string.encode('utf-8')).hexdigest()
    if input_string != challenge_result:
        raise ValueError('Challenge was incorrectly replied to.')
    await database.mark_as_used(challenge_id)