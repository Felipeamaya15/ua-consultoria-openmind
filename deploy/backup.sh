#!/usr/bin/env bash
set -euo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"
cd "$AQUI"

valor() { grep -E "^$1=" .env | head -1 | cut -d= -f2-; }
DC="docker compose -f $AQUI/docker-compose.prod.yml"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/openmind}"
DIAS="${DIAS:-14}"
FECHA="$(date +%Y%m%d-%H%M%S)"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

echo "[1/3] Respaldando PostgreSQL..."
$DC exec -T db pg_dump -U "$(valor POSTGRES_USER)" -d "$(valor POSTGRES_DB)" | gzip > "$BACKUP_DIR/postgres-$FECHA.sql.gz"

echo "[2/3] Respaldando MongoDB..."
$DC exec -T mongodb mongodump --archive --gzip \
  --username "$(valor MONGO_USER)" --password "$(valor MONGO_PASSWORD)" \
  --authenticationDatabase admin --db "$(valor MONGO_DB_NAME)" > "$BACKUP_DIR/mongo-$FECHA.archive.gz"

echo "[3/3] Respaldando las imágenes subidas..."
$DC run --rm -T --no-deps --entrypoint sh backend -c "tar czf - -C /app/media ." > "$BACKUP_DIR/imagenes-$FECHA.tar.gz"

for f in "postgres-$FECHA.sql.gz" "mongo-$FECHA.archive.gz" "imagenes-$FECHA.tar.gz"; do
  [ -s "$BACKUP_DIR/$f" ] || { echo "ERROR: el respaldo $f quedó vacío."; exit 1; }
done

chmod 600 "$BACKUP_DIR"/*-"$FECHA".*
find "$BACKUP_DIR" -type f -mtime +"$DIAS" -delete
echo "Respaldo listo: $BACKUP_DIR (identificador $FECHA). Copia estos archivos fuera del servidor."
