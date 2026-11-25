# Cambios del kit de despliegue, versión 1.3

Probado con el código del commit `a0d279d` (10 de noviembre de 2026), sin Docker, en un despliegue desde cero.

- `docker-compose.prod.yml`: ahora define **5 servicios**. Se agrega `expirador_pedidos`, que cancela los pedidos
  pendientes vencidos (cada 5 minutos) y corre el mismo programa que el backend, como usuario sin privilegios y
  después de que el backend esté sano (así no arranca antes de las migraciones). Las variables del backend quedan
  en un bloque compartido (`x-backend-env`) que usan los dos servicios.
- Variables nuevas en el backend y el expirador: `TUU_CALLBACK_BASE_URL` (se arma sola con el dominio),
  `PAYPAL_FX_MARGEN_PCT`, `PAYPAL_FX_MAX_EDAD_HORAS`, `PAYPAL_FX_REFRESCO_HORAS`, `BCCH_USUARIO`, `BCCH_CLAVE` y
  `DJANGO_SESSION_COOKIE_AGE`. Todas tienen valor por defecto: no hay que completar nada para que arranque.
- `produccion.env.example`: documenta las variables opcionales de PayPal en dólares y del cierre de sesión.
- `LEEME.md`: ahora son 5 servicios.

No cambian: `Caddyfile`, `entrypoint.sh`, `backend.Dockerfile`, `web.Dockerfile`, respaldos, `medir_memoria.sh`
(mide todos los contenedores `openmind-*`, incluido el expirador) ni la tienda de demostración.

Pendiente de probar: el arranque completo con `docker compose up` (solo se probó sin Docker) y las versiones de
las librerías de Python, que siguen sin fijar.
