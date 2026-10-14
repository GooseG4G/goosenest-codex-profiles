# syntax=docker/dockerfile:1

FROM node:24-slim AS codex

RUN --mount=type=cache,target=/root/.npm,id=codex-profiles-npm-cache \
    npm install -g @openai/codex

FROM python:3.12-slim AS app

WORKDIR /app

ENV HOME=/home/app

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked,id=codex-profiles-apt-cache \
    apt-get update && \
    apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/*

COPY --from=codex \
    /usr/local/lib/node_modules/@openai/codex/node_modules/@openai/codex-linux-x64 \
    /opt/codex
RUN ln -s \
    /opt/codex/vendor/x86_64-unknown-linux-musl/bin/codex \
    /usr/local/bin/codex

COPY requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip,id=codex-profiles-pip-cache \
    pip install -r requirements.txt

RUN groupadd --gid 10001 app && \
    useradd --uid 10001 --gid app --create-home app && \
    install -d --owner app --group app /data

COPY --chown=app:app ./app .

USER app
