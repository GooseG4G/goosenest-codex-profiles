FROM node:24-slim AS codex

RUN npm install -g @openai/codex

FROM python:3.12-slim

WORKDIR /app

COPY --from=codex \
    /usr/local/lib/node_modules/@openai/codex/node_modules/@openai/codex-linux-x64 \
    /opt/codex
RUN ln -s \
    /opt/codex/vendor/x86_64-unknown-linux-musl/bin/codex \
    /usr/local/bin/codex

COPY requirements.txt requirements.txt

RUN --mount=type=cache,target=/root/.cache/pip,id=pip-cache \
    pip install \
    --index-url https://pypi.org/simple \
    --default-timeout=2000 \
    -r requirements.txt

COPY . .
