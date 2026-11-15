# SCRUM-522 — Cierre funcional y validación

Fecha: 14 de noviembre de 2026. Rama conservada: `feature/textos-portada-por-imagen`; HEAD `72a46ee`. Todos los cambios permanecen locales, sin staging, commits ni integración.

**La configuración Gmail está centralizada en Página principal → Negocio. Campañas muestra solo su resumen. Correos permanece idéntico al original del equipo.** La funcionalidad final está disponible y probada en QA; para utilizar la nueva autorización en la base habitual falta aplicar `core.0036_autorizacion_correo_y_verificacion`, que **no se aplicó allí**.

## Funcionalidades finales

### Negocio y autorización del remitente

Se reutiliza el campo existente `correo_negocio` y el componente `MailConnectionPanel`. Guardar la dirección no crea una conexión ni concede permisos. La autorización de uso comienza desmarcada y contiene el texto solicitado: «Autorizo el uso de esta cuenta para enviar campañas publicitarias a clientes autorizados y responder consultas de servicios y talleres».

El backend exige aceptación explícita, versión vigente y la misma dirección guardada en Negocio. Primero registra una intención vinculada al estado OAuth; la autorización vigente solo se registra cuando el callback confirma esa misma cuenta. Se conservan el cifrado Fernet, el estado de un solo uso con diez minutos de vigencia, la validación de identidad/permiso Google y la renovación de tokens. No se entregan tokens al frontend.

Se registra propietario, dirección, fecha, versión y texto en la autorización y su historial. Cambiar el correo guardado invalida la autorización y cualquier flujo pendiente; cambiarlo de nuevo a la dirección anterior no reactiva el permiso. Desconectar elimina las credenciales locales y trata de revocar el acceso del proveedor. Reconectar exige otra aceptación explícita.

Negocio muestra cuenta, estado registrado, autorización, modo de envío, prueba controlada, reconexión y desconexión. Las acciones no guardan accidentalmente el formulario. La prueba se dirige exclusivamente al propietario o a la cuenta conectada. En Mailpit comprueba el transporte local; no certifica la vigencia de una cuenta Gmail real. El backend conserva los fallos de renovación que exigen reconexión.

El envío externo requiere simultáneamente habilitación administrativa, OAuth, cifrado válido, permiso vigente para la misma cuenta/propietario y configuración completa. Tras reservar un envío de forma durable, se bloquea y comprueba de nuevo la cuenta antes de contactar al proveedor. La desconexión o cambio concurrente no permite usar una autorización anterior. Iniciar una reconexión tampoco rehabilita un token que ya consta como revocado.

### Contactos → Campañas

Solo se muestra «Correo para campañas», dirección y estado, con acceso a Página principal → Negocio. El resumen no contiene configuración OAuth, casilla de autorización, prueba ni desconexión.

Se conserva la gestión persistente de borradores, revisión, destinatarios autorizados, un producto opcional por campaña, imagen, texto, botón/enlace, personalización, HTML de vista previa generado por backend, confirmación explícita, cola, reintentos acotados, cancelación, estados y registro. Se mantienen límites por tienda/cuenta, claves de idempotencia, procesamiento individual y protección de resultados inciertos. Una aceptación del proveedor no se presenta como entrega, apertura o lectura.

Mailpit permite pruebas sintéticas locales sin obligar a conectar una cuenta real. Ese modo no habilita envíos externos. Los eventos y plantillas transaccionales mantienen su servicio anterior.

### Contactos y consentimiento vigente

La búsqueda normaliza correos; los filtros de autorización, fecha, paginación y limpieza se comprobaron contra PostgreSQL y desde navegador. El período se refiere al **último pedido**, como indica la interfaz: los contactos sin pedidos quedan fuera de un filtro por fecha de pedido.

«Autorizado» usa el mismo criterio completo que campañas y exportaciones: estado, verificación, fechas de autorización/verificación, versión y evidencia. Un registro histórico incompleto aparece pendiente. La comprobación no añadió una consulta adicional al listado: se conserva el límite original de rendimiento. Buscar otra vez con los mismos filtros vuelve a consultar; regresar a la ventana también actualiza el listado. Aplicar o limpiar filtros reinicia la paginación.

Las exportaciones promocionales contienen solo destinatarios elegibles y no datos de pedidos. El propietario no puede conceder publicidad por terceros. La selección de campañas se revalida al confirmar y antes de enviar, incluyendo revisión del consentimiento y bajas.

### Preferencias comerciales en las cuatro plantillas

Se reutiliza la página compartida existente sin modificar layouts, CSS o el diseño de las plantillas. Un cliente autenticado con prueba de correo acreditada por el backend puede activar/desactivar publicidad y guardar directamente. Se muestra su correo y estado actual; no existe un campo para cambiar el destinatario de esa operación.

