#!/usr/bin/env bash
# Actualiza la tienda a la última versión aprobada: respalda, descarga el código, reconstruye y verifica.
# Uso (desde la carpeta principal del proyecto):  bash deploy/actualizar.sh
set -euo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"
DC="docker compose -f $AQUI/docker-compose.prod.yml"

echo "[1/3] Haciendo un respaldo antes de actualizar..."
bash "$AQUI/backup.sh"

echo "[2/3] Descargando la versión nueva..."
if [ -d "$AQUI/../.git" ]; then
  git -C "$AQUI/.." pull --ff-only
else
  echo "(Sin Git: se asume que ya copiaste los archivos nuevos del ZIP sobre esta carpeta; se salta la descarga.)"
fi

echo "[3/3] Reconstruyendo y reiniciando (puede tardar varios minutos)..."
$DC up -d --build --wait --wait-timeout 600
$DC ps
echo "Actualización terminada. Abre la tienda y revisa que todo funcione."
