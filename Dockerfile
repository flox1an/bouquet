# syntax=docker/dockerfile:1
# Build im Node-Container, Auslieferung als nginx:alpine.
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
# Lockfile metadata for optional/peer deps depends on the npm version and platform
# that wrote it: an `npm install` on macOS drops the optional peer @capacitor/core
# (via nostr-signer-capacitor-plugin) and bundled @emnapi/* entries, and `npm ci`
# then aborts with "Missing: ... from lock file". Re-derive that metadata here, on
# the build platform, so a stale committed lockfile can't break the deploy. Resolved
# versions come from the lockfile and stay unchanged.
RUN npm install --package-lock-only --ignore-scripts
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
