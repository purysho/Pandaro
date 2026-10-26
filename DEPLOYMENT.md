# Deploying Pandaro

Pandaro is a static web app. Any web server can host it; nothing on the server stores user data.

> Service workers, and therefore offline use and installation, only work over **HTTPS** or on
> `localhost`. Plain HTTP on a LAN address still runs the timer, but not offline.

## 1. Local development

```bash
npm ci
npm run dev            # http://localhost:5173
```

## 2. Docker (recommended for self-hosting)

```bash
cp .env.example .env   # optional: change the port or bind address
docker compose up -d --build
curl http://localhost:8080/healthz   # → ok
```

What you get:

- **nginx** (`nginxinc/nginx-unprivileged`) running as a non-root user on port 8080, with a
  read-only root filesystem, all capabilities dropped and `no-new-privileges`;
- **`restart: unless-stopped`** and a health check on `/healthz`;
- **security headers** on every route: Content-Security-Policy, X-Content-Type-Options,
  Referrer-Policy, Permissions-Policy, Cross-Origin-Opener-Policy and X-Frame-Options;
- **caching**: hashed `/assets/*` cached for a year (`immutable`); `index.html`, `sw.js` and the
  manifest are `no-cache`, so new releases are picked up and nobody is stuck on an old service
  worker;
- **gzip** and an SPA fallback.

Update to a new version:

```bash
git pull
docker compose up -d --build
```

Settings in `.env`:

| Variable       | Default   | Meaning                                                                    |
| -------------- | --------- | -------------------------------------------------------------------------- |
| `PANDARO_PORT` | `8080`    | Host port                                                                  |
| `PANDARO_BIND` | `0.0.0.0` | Host interface. Use `127.0.0.1` behind a reverse proxy on the same machine |
| `PANDARO_BASE` | `/`       | Serve under a sub-path, e.g. `/pandaro/` (rebuild required)                |

Build options:

- **Base images:** override with `--build-arg NODE_IMAGE=…` and `--build-arg NGINX_IMAGE=…`, for
  example to use a registry mirror.
- **TLS-intercepting proxy:** pass its CA with `--secret id=ca,src=ca.pem`.
- **IPv6:** the container listens on IPv4. If your Docker network has IPv6, add
  `listen [::]:8080;` to `docker/nginx.conf`.

## 3. Local network

Run the Docker setup above and open `http://<server-ip>:8080` from other devices. Over plain HTTP,
browsers disable the service worker on non-localhost addresses: the app works, but not offline
and it can't be installed. For full functionality, use HTTPS, for example with Caddy's internal
CA (`tls internal`).

## 4. VPS with HTTPS

Point a DNS name at the server, set `PANDARO_BIND=127.0.0.1`, start the container, then use one of
the reverse proxies below.

### Caddy (automatic HTTPS)

```caddyfile
pandaro.example.com {
    encode gzip
    reverse_proxy 127.0.0.1:8080
}
```

### nginx

```nginx
server {
    listen 443 ssl http2;
    server_name pandaro.example.com;
    ssl_certificate     /etc/letsencrypt/live/pandaro.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/pandaro.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
server {
    listen 80;
    server_name pandaro.example.com;
    return 301 https://$host$request_uri;
}
```

### Traefik (labels on the compose service)

```yaml
labels:
  - traefik.enable=true
  - traefik.http.routers.pandaro.rule=Host(`pandaro.example.com`)
  - traefik.http.routers.pandaro.entrypoints=websecure
  - traefik.http.routers.pandaro.tls.certresolver=letsencrypt
  - traefik.http.services.pandaro.loadbalancer.server.port=8080
```

Keep the container's response headers when proxying; don't add caching that overrides
`Cache-Control: no-cache` on `index.html` and `sw.js`.

## 5. Static hosting (Netlify, Cloudflare Pages, GitHub Pages, S3)

```bash
npm ci && npm run build      # upload the dist/ folder
```

- **Sub-path hosting** (e.g. GitHub Pages project sites): build with
  `PANDARO_BASE=/<repo>/ npm run build`.
- **SPA fallback:** configure 404s to serve `index.html`. Netlify: `/* /index.html 200`.
  Cloudflare Pages does this automatically.
- **Headers:** recreate the Docker headers where the host allows it. A Netlify `_headers` file
  would look like:

  ```text
  /*
    Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; worker-src 'self'; manifest-src 'self'; media-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'
    X-Content-Type-Options: nosniff
    Referrer-Policy: no-referrer
  /assets/*
    Cache-Control: public, max-age=31536000, immutable
  /sw.js
    Cache-Control: no-cache
  /index.html
    Cache-Control: no-cache
  ```

  The production build also includes the CSP as a `<meta>` tag, so the main protections still
  apply on hosts that can't set headers.

## Verifying a deployment

```bash
curl -fsS https://pandaro.example.com/healthz   # Docker image only
PANDARO_E2E_URL=https://pandaro.example.com npx playwright test
```
