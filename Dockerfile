# syntax=docker/dockerfile:1

# Base images can be overridden (for example to use a registry mirror).
ARG NODE_IMAGE=node:22-alpine
ARG NGINX_IMAGE=nginxinc/nginx-unprivileged:1.29-alpine

# ---- Build stage: compile the static web app ----
FROM ${NODE_IMAGE} AS build
WORKDIR /app
ENV CI=true
COPY package.json package-lock.json ./
# Optional: behind a TLS-intercepting proxy, pass its CA with
#   docker build --secret id=ca,src=/path/to/ca.pem .
RUN --mount=type=secret,id=ca,required=false \
    if [ -f /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca; fi; \
    npm ci --no-audit --no-fund
COPY . .
ARG PANDARO_BASE=/
ENV PANDARO_BASE=${PANDARO_BASE}
RUN npm run build

# ---- Runtime stage: unprivileged nginx serving static files only ----
FROM ${NGINX_IMAGE} AS runtime
LABEL org.opencontainers.image.title="Pandaro" \
      org.opencontainers.image.description="A calm, panda-themed Pomodoro timer" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.source="https://github.com/purysho/pandaro"
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
USER 101
