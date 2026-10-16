from celery import Celery
from integrations.redis.providers import get_redis_settings
from kombu import Queue

redis_settings = get_redis_settings()
app = Celery(
    "goosenest-codex-profiles",
    broker=redis_settings.broker_url,
)
app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    task_acks_late=True,
    task_ignore_result=True,
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=1,
    beat_schedule_filename="/data/celerybeat-schedule",
    imports=(
        "worker.tasks.profile.plan.refresh",
        "worker.tasks.profile.usage.refresh",
        "worker.tasks.profile.usage.resets",
        "worker.tasks.response.cleanup",
        "worker.tasks.session.cleanup",
    ),
    task_default_queue="default",
    task_queues=(Queue("default"), Queue("codex")),
    task_routes={
        "profiles.usage.refresh": {"queue": "codex"},
        "profiles.plan.refresh": {"queue": "codex"},
        "profiles.usage.reset.consume": {"queue": "codex"},
        "responses.state.cleanup": {"queue": "default"},
        "sessions.expired.cleanup": {"queue": "default"},
    },
    beat_schedule={
        "cleanup-expired-response-state": {
            "task": "responses.state.cleanup",
            "schedule": 900.0,
            "options": {"expires": 840},
        },
        "cleanup-expired-sessions": {
            "task": "sessions.expired.cleanup",
            "schedule": 3600.0,
            "options": {"expires": 3540},
        },
    },
)
