#!/usr/bin/env bash
# Mide cuánto disco ocupa la tienda: bases de datos, imágenes subidas, programas (imágenes de Docker) y caché de compilaciones.
# Funciona igual en tu computador (con Docker Desktop) y en un servidor.
# Uso:  bash deploy/medir_disco.sh
set -uo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"
DC="docker compose -f $AQUI/docker-compose.prod.yml"

# kilobytes dentro de un contenedor (suma de una o varias carpetas)
kb_en() { local servicio="$1"; shift; $DC exec -T "$servicio" sh -c "du -sk $*" 2>/dev/null | awk '{s+=$1} END {printf "%d", s+0}'; }
mb()  { awk -v k="$1" 'BEGIN {printf "%.1f MiB", k/1024}'; }
gb()  { awk -v k="$1" 'BEGIN {printf "%.2f GiB", k/1048576}'; }
fila() { printf "  %-46s %12s\n" "$1" "$2"; }

if ! $DC exec -T db true > /dev/null 2>&1; then echo "No pude leer la tienda. ¿Está encendida? Prueba: docker compose -f deploy/docker-compose.prod.yml ps"; exit 1; fi

pg=$(kb_en db /var/lib/postgresql/data); mg=$(kb_en mongodb /data/db); media=$(kb_en backend /app/media)
estilos=$(kb_en backend /app/staticfiles); caddy=$(kb_en web /data /config)
datos=$((pg + mg + media + estilos + caddy))

# imágenes de Docker (tamaño real de cada una, en bytes)
img_kb() { local b; b=$(docker image inspect "$1" --format '{{.Size}}' 2>/dev/null | head -1); awk -v b="${b:-0}" 'BEGIN {printf "%d", b/1024}'; }
i_back=$(img_kb openmind-backend); i_web=$(img_kb openmind-web); i_pg=$(img_kb postgres:15-alpine); i_mg=$(img_kb mongo:8.0)
progs=$((i_back + i_web + i_pg + i_mg))

# caché de compilaciones (se puede borrar con: docker builder prune -f)
cache_txt=$(docker system df --format '{{.Type}}|{{.Size}}' 2>/dev/null | awk -F'|' '$1 ~ /Build Cache/ {print $2}')
a_kb() { awk -v t="$1" 'BEGIN { v=t+0; u=t; gsub(/[0-9.]/,"",u); f=1/1024; if (u=="kB"||u=="KB") f=1; else if (u=="MB") f=1000; else if (u=="GB") f=1000000; else if (u=="TB") f=1000000000; printf "%d", v*f }'; }
cache=$(a_kb "${cache_txt:-0B}")

echo "=============== DISCO QUE OCUPA LA TIENDA ==============="
echo "Datos de la tienda (esto es lo que crece al usarla):"
fila "PostgreSQL (usuarios, pedidos y ajustes)" "$(mb "$pg")"
fila "MongoDB (productos y sus fotos)" "$(mb "$mg")"
fila "Imágenes subidas (carpeta media)" "$(mb "$media")"
fila "Estilos del administrador" "$(mb "$estilos")"
fila "Caddy (certificados y ajustes)" "$(mb "$caddy")"
fila "SUBTOTAL DATOS" "$(gb "$datos")"
echo
echo "Programas (imágenes de Docker; no crecen con la tienda):"
fila "Programa de la tienda (backend)" "$(mb "$i_back")"
fila "Página web con Caddy (web)" "$(mb "$i_web")"
fila "PostgreSQL" "$(mb "$i_pg")"
fila "MongoDB" "$(mb "$i_mg")"
fila "SUBTOTAL PROGRAMAS" "$(gb "$progs")"
echo
fila "Caché de compilaciones (se puede borrar)" "$(gb "$cache")"
echo "---------------------------------------------------------"
fila "TOTAL de la tienda (datos + programas)" "$(gb $((datos + progs)))"
fila "TOTAL con la caché de compilaciones" "$(gb $((datos + progs + cache)))"
echo
echo "Unidades: MiB y GiB (1 GiB = 1,07 GB). Docker usa MB y GB, unidades un poco más pequeñas, así que sus números salen algo mayores."
echo "En un servidor se suma el sistema operativo y Docker (unos 4 a 5 GiB, estimado; se mide con: df -h /)."
echo "Con eso, esta tienda usaría unos $(awk -v k=$((datos + progs + cache)) 'BEGIN {printf "%.1f", k/1048576 + 5}') GiB de los 37 GiB útiles de un disco de 40 GB."
