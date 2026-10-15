from celery import Celery
from integrations.redis.providers import get_redis_settings
from kombu import Queue

redis_settings = get_redis_settings()
app = Celery(
    "goosenest-codex-profiles",
    broker=redis_settings.broker_url,
    backend=redis_settings.backend_url,
)
app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    task_acks_late=True,
    task_track_started=True,
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=1,
    imports=("api.v1.profile.usage.tasks",),
    task_default_queue="default",
    task_queues=(Queue("default"), Queue("codex")),
    task_routes={
        "profiles.usage.refresh": {"queue": "codex"},
        "profiles.plan.refresh": {"queue": "codex"},
        "profiles.usage.reset.consume": {"queue": "codex"},
    },
)
