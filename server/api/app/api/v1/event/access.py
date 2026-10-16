from api.v1.session.auth import Principal

from .models import Event


def can_receive_event(principal: Principal, event: Event) -> bool:
    audience = event.audience
    return principal.role in audience.roles or principal.user_id in audience.user_ids
