FROM node:24-alpine

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps ./apps
COPY packages ./packages
COPY infra ./infra

RUN pnpm install --frozen-lockfile
RUN pnpm -C apps/api prisma:generate
RUN pnpm build

ENV NODE_ENV=production

CMD ["pnpm", "start"]
