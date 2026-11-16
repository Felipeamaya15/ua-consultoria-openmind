# Instagram en OpenMind: Unified Login y SUAT

La conexión se administra en **Página principal → Contacto y horarios → Instagram**. El enlace público de Instagram y Facebook sigue siendo independiente de la autorización. Marketing conserva la difusión manual y permite revisar un JPG cuadrado del editor antes de confirmar una publicación individual.

## Contrato de Meta

Unified Login requiere un portafolio empresarial y una configuración `config_id`. El navegador abre `https://www.facebook.com/dialog/oauth` con `client_id`, `config_id`, `redirect_uri`, `response_type=code`, `override_default_response_type=true`, `prompt=login` y un `state` generado por el servidor. No se envía `scope` en la URL. No se consulta `/me/accounts` ni se requiere una página vinculada. [Inicio oficial](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-unified-login/get-started), [Facebook Login for Business](https://developers.facebook.com/documentation/facebook-login/facebook-login-for-business).

Seleccionar únicamente el activo Instagram y estos permisos en la configuración: `instagram_basic`, `instagram_manage_messages` (requisito del acceso Unified Login) e `instagram_content_publish`. Desactivar anuncios y comentarios que incluya la configuración inicial de Meta. El backend rechaza permisos adicionales, salvo `public_profile` si Meta lo incorpora como permiso implícito de login. OpenMind no utiliza ese permiso ni implementa consultas, suscripciones, webhooks o envíos de mensajes. [Permisos](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-unified-login/permissions).

Las operaciones servidor a servidor utilizan exclusivamente `graph.facebook.com/v27.0`:

| Método/ruta | Uso |
|---|---|
| `GET /oauth/access_token` | Intercambiar el código con las credenciales de la app de Meta y el mismo redirect URI. |
| `GET /debug_token` | Validar app, vigencia, tipo `SYSTEM_USER` y permisos efectivos. |
| `GET /me?fields=client_business_id` | Obtener el portafolio del SUAT; `/me` no es la cuenta de Instagram. |
| `GET /me/assigned_instagram_accounts?fields=id,username` | Obtener la cuenta compartida. Compartir exactamente una cuenta para esta tienda. |
| `GET /{IG_ID}?fields=id,username` | Verificar identidad de Instagram. |
| `POST /{IG_ID}/media` | Crear contenedor del JPG mediante `image_url` y descripción. |
| `GET /{CONTAINER_ID}?fields=status_code` | Consultar procesamiento o reconciliar un resultado incierto. |
| `POST /{IG_ID}/media_publish` | Publicar una sola vez con `creation_id`, tras confirmación explícita. |

[Autenticación](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-unified-login/authentication), [Debug Token](https://developers.facebook.com/docs/graph-api/reference/debug_token/), [Publicación oficial](https://developers.facebook.com/documentation/instagram-platform/content-publishing).

## Configuración del servidor

No colocar secretos en variables `VITE_*`. Las variables del servidor figuran en `.env.example` y `docker-compose.yml`:

| Variable | Valor esperado |
|---|---|
| `META_APP_ID` | App ID de Meta. |
| `META_APP_SECRET` | App Secret de esa app, solo en configuración privada. |
| `META_CONFIG_ID` | Configuración de Unified Login compatible con Instagram y token SUAT. |
| `INSTAGRAM_TOKEN_ENCRYPTION_KEY` | Clave Fernet independiente, persistente y respaldada de forma privada. Cambiarla invalida los tokens cifrados existentes. |
| `INSTAGRAM_REDIRECT_URI` | URL HTTPS exacta, incluida `/api/instagram/oauth/callback/` y su barra final. Registrar la misma URL en Meta. |
| `INSTAGRAM_FRONTEND_ORIGIN` | Origen HTTPS del panel al que vuelve el navegador; sin ruta. |
| `INSTAGRAM_MEDIA_PUBLIC_ORIGIN` | Origen HTTPS público de la entrada restringida; sin ruta. |
| `INSTAGRAM_API_VERSION` | `v27.0`, validada con la documentación consultada. |
| `INSTAGRAM_PUBLISHING_ENABLED` | **`0`**. Cambiar únicamente tras autorización expresa para publicar. |
| `INSTAGRAM_DAILY_LIMIT` | Límite local por tienda, predeterminado `20`, máximo `100`. |

Se necesita aplicar `instagram.0001_initial` al incorporar la integración. Esta implementación no modifica tablas de Gmail ni reutiliza su clave de cifrado. No ejecutar migraciones contra una base habitual durante la preparación de QA.

El SUAT se conserva cifrado junto con el portafolio, usuario del sistema, cuenta Instagram y `config_id`. Se admite vencimiento nulo cuando Meta informa `expires_at=0`; si existe vencimiento de acceso a datos se aplica el más próximo. Un token sin vencimiento programado aún puede ser revocado. **Renovar autorización** inicia un nuevo consentimiento con Unified Login: no usa `ig_refresh_token` ni solicita `business_management`. Desconectar elimina el token local e invalida estados e imágenes pendientes. Para retirar también la autorización en Meta, el propietario elimina la app desde Aplicaciones conectadas del portafolio; la interfaz lo indica y no afirma haber revocado remotamente.

## HTTPS local y túnel limitado

`backend/scripts/instagram_https_local.py` sirve el build privado y la API local únicamente en `127.0.0.1`. El certificado y el build deben quedar fuera del repositorio. `--generate-cert` crea un certificado autofirmado local sin instalar confianza en Windows. Ese certificado no sirve como redirect público para Meta.

`backend/scripts/instagram_public_gateway.py --api-port 8005 --port 8445` inicia una segunda entrada HTTP **solo en loopback**. Cloudflare termina HTTPS y conecta exclusivamente con ella:

```powershell
cloudflared tunnel --url http://127.0.0.1:8445 --protocol http2 --no-autoupdate
```

La entrada permite solo `GET /api/instagram/oauth/callback/` y `GET /api/instagram/imagenes/{UUID}/?firma=...`. El resto devuelve 404; los demás métodos, 405. No apuntar el túnel directamente a Django, Vite, PostgreSQL o MongoDB. El gateway no retransmite cabeceras de autorización, oculta errores del backend y no registra consultas ni cookies.

El inicio privado devuelve un ticket de un solo uso en la misma ruta del callback (`?inicio=...`). Una navegación de primer nivel al dominio del túnel consume el ticket, establece allí la cookie Secure/HttpOnly/SameSite=Lax y redirige a Meta. Así el callback público comprueba el navegador sin publicar el endpoint de inicio OAuth ni depender de cookies de terceros. `state` y ticket vencen en 10 minutos, se almacenan mediante hashes y se consumen una sola vez. Nunca construir un enlace con un `state` fijo o con el literal `<STATE>`.

Un Quick Tunnel es temporal: al reiniciarlo puede cambiar el hostname. Actualizar entonces el callback registrado y las dos variables de origen público. Mantener el proceso activo durante el consentimiento.

## Imagen temporal y duplicados

Solo se acepta un JPG individual de 1080 × 1080 y hasta 8 MB generado por el editor. El backend verifica el formato y retira metadatos. La firma identifica únicamente esa copia, vence en una hora y no permite listar ni navegar por la biblioteca. El archivo solo se entrega mientras existe una confirmación pendiente y la misma autorización continúa activa. Después de publicarse, desconectar o vencer, responde 404. En producción no crear un alias público general de `MEDIA_ROOT` que exponga `instagram/` o la biblioteca privada.

La preparación no llama a Meta. El backend exige confirmación explícita, la variable operativa habilitada y HTTPS público antes de crear el contenedor. Guarda reservas duraderas antes de las escrituras remotas y deduplica por tienda, cuenta, JPG y descripción. Un timeout, respuesta inválida o 5xx después de una escritura conserva un resultado incierto: consultar el contenedor sin repetir la publicación. Si no se recibió un ID de contenedor, el resultado requiere comprobación manual posterior; no existe reintento automático que pueda duplicar contenido.

Programar `python manage.py limpiar_instagram_media` sobre el almacenamiento correspondiente para eliminar archivos vencidos y conservar el registro de resultados.

## QA y conexión local real

`config.qa_instagram` exige bases dedicadas `instagram_qa_*` y fuerza el transporte hacia el simulador HTTP local. Solo allí se habilitan publicaciones simuladas. `frontend/tests/instagram.sim.yaml` y su escenario reproducen OAuth SUAT, cuenta compartida, contenedores, procesamiento y 5xx después de aceptación. No se despliegan esos mocks ni se envía su historial a Postman.

`config.instagram_local` exige bases separadas `instagram_qa_oauth_*`. Lee exclusivamente las variables Instagram de `INSTAGRAM_LOCAL_CONFIG`, un archivo externo al repositorio; los archivos subidos se guardan en `INSTAGRAM_LOCAL_OUTPUT`. Utiliza los hosts oficiales y no activa simulación. Los correos quedan en memoria y las publicaciones permanecen deshabilitadas con la configuración privada inicial.

Las pruebas de navegador se ejecutan con `INSTAGRAM_QA_OUTPUT` apuntando a evidencias externas y `DASHBOARD_PLAYWRIGHT_MODULE` al Playwright instalado: `node tests/instagram-browser.cjs`. Requieren fixtures sintéticas, build externo y gateway apuntando al backend simulado. No ejecutar ese arnés contra el backend con credenciales reales: la prueba intercepta el consentimiento y prueba publicaciones simuladas.

La conexión a la cuenta real requiere el consentimiento del propietario desde el panel. Una compilación o una respuesta simulada no demuestra aceptación real de Meta. Las publicaciones reales requieren autorización adicional y explícita.