`/api/consentimiento/mi-preferencia/` acepta únicamente la preferencia y la versión del texto. El correo procede del usuario autenticado; un email/usuario/estado adicional se rechaza. El propietario, staff y visitantes no pueden usar este endpoint como clientes. Los cambios registran fechas, revisión, versión, texto, método y referencia de evidencia; repetir la misma preferencia es inocuo.

La verificación del buzón se guarda separada del consentimiento. Se acredita tras un acceso Google que ya validó `email_verified`, o al confirmar un enlace firmado con sesión del titular del mismo correo. Un registro, contraseña, sesión, pedido o cookie no se toma como verificación. Cambiar el correo del perfil elimina su prueba anterior. Retirar publicidad conserva la prueba del buzón para poder volver a autorizar directamente. Las cuentas históricas sin prueba deben confirmar el enlace o volver a acceder mediante Google verificado.

Visitantes y cuentas sin verificación conservan el enlace de confirmación. Una sesión vencida no bloquea el uso de un enlace válido. Se mantienen las bajas firmadas de campañas, la confirmación por POST, protección contra manipulación/repetición y el rechazo de enlaces de revisiones anteriores.

### Servicios y talleres, Correos y trabajo del equipo

Las respuestas siguen en Servicios y talleres, con borrador, revisión, aceptación e historial; no se trasladaron a otra sección. `Emails.tsx`, las plantillas transaccionales, sus variables dinámicas y el envío de emergencia permanecen sin cambios respecto del original del equipo. Se conservaron los avances de autenticación, carruseles, multimedia, personalización y las cuatro plantillas. El guardado de datos del negocio se amplió solo para invalidar la autorización de un correo cambiado, con error seguro y sin guardar el cambio si falla esa invalidación.

## Validación real

Los resultados y huellas están en [ajustes-funcionales-resultados.json](ajustes-funcionales-resultados.json). Los registros completos quedan en el respaldo local ignorado. Las capturas y [resultados de navegador](navegador-resultados.json) contienen exclusivamente QA sintética.

- Regresión integral del backend: **1.290 pruebas aprobadas en 214,089 s**, autenticación, landing, visual_config, core y catálogo. Incluye los casos finales de fallo al invalidar una autorización y revocación entre reserva y transporte.
- Pruebas dirigidas finales de consentimiento, OAuth, cuentas, filtros y campañas: **118 aprobadas**. Cubren rechazo de autorización ausente/caducada, cuenta diferente, cambios concurrentes, prueba del buzón, preferencia ajena, auditoría, exportación y límite original de consultas.
- Frontend: **44/44 archivos aprobados, 0 fallidos**, incluyendo SCRUM-522, consentimiento, autenticación, campos/variables automáticos, comunicaciones, consultas, multimedia, las cuatro plantillas y miniaturas. Las pruebas específicas incluyen nueve casos de SCRUM-522 y trece de consentimiento.
- Navegador real contra API/PostgreSQL/MongoDB QA y Mailpit: **33 comprobaciones aprobadas, sin errores JavaScript**. Incluye preferencias en las cuatro plantillas, tamaños de escritorio/tablet/móvil, visitante y cliente no verificado, enlace real de Mailpit, filtros/paginación/limpieza, consulta, producto/imagen/vista previa de campaña, confirmación, envío único, intento repetido sin duplicado, baja, historial, resumen, Negocio, prueba y desconexión.
- El inicio OAuth y su estado pasan por la API real; el proveedor Google se simula explícitamente en QA. El callback, cifrado y registro se ejecutan con el código real y PostgreSQL. Las pruebas HTTP de renovación/envío Gmail usan un servidor local simulado. **No se autorizó una cuenta real ni se acredita entregabilidad Gmail.**
- Postman local: **11 peticiones y 18 aserciones aprobadas**, sin publicación de resultados. Incluye restricciones de identidad, rechazo de entradas inseguras y concordancia de filtros.
- `npm run build`: aprobado, incluye TypeScript; Vite compiló en 7,26 s. `manage.py check`, plan QA y ausencia de nuevas migraciones de modelos se comprueban en la evidencia. `git diff --check`: comprobado al cierre.

Las primeras ejecuciones integrales detectaron diferencias del contenedor QA: PyAV ausente y CORS configurado para 5174 frente a fixtures históricas que exigen 5173. Se instaló **av 16.1.0**, declarado por el proyecto, solo en QA; los procesos de pruebas usan sus orígenes esperados y conservan bases aisladas. No se alteraron pruebas de pagos ni multimedia para ocultar esos errores. Una primera simulación de navegador interceptó demasiado ampliamente el dominio Google; se restringió al endpoint de autorización y el recorrido final terminó sin errores.

