# Continuidad propuesta después del Sprint 8

Evaluación al 5 de noviembre de 2026. Las siguientes son propuestas, no funciones habilitadas ni compromisos de servicios externos.

| Función | Estado actual | Complejidad y dependencias | Riesgos y propuesta | Prioridad sugerida |
|---|---|---|---|---|
| Servicios comprables | Secciones editables, precio informativo y consultas; no son productos comprables | Alta; catálogo, líneas de pedido, precios del servidor y reglas de entrega mixta | Introducir tipo de ítem físico/servicio, conservar snapshots comerciales y eliminar despacho solo cuando toda la orden sea digital. Probar órdenes mixtas y regresión de productos físicos | Diseño en Sprint 9; implementación en continuidad |
| Talleres pagados | Inscripciones exclusivamente gratuitas, con cupos transaccionales | Alta; reserva temporal, pago verificado, vencimientos y conciliación | Vincular reserva a línea de orden y evento confirmado del proveedor, con idempotencia, cancelación y liberación de cupos. Definir devoluciones con el negocio antes de codificarlas | Continuidad, después del diseño de servicios comprables |
| Avisos de consultas/inscripciones | Servicio de correo existente; entorno local configurado para consola | Media; SMTP real o proveedor aprobado, remitente verificado y cola de trabajo | Reutilizar `email_service`, ejecutar después del commit, registrar resultado real y reintentos idempotentes. La recepción válida no se revierte por fallo SMTP. No enviar enlaces de reunión a correos sin verificar | Buen candidato para Sprint 9, condicionado a SMTP y verificación del destinatario |
| Publicación automática | Perfiles registrados y difusión manual; sin OAuth | Alta; aplicación Meta, cuentas compatibles, permisos, revisión y almacenamiento seguro de tokens | Conexión explícita por tienda, renovación/revocación, cola y recibo verificable del proveedor; jamás contraseñas sociales ni tokens en navegador o Git | Prueba técnica en Sprint 9 solo si hay aplicación/cuentas de prueba; continuidad para producción |
| Videos propios ≤30 s | Deshabilitados; solo imágenes y enlaces externos | Alta; analizador, transcodificación, almacenamiento y entrega de video | Pipeline separado con cuarentena, límites de CPU/memoria/tiempo y publicación solo tras procesar. No confiar en duración o MIME enviados por el navegador | Continuidad; Sprint 9 puede validar infraestructura |

## Meta: investigación de publicación automática

La [colección oficial de Instagram de Meta](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api) documenta cuentas profesionales Business/Creator. Con Facebook Login requiere una Página vinculada; enumera `pages_show_list`, `instagram_basic`, `instagram_content_publish` y `pages_read_engagement`. Stories se limita a cuentas Business en ese flujo. Reels usa creación de contenedor, consulta hasta estar listo y `media_publish`; el video debe ser alcanzable por Meta. La colección incluye requisitos de formato y codec que deben revalidarse antes de implementar.

El [flujo oficial con Instagram Login](https://www.postman.com/meta/instagram/folder/1z5vxzu/instagram-api-with-instagram-login) distingue sus permisos `instagram_business_basic` y `instagram_business_content_publish`; no deben mezclarse con los del flujo Facebook Login.

Para Facebook se prevé publicación en Páginas con token de Página y permiso `pages_manage_posts`, además de los permisos de lectura/listado necesarios. La revisión directa de [publicaciones de Pages](https://developers.facebook.com/docs/pages-api/posts/), [permisos](https://developers.facebook.com/docs/permissions#pages_manage_posts) y [App Review](https://developers.facebook.com/docs/app-review/) quedó limitada por respuestas 429 o páginas inaccesibles. Estos requisitos de Facebook, el acceso avanzado para cuentas de terceros y la posible verificación empresarial deben confirmarse desde la consola Meta antes de cerrar el alcance. No se considera una integración aprobada.

Propuesta propia: elegir un solo flujo OAuth, validar `state` y redirecciones, asociar autorización a propietario/tienda y cuenta remota, cifrar tokens en servidor con clave independiente, registrar caducidad/permisos sin registrar el token, y permitir desconectar/revocar. La biblioteca privada no se convierte en un repositorio público permanente: para publicación automática necesitaría una entrega temporal controlada para el proveedor. Crear una cola con estados preparada/enviando/confirmada/fallida, ID remoto y reintentos que no dupliquen publicaciones. Imágenes, carruseles, Reels e historias necesitan validaciones y permisos específicos; no se deducen capacidades a partir del perfil registrado.

No se verificó una tarifa contractual de API ni se promete gratuidad. Estimar por separado alojamiento, colas, almacenamiento, transferencia y soporte. No hay credenciales Meta disponibles ni se solicitó ninguna contraseña.

## Video propio: propuesta verificable

En el contenedor actual no están disponibles `ffprobe` ni `ffmpeg`; el Dockerfile solo instala las dependencias de PostgreSQL. La comprobación local observó unos 18 GB libres en un disco al 97% de ocupación. Esa cifra no constituye capacidad reservada ni garantiza almacenamiento para producción.

Propuesta inicial a validar: entrada máxima de 20 MB, duración real entre 1 y 30 segundos, contenedor MP4/MOV, salida MP4 H.264/AAC de hasta 720p, miniatura y sin autoplay. No son límites ya implementados. El analizador debe ejecutarse aislado, actualizado, sin red, con tiempo/CPU/memoria limitados; rechazar archivos malformados, pistas inesperadas y duraciones indeterminadas. Generar un archivo normalizado antes de habilitar su uso público.

Se requieren cuotas y deduplicación por tienda, almacenamiento con limpieza de huérfanos basada en referencias, estados subiendo/procesando/listo/error, trabajos asíncronos, y una entrega con HTTP Range y controles de publicación equivalentes a los de imágenes. Los cuatro temas podrían reutilizar un bloque de video accesible con controles nativos y el mismo recurso por ID. Probar subida interrumpida, timeout, archivo que declara 30 s y dura más, codecs inválidos, agotamiento de cuota y revocación al ocultar la sección.

## Clave de credenciales de pago

`EncryptedTextField` usa Fernet. Cuando `PAYMENT_CREDENTIALS_KEY` está vacía, el código actual deriva una clave de `SECRET_KEY`. Compose ahora expresa esa ausencia opcional con `${PAYMENT_CREDENTIALS_KEY:-}`; no cambió ninguna clave ni pasarela y no se reescribieron credenciales.

Para una instalación nueva, antes de guardar credenciales, definir una clave Fernet válida en variables del entorno o en un gestor de secretos; conservarla estable y fuera de Git. Desarrollo y producción deben administrar sus propios secretos. No imprimirlos en reportes ni copiarlos a herramientas del navegador.

En una instalación con datos ya cifrados, **no basta con asignar una nueva clave**: los valores anteriores no se descifrarían. Planificar una migración controlada que lea con la clave anterior y vuelva a cifrar con la nueva, con respaldo protegido, prueba de lectura y plan de recuperación. Esa rotación requiere revisión y una ventana de mantenimiento; no se ejecutó en esta tarea.

## Operación y privacidad

Antes de varias réplicas, usar caché compartida para los límites de solicitudes y un proxy que gestione IP y límites de carga. Definir retención y eliminación de datos personales, trazabilidad de cambios de estado y verificación segura de correo antes de entregar enlaces privados a participantes. Las consultas siguen separadas de las inscripciones y del consentimiento publicitario.
