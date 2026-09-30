# Entorno local con Docker Compose

## Primera instalación

Desde la raíz de este repositorio, copie `.env.example` a `.env` solo si todavía
no existe. Configure su `DJANGO_SECRET_KEY` local; no sobrescriba un `.env`
existente. Para la demostración use `DJANGO_DEBUG=1` y `DEV_BOOTSTRAP=1`.

```powershell
docker compose up -d --build
docker compose ps
docker compose logs --tail 80 backend
```

Abra http://localhost:5173. El formulario está en
http://localhost:5173/plantilla/1/ingresar.

Cuenta de demostración: `emprendedor@gmail.com`, contraseña `123456`.
Son credenciales públicas exclusivamente para desarrollo.

## Después de actualizar develop

```powershell
git pull --ff-only
docker compose up -d --build
docker compose ps
docker compose logs --tail 40 backend
```

Espere a que el log indique `Starting development server` antes de entrar.
No necesita ejecutar Django, npm ni las migraciones fuera de Docker.
`docker compose down` permite detener el entorno conservando los volúmenes;
no es necesario ejecutarlo en cada actualización. No use `down -v` para actualizar.

## Qué hace el arranque

1. Espera los healthchecks de PostgreSQL y MongoDB.
2. `sync_mongo_indexes` autentica y crea los índices de catálogo idempotentemente.
3. `migrate --noinput` aplica las migraciones pendientes, incluida la migración
   inicial de `authentication.UserProfile`.
4. `bootstrap_dev` inicializa la demostración si `DEV_BOOTSTRAP=1` y `DEBUG=1`.
5. Inicia Django en el puerto 8000. El frontend inicia Vite en el 5173.

El bootstrap crea un usuario Django normal (sin permisos staff o superusuario)
y utiliza `configurar_tienda` para crear su tienda. Si existen, conserva contraseña,
permisos, nombre y propietario. Un correo ambiguo, username ocupado por otra cuenta,
cuenta inactiva o tienda con otro propietario detiene el bootstrap sin reasignar
datos; las escrituras de ese comando son atómicas. No restablece contraseñas.
Desactive `DEV_BOOTSTRAP` fuera del entorno de demostración.

El volumen `postgres_data` conserva las cuentas, contraseñas, tokens, tiendas y
migraciones. `mongo_data` conserva documentos, índices y usuarios MongoDB.
Eliminar contenedores no elimina estos volúmenes. Una base distinta o un volumen
nuevo no hereda las cuentas del anterior.

## MongoDB: conexión y credenciales persistidas

Compose pasa `MONGO_USER` y `MONGO_PASSWORD` como
`MONGO_INITDB_ROOT_USERNAME` y `MONGO_INITDB_ROOT_PASSWORD`. La imagen crea ese
usuario en `admin` durante la primera inicialización del volumen.
`MONGO_INITDB_DATABASE=${MONGO_DB_NAME}` no cambia la base de autenticación del root.

Django ya construye su URI con `authSource=admin`, host `mongodb`, puerto interno
27017. `get_mongo_db()` selecciona `MONGO_DB_NAME` para los documentos; con los
valores del equipo es `consultoria_nosql`.

El entrypoint de la imagen omite la inicialización cuando encuentra datos
(por ejemplo `/data/db/WiredTiger`). Cambiar `.env` no cambia la contraseña
almacenada en ese volumen. Lo mismo sucede con las variables iniciales de PostgreSQL.
`POSTGRES_PORT` cambia el puerto publicado al host; Django usa siempre `db:5432`.

Si reaparece `AuthenticationFailed`, compruebe primero el proyecto/directorio y
las credenciales con las que se inicializó el volumen. Restaure en `.env` las
credenciales válidas o haga una rotación autenticada con el administrador existente,
y recree los servicios con `docker compose up -d --build`. No reinicialice ni borre
datos para cambiar una contraseña. Si se desconocen las credenciales previas, se
necesita una recuperación planificada con respaldo; no existe un comando universal
seguro de reparación basado únicamente en el error 18.

## Frontend y autenticación

`VITE_API_URL=http://127.0.0.1:8000` es correcto: las solicitudes salen del navegador
del usuario, que llega al puerto publicado por Docker. Abra el frontend con
`http://localhost:5173`, origen permitido por CORS. El servicio `authService.login`
envía `username` (también acepta el correo) y `password` a `/api/auth/login/`.
Django valida la contraseña de `auth.User` en PostgreSQL y entrega un token;
`/api/auth/me/` valida ese token. Las cuentas de `core.Usuario` no reemplazan a
`auth.User` para este login.

El acceso Google depende además de la configuración externa de OAuth; no forma
parte de la validación del login con contraseña descrita aquí.

## Diagnóstico y validación del entorno local, 29 de septiembre de 2026

Se trabajó en `C:\Users\maria\Ecommerce\ua-consultoria-openmind`, rama `develop`.

- Antes de cambiar archivos, MongoDB autenticó correctamente a `admin_mongo` en
  `admin` y devolvió `ping: ok`. El volumen activo `ua-consultoria-openmind_mongo_data`
  fue creado el 29 de septiembre de 2026 a las 21:24:16 UTC. No se pudo reproducir
  el fallo histórico ni demostrar que este volumen usara credenciales anteriores.
  `authSource` ya era correcto y no se cambió.
- PostgreSQL aceptó las credenciales configuradas, pero no tenía tablas públicas:
  había 29 migraciones pendientes y el arranque no ejecutaba `migrate`.
- No existían fixtures, seeds ni comandos de arranque que crearan la cuenta demo.
  Sus credenciales solo estaban declaradas en `frontend/.../demoCredentials.ts`.
- Se añadió la migración faltante de `UserProfile`, quedando 30 migraciones.
- Se ejecutó `docker compose down` y `docker compose up -d --build`, conservando
  los volúmenes. Se aplicaron las 30 migraciones y el bootstrap creó cuenta y tienda.
- Las cinco pruebas de `apps.core.test_bootstrap_dev` pasaron en una base de pruebas
  creada desde cero. Cubren login y token, repetición conservando contraseña y
  tienda, activación opcional, rechazo fuera de DEBUG y conflictos de identidad.
- `makemigrations --check --dry-run`: sin cambios pendientes.
- El login real desde React llegó al panel `/emprendedor`.
- Tras reiniciar el backend, no había migraciones pendientes y se conservaron
  cuenta y tienda. Login y `/me/` con token: HTTP 200; contraseña incorrecta y
  `/me/` sin token: HTTP 401. CORS devolvió `http://localhost:5173`.
- El contenedor permaneció `running`, con `RestartCount=0` y sin
  `AuthenticationFailed` en los logs del arranque validado.

La reparación local ya quedó aplicada. Para repetir ese ciclo de verificación:

```powershell
Set-Location 'C:\Users\maria\Ecommerce\ua-consultoria-openmind'
docker compose down
docker compose up -d --build
docker compose ps
docker compose logs --tail 80 backend
```

No fue necesario borrar volúmenes ni rotar credenciales MongoDB/PostgreSQL.
En el `.env` local únicamente se agregó `DEV_BOOTSTRAP=1`; se conservó
`DJANGO_SECRET_KEY` sin exponerla.