Las ejecuciones antiguas de 40/42 archivos y las 349/49 salidas del lanzamiento indiscriminado se conservan en sus evidencias históricas. No sustituyen estos resultados ni se afirma haber repetido todos los ejecutores históricos ajenos a la selección actual.

## Migraciones y datos

`landing.0011` y `0012` ya se aplicaron en una sesión anterior con autorización. Esta continuación añade **`core.0036_autorizacion_correo_y_verificacion`**: cinco campos de autorización en la conexión y dos tablas de auditoría/verificación. No elimina tablas/campos de negocio ni concede permisos automáticamente a credenciales antiguas.

Se respaldó la base QA y se aplicó allí la migración. La comprobación comparó las columnas y todas las filas previas de **45 tablas**: todas se conservaron. La fixture de navegador y las bases del test runner son independientes de la habitual. No se borraron usuarios, productos, pedidos, contactos, imágenes o volúmenes habituales.

El plan habitual se consultó **sin aplicar**: contiene únicamente la nueva `core.0036`. La autorización anterior para `landing.0011/0012` no se extendió a esta migración. Antes de aplicarla a la habitual se requiere un respaldo actualizado y recuperable y autorización expresa. Mientras está pendiente, la API de la nueva configuración puede responder 503 seguro; el resto del módulo Correos no depende de la tabla nueva.

## Gmail real y enlaces públicos

Procedimiento y rutas actuales en [COMO-PROBAR.md](COMO-PROBAR.md). Se conserva `STORE_MAIL_EXTERNAL_ENABLED=0`. Son necesarios client ID/secret, redirect URI exacta y clave Fernet estable en el servidor; nunca en frontend o Git. El titular debe elegir en Google el mismo correo que guardó en Negocio y autorizar el alcance de envío. Una prueba real requeriría autorización adicional para habilitar transporte externo; no se hizo.

`STOREFRONT_PUBLIC_URL` configura enlaces de tienda/productos; `STORE_MAIL_PUBLIC_API_URL` debe apuntar a la API pública HTTPS para las bajas. `COMMERCIAL_CONSENT_FRONTEND_ORIGIN` configura confirmación/gestión; si queda vacío deriva el origen de `STOREFRONT_PUBLIC_URL`. Se comprobó esa derivación con un dominio HTTPS sintético y el formato de enlaces mediante pruebas, sin conexiones a un dominio real.

Referencias primarias verificadas: [OAuth offline y refresh tokens](https://developers.google.com/identity/protocols/oauth2/web-server), [identidad y email verificado](https://developers.google.com/identity/openid-connect/reference).

## Archivos, respaldos e integración manual

Respaldo previo verificado: `backups/SCRUM-522-ajustes-funcionales-20261114-193123/`. Incluye originales, manifest de huellas, diff/estado iniciales, capturas previas y volcado QA. El inventario [archivos.json](archivos.json) distingue este ajuste de los cambios locales anteriores. La evidencia final comprueba archivos conservados, ausencia de staging y rama/HEAD intactos.

Se aplicó la guía API Engineer/API Testing de Postman y se revisaron hooks, limpieza de efectos, controles de formulario, accesibilidad y tipos con React Best Practices. No se publicó en servicios externos.

Los commits, push y merge siguen exclusivamente a cargo de la usuaria. La comparación remota documentada anteriormente no se volvió a actualizar en este ajuste. Al integrar, revisar las dos hojas de migración core: la remota `0036_tipocambioguardado` y esta nueva autorización dependen de `0035` y requieren conciliación del grafo. No se generó una mezcla ni se ejecutó ningún comando Git prohibido.

Se mantiene el aviso previo de que el origen remoto rastrea `backup_mongodb.archive`; la regla ignore no elimina su historial. Revisarlo manualmente con el equipo antes de integrar. Los entornos autenticados, clave QA, volcados y respaldos locales siguen ignorados.

## Limitaciones y pendientes

1. **Pendiente para la habitual:** autorización y aplicación de `core.0036`, con respaldo actualizado previo. Ninguna escritura habitual se realizó en esta continuación.
2. **Gmail real:** pendiente de OAuth del titular y eventual autorización de ensayo externo. La simulación y Mailpit no certifican entrega real.
3. Integración manual y conciliación de cambios/migraciones remotos, sin pérdida del trabajo previo.
4. Se conserva el modelo existente de una tienda por instalación, un producto opcional por campaña y aceptación del proveedor sin métricas inventadas de lectura/entrega. Las suites históricas fuera de la selección no se certifican como repetidas.
