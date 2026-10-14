FROM node:24-alpine AS build

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run build

FROM alpine:3.22 AS app

COPY --from=build /app/dist /opt/web

CMD ["sh", "-c", "find /srv/web -mindepth 1 -delete && cp -a /opt/web/. /srv/web/"]
