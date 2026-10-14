FROM node:24-slim AS codex

RUN npm install -g @openai/codex

FROM python:3.12-slim

WORKDIR /app

COPY --from=codex /usr/local/bin/node /usr/local/bin/node
COPY --from=codex /usr/local/lib/node_modules/@openai/codex /usr/local/lib/node_modules/@openai/codex
RUN ln -s /usr/local/lib/node_modules/@openai/codex/bin/codex.js /usr/local/bin/codex

COPY requirements.txt requirements.txt

RUN --mount=type=cache,target=/root/.cache/pip,id=pip-cache \
    pip install \
    --index-url https://pypi.org/simple \
    --default-timeout=2000 \
    -r requirements.txt

COPY . .
