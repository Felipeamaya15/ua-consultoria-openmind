# Correcciones y repetición de QA S9

Fecha: 17 de noviembre de 2026. Responsable: Patricio Jaramillo. Sin número Scrum: correcciones del último QA y revisión completa final del sistema.
Rama de entrega: `feature/correcciones-ultimo-qa-revision-final-sistema`.
Base Git: `81a41340aa5f5e59456ec863c213a7bd3316c3cc`.
Los cambios son locales y no se publicaron ni integraron a `develop`. `manifest.json` identifica los archivos de implementación y pruebas por SHA-256; el hash de base por sí solo no representa estos cambios sin commit.

## Fuente y correspondencia

Se revisaron las 13 páginas de `malo.informe.qa.pdf` (OM-QA-AP-001, versión 4.3), la página de problemas renderizada, las filas 13–17 y las capturas de los tres libros originales de `sprint9.zip`. Los archivos originales se conservaron intactos. Las observaciones del documento se trataron como hallazgos para contrastar, sin modificar sus decisiones ni marcas históricas.

| Observación | Resultado de esta revisión |
| --- | --- |
| SCRUM-508: cabecera, nombres y precios en tablet/móvil | La versión actual ya contiene reglas de ajuste de nombres y precios. No se reprodujo el fallo descrito con los datos sintéticos empleados: nombre largo de tienda, logo, producto largo y total $29.970. Se verificaron las cabeceras reales, carrito y precios en las cuatro plantillas a 360, 390, 768 y 1366 px. Se conserva evidencia; no se afirma que el antiguo commit de QA sea el actual ni que se haya probado toda personalización posible. |
| SCRUM-520: «Inscripciones a talleres» cortado | Reproducido. Se añadió `wrap` opcional a Tabs y se activó exclusivamente en Servicios y talleres. Ambos textos quedan completos sin desplazamiento horizontal. El comportamiento predeterminado de las demás pestañas se conserva. |
| SCRUM-515: publicación bloqueada y ayuda poco intuitiva | Se verificó el recorrido con exportador real y proveedor sintético: selección, JPG, preparación y confirmación autorizada. Cuando solo hay un enlace público, la ventana ahora permite descargar la imagen preparada, copiar la descripción y abrir Instagram, con pasos visibles. No se confunde guardar el perfil con conceder permisos de publicación ni una descarga con una publicación confirmada. |
| Búsqueda en tiempo real | Ya existe en ContentPicker. La prueba en navegador escribe «Taza», selecciona el resultado y compone la publicación. |
| Mis borradores | Se movió el acceso junto a Guardar borrador. Al pulsarlo se abre el listado y se lleva allí el scroll y el foco. No se descartan cambios de la publicación; se conservan los controles de apertura, duplicación y eliminación. |
| Configuración de Instagram | Se añadió una guía plegable con los pasos de autorización y el acceso a Instagram. Se conserva la integración oficial, el consentimiento y las comprobaciones del servidor. |
| QA514-01: seguimiento en_camino | Las pruebas actuales de Tracking reconocen en_camino y sus equivalencias. También pasó la suite de seguimiento y autorización del backend. No fue necesario cambiar los estados. |
| QA514-02: Google sin client_id | Se evita inicializar el hook y el proveedor de Google cuando falta el identificador. Login y checkout no ofrecen el método sin configurar. Con identificador, se delegan las mismas opciones al hook oficial. No se cambia la autenticación del backend. |
| QA514-04 y suites frontend desactualizadas | Se actualizaron fixtures para CSS, actividades, proveedor de carrito por sesión y namespace guest-v2; también la comprobación de registro, ahora ubicado en la barra lateral minimal. Se mantienen las aserciones funcionales de stock, reintento, doble envío, invitados y separación de tiendas. |
| SCRUM-523: imagen/video y movimiento reducido sin evidencia | Se ejecutó el carrusel real con fotografía y video WebM generado localmente. En las cuatro plantillas se verificó decodificación del video y avance automático normal; con movimiento reducido, no avanzó automáticamente ni arrancó el video. No requirió corrección del carrusel. |
| Blue Express / despliegue / porcentaje global | Se conservan sus límites: no se dieron de alta credenciales, no se emitieron despachos, no se hizo despliegue y no se inventó un porcentaje global de cumplimiento. |

## Resultados ejecutados

