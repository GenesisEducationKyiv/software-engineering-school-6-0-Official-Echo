FROM node:20-alpine

RUN apk add --no-cache python3 make g++

RUN corepack enable && corepack prepare pnpm@9.1.0 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod --ignore-scripts
RUN pnpm rebuild better-sqlite3

COPY . .

RUN mkdir -p /app/data

EXPOSE 3000

CMD ["node", "src/index.js"]
