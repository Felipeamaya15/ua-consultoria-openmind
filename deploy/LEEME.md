# Despliegue de producción de OpenMind E-commerce

Esta carpeta reúne todo lo necesario para poner la tienda en un servidor con Docker. **No modifica ningún archivo del proyecto**: se suma a él.
La guía completa, paso a paso y para personas sin conocimientos técnicos, está en el **Manual de despliegue** (PDF).

| Archivo | Para qué sirve |
|---|---|
| `docker-compose.prod.yml` | Define los 5 servicios (el quinto es el expirador de pedidos, que cancela los pedidos vencidos y devuelve su stock): base de datos de usuarios y pedidos, base de datos de productos, la tienda (Django con Gunicorn) y la página web con HTTPS (Caddy). |
| `backend.Dockerfile` | Construye la imagen de la tienda (Django) para producción. |
| `web.Dockerfile` | Compila la página (React) y la entrega con Caddy. |
| `Caddyfile` | Configuración de Caddy: candado HTTPS automático, reparto de rutas y límites. |
| `settings_produccion.py` y `urls_produccion.py` | Dos ajustes mínimos para producción (estilos del administrador e imágenes de la tienda). Se suman a `backend/config` al construir la imagen. |
| `entrypoint.sh` y `healthcheck.py` | Arranque del backend (migraciones, índices, estilos, Gunicorn) y comprobación de que está sano. |
| `produccion.env.example` | Plantilla de variables. No se edita: `preparar_env.sh` genera `deploy/.env` a partir de ella. |
| `preparar_env.sh` | Crea `deploy/.env` con claves y contraseñas aleatorias. |
| `backup.sh`, `restore.sh` | Respaldo y restauración de las dos bases de datos y las imágenes. |
| `actualizar.sh` | Respalda, descarga la versión nueva y reinicia la tienda. |
| `medir_memoria.sh` | Mide cuánta memoria usa la tienda mientras la usas y dice si un servidor de 2 GB alcanza. |
| `medir_disco.sh` | Mide cuánto disco ocupa la tienda (bases de datos, imágenes subidas, programas y caché de compilaciones). |
| `demo/` | Tienda de demostración con datos ficticios (productos, pagos, despachos, promociones) para hacer pruebas. Solo para pruebas. |
| `*.dockerignore`, `.gitattributes` | Evitan que entren secretos a las imágenes y mantienen los scripts con el formato correcto para Linux. |

Comandos principales (desde la carpeta principal del proyecto):

```
bash deploy/preparar_env.sh tutienda.cl
docker compose -f deploy/docker-compose.prod.yml up -d --build
docker compose -f deploy/docker-compose.prod.yml ps
```
