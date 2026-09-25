# Builds one Node workspace app (api or worker) with only its production dependencies.
# Debian (glibc) base: the Temporal native core does not support Alpine/musl.
#   docker build -f infra/docker/node-service.Dockerfile --build-arg APP=api -t vprocly/api .
FROM node:24-bookworm-slim AS build
ARG APP
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile \
 && pnpm --filter "@vprocly/${APP}..." build \
 && pnpm --filter "@vprocly/${APP}" deploy --prod --legacy /out

FROM node:24-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out ./
# Numeric uid of "node", so Kubernetes runAsNonRoot can verify it.
USER 1000
CMD ["node", "dist/main.js"]
