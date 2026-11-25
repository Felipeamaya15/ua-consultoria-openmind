# Imagen de la página web: compila el frontend (React) y lo entrega con Caddy, que además pone el HTTPS.
# Se construye desde la raíz del proyecto.
FROM node:22-slim AS compilar
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
# Estas dos direcciones quedan escritas dentro de la página al compilarla.
ARG VITE_API_URL
ARG VITE_GOOGLE_CLIENT_ID=""
ENV VITE_API_URL=$VITE_API_URL VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID
RUN npm run build

FROM caddy:2-alpine
COPY --from=compilar /app/frontend/dist /srv/app
COPY deploy/Caddyfile /etc/caddy/Caddyfile
RUN mkdir -p /srv/static
