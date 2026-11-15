# Probar SCRUM-522

## Entorno habitual

Las migraciones landing 0011 y 0012 ya estaban aplicadas con autorización. **La nueva `core.0036_autorizacion_correo_y_verificacion` está pendiente en la habitual**: no aplicarla sin respaldo recuperable actualizado y autorización expresa. Para comprobar ahora las funciones nuevas, utilizar QA en 5174/8001. Después de aplicar la migración autorizada, el [panel habitual](http://localhost:5173/emprendedor) y [Mailpit](http://localhost:8025) usan los mismos recorridos. No borrar volúmenes.

0. **[Página principal → Negocio](http://localhost:5173/emprendedor/landing#informacion-negocio):** completar y guardar el campo existente «Correo del negocio». Guardarlo no conecta ni autoriza Gmail. Marcar la autorización expresa y pulsar Conectar Gmail; elegir esa misma cuenta en Google. El estado, prueba controlada, reconexión y desconexión se administran únicamente aquí. Cambiar la dirección guardada exige otra autorización; los controles OAuth no guardan el formulario por accidente.

1. **Correos:** mantiene exclusivamente el módulo anterior de correos automáticos, sus plantillas, variables dinámicas, vista previa, guardado y envío de emergencia. No contiene la conexión Gmail agregada por SCRUM-522.
2. **Contactos:** buscar correo, abrir Más filtros y elegir consentimiento. El menú Exportar ofrece contactos operacionales y exportaciones de marketing; estas últimas incluyen solo autorizados verificados y no datos de pedidos.
3. **[Contactos → Campañas](http://localhost:5173/emprendedor/contactos?vista=campanas):** arriba se encuentra únicamente «Correo para campañas», con la cuenta/estado y acceso a Negocio. Se mantiene el editor: crear un borrador, elegir destinatarios autorizados, producto opcional, imagen pública y texto/enlace del botón. Guardar, recargar y abrir el borrador. Guardar y previsualizar no envía correo.
4. **Campaña:** revisar el HTML generado, hacer prueba al propietario y abrir «Confirmar envío promocional». El modal final indica el modo de envío. Confirmar solo una prueba sintética cuando corresponda. El resultado correcto es «Aceptada por el proveedor», no «entregada» o «leída». Consultar el registro de intentos; continuar pendientes o reintentar únicamente fallos definitivos. Cancelar conserva registros anteriores.
5. **Servicios y talleres → Solicitudes de información:** abrir consulta, redactar, guardar y revisar envío. Enviar una respuesta sintética, consultar aceptación e historial. Una consulta no se marca respondida si el envío falla.
6. **Baja:** desde un correo promocional capturado, abrir Cancelar suscripción y confirmar la baja. El contacto deja de ser elegible. No usar contactos de clientes reales para esta comprobación.
7. **Preferencias comerciales:** abrir `/plantilla/1/preferencias-comerciales` (también 2, 3 y 4). Con un cliente cuyo buzón esté acreditado, marcar/desmarcar publicidad y Guardar preferencia. El correo no es editable. Con una cuenta sin verificación o sin sesión, solicitar/confirmar el enlace. Iniciar sesión con contraseña no verifica un correo; Google con email verificado o la confirmación de enlace con sesión de ese titular sí registran prueba. Un cambio de correo del perfil requiere otra prueba. Retirar publicidad no borra la verificación del buzón.

En Contactos, el período es la fecha del **último pedido**. Comprobar búsqueda de correo, autorización, Siguiente/Anterior y Limpiar. Los contactos sin pedidos no aparecen al aplicar fechas de pedido. Repetir Buscar actualiza también filtros idénticos.

Los controles de Gmail real se describen abajo. Mailpit no necesita conexión Google.

## Conectar Gmail real, sin habilitar envíos externos

El backend necesita `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI` y una clave Fernet estable en `GOOGLE_OAUTH_TOKEN_ENCRYPTION_KEY`. La presencia de esos valores se había comprobado en una sesión anterior; no se mostraron ni se modificaron durante estos ajustes.

1. Tras aplicar con autorización la migración pendiente, entrar como propietario a [Página principal → Negocio](http://localhost:5173/emprendedor/landing#informacion-negocio), guardar Correo del negocio y marcar la autorización de uso, que empieza desmarcada.
2. Pulsar Conectar Gmail o Reconectar Gmail. Completar personalmente la autorización en la ventana oficial de Google con **esa misma cuenta**. Una cuenta distinta se rechaza. Si Google informa aplicación en pruebas, la cuenta debe estar autorizada como usuario de prueba en el proyecto OAuth.
3. Autorizar identidad/correo y el permiso `gmail.send`. No se solicita leer la bandeja.
4. Tras la página «Correo conectado», volver al panel y pulsar Actualizar conexión. Debe mostrarse la dirección autorizada. Desconectar elimina la credencial local e intenta revocar la autorización en Google.

El redirect registrado en Google debe coincidir exactamente con `http://localhost:8000/api/tienda/correo/google/callback/` para ese entorno local, o con su URL HTTPS real en producción. La API Gmail debe estar habilitada. La clave de cifrado debe ser estable y mantenerse respaldada en almacenamiento de secretos.

**Conectar no habilita Gmail como transporte de envío.** Actualmente `STORE_MAIL_EXTERNAL_ENABLED=0` y el SMTP habitual es Mailpit. Para un futuro ensayo real dirigido solo al titular se necesitaría autorización expresa para configurar `STORE_MAIL_TRANSPORT=gmail` y `STORE_MAIL_EXTERNAL_ENABLED=1` en el backend y recargar su entorno. No se realizó ese cambio. Las campañas requieren además `STOREFRONT_PUBLIC_URL` y `STORE_MAIL_PUBLIC_API_URL` públicos y correctos; usar HTTPS en producción para los enlaces de producto y baja.

Documentación de referencia: [envío MIME en Gmail](https://developers.google.com/workspace/gmail/api/guides/sending), [autorización offline](https://developers.google.com/identity/protocols/oauth2/web-server#offline).

Para producción, usar por ejemplo `STOREFRONT_PUBLIC_URL=https://tienda.example.test/plantilla/1` y `STORE_MAIL_PUBLIC_API_URL=https://api.example.test`. `COMMERCIAL_CONSENT_FRONTEND_ORIGIN=https://tienda.example.test` determina el enlace de confirmación/gestión; vacío deriva automáticamente el origen de `STOREFRONT_PUBLIC_URL`. Los dominios de ejemplo no representan una instalación desplegada ni se contactaron.

## QA reproducible y aislada

El navegador se probó con PostgreSQL `scrum522_qa_browser_20261114`, MongoDB del mismo nombre y archivos en `backend/.pytest_cache/scrum522-qa-media`. La cuenta y todos los destinatarios son sintéticos. `config.qa_scrum522` rechaza otras bases y fuerza Mailpit y envío externo deshabilitado. No utilizar la base del test runner para las fixtures manuales.

La prueba E2E actual **se ejecutó con datos exclusivamente sintéticos** y aprobó 33 comprobaciones. Busca la configuración en Negocio, resumen en Campañas y ausencia en Correos. Prueba preferencias, enlaces reales de Mailpit, filtros y paginación, campañas, consultas, baja, idempotencia y tamaños de las cuatro plantillas. Las capturas actuales corresponden a ese recorrido. El dominio de autorización Google se intercepta únicamente en el endpoint OAuth; `qa_scrum522_oauth.py` ejecuta el callback real con un proveedor explícitamente simulado. No equivale a autorizar un Gmail real.

`config.qa_scrum522` utiliza client ID/secret y clave Fernet exclusivos de fixtures, dominios locales, Mailpit y bloqueo externo. La clave se guarda en `.pytest_cache` ignorada. Nunca usar ese módulo de settings para producción. `qa_scrum522_final_seed.py` prepara clientes verificado/no verificado, 24 contactos de filtro y sesiones vigentes; modifica solo QA y conserva el historial anterior. El entorno privado Postman incluye tokens sintéticos de esos clientes y no se comparte.

El contenedor de revisión creado en esta sesión se llama `scrum522_qa_final`. Para volver a usarlo después de detenerlo:

```powershell
docker start scrum522_qa_final
```

Para crear otro entorno desde cero, elegir un nombre de base QA nuevo, crear esa base vacía en PostgreSQL y ejecutar el servicio backend de revisión con estas variables:

```text
DB_NAME=scrum522_qa_...
MONGO_DB_NAME=scrum522_qa_...
DJANGO_SETTINGS_MODULE=config.qa_scrum522
DJANGO_CORS_ALLOWED_ORIGINS=http://localhost:5174
STOREFRONT_PUBLIC_URL=http://localhost:5174/plantilla/1
STORE_MAIL_PUBLIC_API_URL=http://localhost:8001
```

Publicar solamente el puerto QA 8001 hacia el 8000 del contenedor. Aplicar las migraciones **en esa base QA**, ejecutar `scripts/qa_scrum522_seed.py` desde `manage.py shell` con `SCRUM522_QA_PASSWORD` temporal, después `scripts/qa_scrum522_catalog.py` y finalmente `scripts/qa_scrum522_final_seed.py`. La fixture escribe un entorno Postman privado en `backend/.env.scrum522.postman.json`, ignorado por Git. No compartir ese archivo ni copiar secretos reales. Las cuentas de prueba están sujetas a expiración; la fixture final renueva exclusivamente las sesiones sintéticas.

Frontend de revisión:

```powershell
# Desde frontend/
$env:VITE_API_URL='http://localhost:8001'
npm run dev -- --port 5174 --strictPort
```

Validación reproducible de navegador, con una instalación disponible de Playwright y Microsoft Edge:

```powershell
# Desde frontend/; indicar la ruta local del módulo Playwright instalado
$env:DASHBOARD_PLAYWRIGHT_MODULE='<ruta al módulo playwright>'
node tests/scrum522-browser.cjs
```

La prueba verifica que la API sea Mailpit y la tienda tenga la identidad sintética antes de mutar datos. Usa una sesión de test, ejecuta peticiones reales al backend, verifica CSV, respuesta, campaña y doce combinaciones de plantilla/tamaño. Guarda evidencia sintética en `docs/scrum-522/`. La prueba no altera el CAPTCHA o la seguridad del servidor habitual. [Referencia sobre estado autenticado de pruebas](https://playwright.dev/docs/auth).

Postman local, desde la raíz:

```powershell
postman collection run docs/scrum-522/qa.postman_collection.json -e backend/.env.scrum522.postman.json --no-report-events --timeout-request 10000
```

La colección restringe el destino al servidor QA en puerto 8001. La comprobación sin sesión usa el otro hostname loopback para no heredar la cookie de las peticiones anteriores. La CLI puede mostrar un aviso de inicio de sesión para publicar en Postman Cloud; publicar no forma parte de esta validación.

Backend integral, usando las bases aisladas del contenedor QA. El proceso de pruebas usa los orígenes 5173 que esperan las fixtures históricas; eso no cambia el servidor de navegador QA en 5174. El runtime debe tener las dependencias de `backend/requirements.txt`, incluido `av==16.1.0`:

```powershell
docker exec -e DJANGO_SETTINGS_MODULE=config.settings -e STOREFRONT_PUBLIC_URL=http://localhost:5173/plantilla/1 -e DJANGO_CORS_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173 -e COMMERCIAL_CONSENT_FRONTEND_ORIGIN=http://localhost:5173 -e STORE_MAIL_TRANSPORT=auto -e STORE_MAIL_EXTERNAL_ENABLED=0 scrum522_qa_final python -c "import os; assert os.environ['DB_NAME'].startswith('scrum522_qa_') and os.environ['MONGO_DB_NAME'].startswith('scrum522_qa_'); from django.core.management import execute_from_command_line; execute_from_command_line(['manage.py','test','apps.authentication','apps.landing','apps.visual_config','apps.core','apps.catalog','--noinput','--keepdb'])"
```

El test runner crea/utiliza `test_scrum522_qa_browser_20261114`. Las pruebas Mongo utilizan sus bases temporales propias; no apuntar fixtures manuales a ellas. La guarda rechaza bases fuera del prefijo QA. No ejecutar estos ejemplos contra la base habitual ni usar comandos de borrado o limpieza de volúmenes.
