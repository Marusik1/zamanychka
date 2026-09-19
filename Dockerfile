FROM node:24-alpine

WORKDIR /app

RUN corepack enable

ARG DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build?schema=public
ARG BUILD_ID=local-docker
ARG GIT_SHA=unknown
ARG BUILD_TIMESTAMP=unknown

ENV BUILD_ID=$BUILD_ID
ENV GIT_SHA=$GIT_SHA
ENV BUILD_TIMESTAMP=$BUILD_TIMESTAMP
ENV VITE_BUILD_ID=$BUILD_ID
ENV VITE_GIT_SHA=$GIT_SHA
ENV VITE_BUILD_TIMESTAMP=$BUILD_TIMESTAMP

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps ./apps
COPY packages ./packages
COPY infra ./infra

RUN pnpm install --frozen-lockfile
RUN pnpm -C apps/api prisma:generate
RUN pnpm -C apps/web build \
  && pnpm -C apps/api exec tsc -b tsconfig.build.json --force

ENV NODE_ENV=production

CMD ["sh", "-c", "pnpm -C apps/api exec prisma migrate deploy && pnpm start"]
