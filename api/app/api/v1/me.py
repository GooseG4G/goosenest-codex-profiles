from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status

from app.api.v1.auth import Principal, get_principal
from app.api.v1.users.device_service import issue_device, list_devices
from app.api.v1.users.models import DeviceCreate, DeviceIssued, DeviceRead
from app.integrations.postgres import PostgresSession
from app.integrations.postgres.providers import get_postgres_session

router = APIRouter(prefix="/me", tags=["me"])
CurrentUser = Annotated[Principal, Depends(get_principal)]
Session = Annotated[PostgresSession, Depends(get_postgres_session)]


@router.get("/devices")
async def read_my_devices(principal: CurrentUser, session: Session) -> list[DeviceRead]:
    return await list_devices(session, principal.user_id)


@router.post("/devices", status_code=status.HTTP_201_CREATED)
async def create_my_device(
    body: DeviceCreate,
    principal: CurrentUser,
    session: Session,
) -> DeviceIssued:
    return await issue_device(session, principal.user_id, body)


@router.delete("/devices/{device_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_my_device(
    device_id: UUID,
    principal: CurrentUser,
    session: Session,
) -> Response:
    result = await session.execute(
        "DELETE FROM devices WHERE user_id = $1 AND device_id = $2",
        principal.user_id,
        device_id,
    )
    if result == "DELETE 0":
        raise HTTPException(status_code=404, detail="Device not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
