#!/bin/sh
# Arranque del backend en producción: prepara las bases, los estilos y lanza Gunicorn.
set -e

# Los volúmenes de Docker pueden llegar con dueño "root". Se corrige aquí y luego el programa
# sigue como usuario "app" (sin privilegios), que es como debe correr en producción.
if [ "$(id -u)" = "0" ]; then
  find /app/media /app/staticfiles ! -user app -exec chown app:app {} +
  exec env HOME=/home/app setpriv --reuid=1000 --regid=1000 --clear-groups "$0" "$@"
fi

echo "[1/4] Aplicando migraciones de PostgreSQL..."
python manage.py migrate --noinput

echo "[2/4] Sincronizando índices de MongoDB..."
python manage.py sync_mongo_indexes

echo "[3/4] Copiando los archivos de estilo del administrador..."
python manage.py collectstatic --noinput > /dev/null

echo "[4/4] Iniciando el servidor (Gunicorn)..."
exec gunicorn config.wsgi:application \
  --bind 0.0.0.0:8000 \
  --workers 2 \
  --timeout 60 \
  --graceful-timeout 30 \
  --max-requests 1000 --max-requests-jitter 100 \
  --access-logfile - --error-logfile -
