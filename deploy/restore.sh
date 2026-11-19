#!/usr/bin/env bash
set -euo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"
cd "$AQUI"

FECHA="${1:-}"
[ -n "$FECHA" ] || { echo "Uso: bash deploy/restore.sh IDENTIFICADOR   (ejemplo: 20261107-030001)"; exit 1; }

valor() { grep -E "^$1=" .env | head -1 | cut -d= -f2-; }
DC="docker compose -f $AQUI/docker-compose.prod.yml"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/openmind}"
PG="$BACKUP_DIR/postgres-$FECHA.sql.gz"; MG="$BACKUP_DIR/mongo-$FECHA.archive.gz"; IM="$BACKUP_DIR/imagenes-$FECHA.tar.gz"
for f in "$PG" "$MG" "$IM"; do [ -s "$f" ] || { echo "No encuentro $f"; exit 1; }; done

echo "Esto REEMPLAZA los datos actuales de la tienda por los del respaldo $FECHA."
printf "Escribe RESTAURAR para continuar: "; read -r RESPUESTA || true
RESPUESTA="$(printf '%s' "$RESPUESTA" | tr -d '[:space:]' | tr '[:lower:]' '[:upper:]')"
[ "$RESPUESTA" = "RESTAURAR" ] || { echo "Cancelado."; exit 1; }

echo "[1/4] Deteniendo la tienda..."
$DC stop web backend

echo "[2/4] Restaurando PostgreSQL..."
BD="$(valor POSTGRES_DB)"; USR="$(valor POSTGRES_USER)"
$DC exec -T db psql -U "$USR" -d postgres -c "DROP DATABASE IF EXISTS \"$BD\" WITH (FORCE)" -c "CREATE DATABASE \"$BD\" OWNER \"$USR\""
gunzip -c "$PG" | $DC exec -T db psql -U "$USR" -d "$BD" -q -o /dev/null

echo "[3/4] Restaurando MongoDB..."
cat "$MG" | $DC exec -T mongodb mongorestore --quiet --archive --gzip --drop \
  --username "$(valor MONGO_USER)" --password "$(valor MONGO_PASSWORD)" --authenticationDatabase admin

echo "[4/4] Restaurando las imágenes y encendiendo la tienda..."
cat "$IM" | $DC run --rm -T --no-deps --entrypoint sh backend \
  -c "find /app/media -mindepth 1 -delete && tar xzf - -C /app/media && chown -R app:app /app/media"
$DC up -d --wait --wait-timeout 300
echo "Restauración terminada."
