from pydantic import BaseModel, EmailStr, Field


class SessionCredentials(BaseModel):
    username: EmailStr = Field(
        ...,
        description="Account email address",
    )

    password: str = Field(
        ...,
        description="Account password",
    )