- **116 tests backend: aprobados.** Instagram (servidor HTTP local que simula Meta y concurrencia), autenticación, seguimiento, seguridad de seguimiento, pedidos del cliente y biblioteca multimedia SCRUM-521. PostgreSQL y MongoDB de QA; no se migró la base habitual.
- **129 tests frontend: aprobados.** Carrito, checkout y despacho en cuatro plantillas, invitado, autenticación, Google opcional, seguimiento, multimedia, marketing, borradores, editor, navegación, responsive y retorno de pagos.
- **16 escenarios responsive en navegador: aprobados.** Cuatro plantillas × cuatro tamaños. Se comprobaron superposición entre marca/navegación, cortes del nombre, precios sin desbordamiento, pestañas completas y errores JavaScript. Las cabeceras y el carrito se cargan desde el código real con contextos sintéticos. En editorial se monta la cabecera extraída del componente, sin sustituir su markup.
- **3 recorridos de Marketing en navegador: aprobados.** Anchos 360/768/1366, búsqueda, guardar/abrir borrador, foco en listado, descarga real JPG, alternativa sin conexión y preparación/confirmación con proveedor simulado. Se bloquearon las peticiones externas.
- **8 escenarios de carrusel: aprobados.** Cuatro plantillas × movimiento normal/reducido, video válido generado localmente.
- TypeScript de aplicación y configuración: **aprobado**. Build Vite final: **aprobado**. `git diff --check`: sin errores.

Los números son tests y escenarios ejecutados; no representan cobertura de código ni el porcentaje de requisitos del proyecto.

## Entorno, preservación y límites

La primera ejecución de Instagram en `test_consultoria_db` fue rechazada por la protección `simulacion_fuera_de_qa`. Se repitió la ejecución completa con `DB_NAME=instagram_qa_s9` y `MONGO_DB_NAME=instagram_qa_s9`: 116/116 aprobadas. No se relajó la protección. La base de pruebas PostgreSQL fue eliminada por Django al terminar.

No se cambiaron modelos, migraciones, credenciales ni datos de clientes/pedidos. No se realizaron publicaciones externas, envíos de campañas, cobros o devoluciones reales. Las pruebas no certifican la cuenta real de Meta ni la operación comercial de Blue Express. El usuario todavía debe autorizar la cuenta profesional y el despliegue debe tener habilitada la integración para la publicación directa; la alternativa manual queda disponible.

Las correcciones de pagos de la revisión anterior se preservaron. En particular, sus pruebas de carrito y despacho ya no quedan pendientes por las fixtures descritas en el informe anterior.

## Evidencia

- [Resultados frontend](frontend-tests.txt), [resultados backend](backend-tests.txt).
- [Mediciones responsive](responsive-results.json), [recorridos Marketing](marketing-tests.txt), [carrusel](carousel-tests.txt).
- [Carrito móvil y pestañas completas](carrito-movil.png).
- [Cabecera catálogo en tablet](catalogo-cabecera-tablet.png).
- [Cabecera visual en tablet](visual-cabecera-tablet.png).
- [Publicación autorizada simulada](instagram-autorizado-simulado.png).
- [Carrusel y movimiento reducido](carrusel-reducido.png).

## Repetir

Con dependencias frontend instaladas, Node en PATH y build generado:

```powershell
node --test frontend/tests/cart-checkout.cjs frontend/tests/checkout-shipping.cjs frontend/tests/guest-cart.cjs frontend/tests/auth-security.cjs frontend/tests/google-optional.cjs frontend/tests/tracking-states.cjs frontend/tests/order-tracking.cjs frontend/tests/multimedia-final.cjs frontend/tests/marketing.cjs frontend/tests/marketing-drafts.cjs frontend/tests/marketing-editor.cjs frontend/tests/marketing-navigation.cjs frontend/tests/sprint7-responsive.cjs frontend/tests/payment-return.cjs frontend/tests/sprint7-payment-security.cjs frontend/tests/transfer-validation.cjs
node frontend/tests/qa-s9-responsive.cjs
node frontend/tests/qa-s9-marketing.cjs
node frontend/tests/qa-s9-carousel.cjs
```

Las pruebas de navegador necesitan Playwright y Edge. `DASHBOARD_PLAYWRIGHT_MODULE` permite indicar la ubicación del módulo; `QA_S9_OUTPUT`, una carpeta para las evidencias. Carrusel requiere Python con PyAV y Pillow; `QA_PYTHON` permite indicar el ejecutable. Por defecto las evidencias quedan fuera del repositorio, en una carpeta temporal.

Backend aislado:

```powershell
docker exec -e DB_NAME=instagram_qa_s9 -e MONGO_DB_NAME=instagram_qa_s9 django_backend python manage.py test apps.instagram apps.core.test_order_tracking apps.core.test_tracking_security apps.core.test_customer_orders apps.authentication.tests apps.landing.test_scrum521 --noinput --verbosity 1
```
