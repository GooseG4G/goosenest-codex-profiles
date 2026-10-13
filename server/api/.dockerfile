FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt requirements.txt

RUN --mount=type=cache,target=/root/.cache/pip,id=pip-cache \
    pip install \
    --index-url https://pypi.org/simple \
    --default-timeout=2000 \
    -r requirements.txt

COPY ./app .
