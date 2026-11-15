#!/usr/bin/env bash
# Mide cuánta memoria usa la tienda mientras la usas, y dice si un servidor de 2 GB alcanza.
# Funciona igual en tu computador (con Docker Desktop) y en un servidor.
# Uso:  bash deploy/medir_memoria.sh [MINUTOS]     (por defecto 5)
# Mientras corre, USA la tienda: navega, abre el panel, sube fotos, haz pedidos de prueba.
set -uo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"
DC="docker compose -f $AQUI/docker-compose.prod.yml"
MIN="${1:-5}"
DURACION="${DURACION_S:-$((MIN * 60))}"
INTERVALO="${INTERVALO:-10}"
FIN=$(( $(date +%s) + DURACION ))

# Convierte "516.3MiB", "1.2GiB", "850kB"... a MiB y los suma (una cifra por línea de entrada).
a_mib() { awk '{ v=$1; u=v; gsub(/[0-9.]/,"",u); gsub(/[^0-9.]/,"",v); f=1;
  if (u=="B") f=1/1048576; else if (u=="kB"||u=="KB") f=1000/1048576; else if (u=="KiB") f=1/1024;
  else if (u=="MB") f=1000000/1048576; else if (u=="MiB") f=1; else if (u=="GB") f=1000000000/1048576; else if (u=="GiB") f=1024;
  s+=v*f } END { printf "%d", s }'; }
tienda_mib() { docker stats --no-stream --format "{{.Name}} {{.MemUsage}}" | awk '$1 ~ /^openmind-/ {print $2}' | a_mib; }
maquina() { $DC exec -T web sh -c "grep -E '^(MemTotal|MemAvailable):' /proc/meminfo" 2>/dev/null; }

if [ -z "$(maquina)" ]; then echo "No pude leer la memoria. ¿Está la tienda encendida? Prueba: docker compose -f deploy/docker-compose.prod.yml ps"; exit 1; fi
echo "Midiendo durante $((DURACION / 60)) min $((DURACION % 60)) s (una muestra cada $INTERVALO s)."
echo "USA LA TIENDA mientras tanto: navega, abre el panel, sube fotos, haz pedidos de prueba."
printf "%-9s %12s %12s %12s %12s\n" "hora" "tienda_MiB" "total_MiB" "libre_MiB" "usado_MiB"
n=0; suma=0; max_t=0; max_u=0; min_l=999999999; tot=0
while [ "$(date +%s)" -lt "$FIN" ]; do
  t=$(tienda_mib); m=$(maquina)
  tot=$(echo "$m" | awk '/MemTotal/ {printf "%d", $2/1024}'); lib=$(echo "$m" | awk '/MemAvailable/ {printf "%d", $2/1024}')
  usado=$(( tot - lib ))
  printf "%-9s %12s %12s %12s %12s\n" "$(date +%H:%M:%S)" "$t" "$tot" "$lib" "$usado"
  n=$((n + 1)); suma=$((suma + t))
  [ "$t" -gt "$max_t" ] && max_t=$t; [ "$usado" -gt "$max_u" ] && max_u=$usado; [ "$lib" -lt "$min_l" ] && min_l=$lib
  sleep "$INTERVALO"
done
[ "$n" -gt 0 ] || { echo "No se alcanzó a tomar ninguna muestra."; exit 1; }
prom=$((suma / n)); sistema=250; util2gb=1900; proy=$((max_t + sistema)); pct=$((proy * 100 / util2gb))
echo
echo "================ RESULTADO ================"
echo "Muestras tomadas:                       $n"
echo "La tienda (4 piezas) usó, en promedio:  $prom MiB"
echo "PICO de la tienda:                      $max_t MiB"
echo "Memoria total de esta máquina:          $tot MiB   (mínimo libre durante la prueba: $min_l MiB)"
echo
echo "Para un servidor de 2 GB (unos $util2gb MiB útiles):"
echo "  pico de la tienda + sistema (~$sistema MiB) = $proy MiB  ->  $pct % de la memoria"
if [ "$pct" -lt 70 ]; then echo "  VEREDICTO: 2 GB alcanzan con holgura."
elif [ "$pct" -lt 85 ]; then echo "  VEREDICTO: 2 GB alcanzan, pero JUSTO. Conviene agregar swap (ver el manual) y vigilar."
else echo "  VEREDICTO: 2 GB NO alcanzan con esta carga. Conviene un servidor de 4 GB."; fi
echo "Anota el pico y el veredicto en el Anexo B del manual."
