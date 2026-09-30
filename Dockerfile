# syntax = docker/dockerfile:1

# One Node process serves the pages, the README at /readme/ and the
# WebSocket. node runs the TypeScript server directly (type stripping); only
# the browser bundle is built. SQLite is node's own, so there is no native
# module to compile.

FROM docker.io/library/node:24-slim AS build
WORKDIR /app
RUN npm install -g pnpm@11.9.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build && pnpm prune --prod

FROM docker.io/library/node:24-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json README.md ./
COPY game ./game
COPY server ./server
COPY client ./client
COPY docs ./docs
CMD ["node", "server/main.ts"]
