# Cambios de la v1.4 del kit (código de develop del 15-nov-2026)

Reemplaza los nombres de variables que el código nuevo ya no lee y agrega las que necesita.

| Antes (v1.3) | Ahora (v1.4) | Por qué |
|---|---|---|
| `BCCH_USUARIO` y `BCCH_CLAVE` | `BCCH_TOKEN` | El código del tipo de cambio lee solo `BCCH_TOKEN`. |
| `DJANGO_SESSION_COOKIE_AGE` | `DJANGO_ADMIN_SESSION_COOKIE_AGE` (1800) y `DJANGO_CUSTOMER_SESSION_COOKIE_AGE` (30 días) | Administrador y cliente tienen sesiones distintas. |
| (no existía) | `ADMIN_SESSION_INACTIVITY_TIMEOUT_SECONDS` (1800) | Cierre por inactividad del administrador. |
| (no existía) | `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`, `GOOGLE_OAUTH_TOKEN_ENCRYPTION_KEY` | Conexión de Gmail del emprendedor. La redirección se arma sola con tu dominio; la clave la genera `preparar_env.sh`. |
| (no existía) | `STORE_MAIL_*` (envío externo apagado por defecto) y `STORE_MAIL_PUBLIC_API_URL` | Sistema de campañas por correo. |

## Si ya tienes un `.env` de la v1.3
No hace falta rehacerlo. Edita `deploy/.env`: cambia `BCCH_USUARIO`/`BCCH_CLAVE` por `BCCH_TOKEN` (si los usabas) y, solo si vas a conectar Gmail,
agrega `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` y una clave nueva en `GOOGLE_OAUTH_TOKEN_ENCRYPTION_KEY`
(se genera con `head -c 32 /dev/urandom | base64 | tr '+/' '-_'`). Todo lo demás tiene valor por defecto.

## Sin cambios en la estructura
Siguen los mismos 5 servicios. Las migraciones nuevas del proyecto (core 0036 y 0037, landing 0011 y 0012) se aplican solas al iniciar.
El comando `procesar_campanas` se ejecuta a mano por tienda y no requiere un servicio aparte.

## Pendiente de verificar
Esta versión no se ha probado en un servidor real. La revisión fue estática: nombres de variables contra `settings.py` del proyecto.
