# syntax=docker/dockerfile:1
# Build im Node-Container, Auslieferung als nginx:alpine. Laeuft auf dem Forgejo-Runner
# (home-network, Ticket 040); gleiche nginx-Konfiguration wie ops/static-site.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY <<'EOF' /etc/nginx/conf.d/default.conf
server {
  listen 80;
  root /usr/share/nginx/html;
  index index.html;
  location /assets/ {
    expires 30d;
    add_header Cache-Control "public, immutable";
  }
  location = /index.html {
    add_header Cache-Control "no-cache";
  }
  location / {
    try_files $uri $uri/ /index.html;
  }
}
EOF
COPY --from=build /app/dist /usr/share/nginx/html/
