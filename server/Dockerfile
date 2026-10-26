# syntax=docker/dockerfile:1
# Pandaro API. Build from this folder: docker build -t pandaro-api server/
ARG NODE_IMAGE=node:22-alpine

FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY package.json package-lock.json ./
# Optional: behind a TLS-intercepting proxy, pass its CA with --secret id=ca,src=ca.pem
RUN --mount=type=secret,id=ca,required=false \
    if [ -f /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca; fi; \
    npm ci --no-audit --no-fund
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM ${NODE_IMAGE} AS runtime
LABEL org.opencontainers.image.title="Pandaro API" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.source="https://github.com/purysho/pandaro"
# pg_dump / pg_restore for the backup command. The optional proxy CA is used for this step only
# and is not left in the image.
RUN --mount=type=secret,id=ca,required=false \
    bundle=/etc/ssl/certs/ca-certificates.crt; \
    if [ -f /run/secrets/ca ]; then cp "$bundle" /tmp/bundle && cat /run/secrets/ca >> "$bundle"; fi; \
    apk add --no-cache postgresql16-client; \
    if [ -f /tmp/bundle ]; then mv /tmp/bundle "$bundle"; fi
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY migrations ./migrations
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/healthz >/dev/null || exit 1
CMD ["node", "dist/main.js"]
