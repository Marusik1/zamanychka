FROM node:24-alpine

WORKDIR /app

RUN corepack enable

ARG DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build?schema=public

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps ./apps
COPY packages ./packages
COPY infra ./infra

RUN pnpm install --frozen-lockfile
RUN pnpm -C apps/api prisma:generate
RUN pnpm build

ENV NODE_ENV=production

CMD ["sh", "-c", "pnpm -C apps/api exec prisma migrate deploy && pnpm start"]
