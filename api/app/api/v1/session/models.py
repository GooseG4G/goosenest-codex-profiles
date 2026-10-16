from pydantic import BaseModel, EmailStr


class SessionCredentials(BaseModel):
    username: EmailStr
    password: str
