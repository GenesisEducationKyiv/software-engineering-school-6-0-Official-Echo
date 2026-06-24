FROM node:20-alpine

RUN corepack enable && corepack prepare pnpm@9.1.0 --activate

WORKDIR /app

COPY package.json .
COPY pnpm-lock.yaml .
COPY pnpm-workspace.yaml .

COPY scanner-service/package.json scanner-service/package.json
COPY packages/proto/package.json packages/proto/package.json
COPY packages/common/package.json packages/common/package.json

RUN pnpm install --filter ./scanner-service... --prod --frozen-lockfile --ignore-scripts

COPY scanner-service/src scanner-service/src
COPY packages/proto packages/proto
COPY packages/common packages/common

WORKDIR /app/scanner-service

CMD ["node", "src/server.js"]