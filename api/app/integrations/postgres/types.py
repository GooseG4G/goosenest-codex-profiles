from typing import TypeVar

from pydantic import BaseModel

PostgresResultT = TypeVar(
    "PostgresResultT",
    bound=BaseModel,
)
