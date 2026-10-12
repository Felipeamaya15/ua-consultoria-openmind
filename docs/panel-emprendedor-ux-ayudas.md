# Panel emprendedor: textos y ayudas

## Alcance

Mejora de presentación y lenguaje del panel general del emprendedor. Se conservan los contratos, permisos, operaciones de productos, pedidos, pagos y entregas. No se modificó el editor visual para esta tarea. Los cambios anteriores del repositorio se conservaron; no se hizo commit ni push.

## Descripciones por página

`AdminPageHeader`, montado por `AdminLayout`, presenta título, descripción y botón de ayudas. Admite además ayuda y acción opcionales. `pageHelp.ts` define las descripciones de Resumen, Página principal, Productos, Pedidos, Diseño, Promociones, Pagos, Entregas, Acceso de clientes, Correos, Buscadores y visitas, Configuración, Páginas legales y Perfil. Las rutas anidadas de productos y páginas legales conservan su contexto; el editor visual queda excluido.

En Página principal se reemplazó exactamente:

> Configura la landing pública de tu tienda. Los cambios se guardan en el backend.

por:

> Personaliza la página principal de tu tienda: cambia el título, la descripción, la imagen y el botón que verán tus clientes.

## Lenguaje revisado

- Navegación: Dashboard → Resumen; Landing Page → Página principal; Autenticación → Acceso de clientes; SEO / Analítica → Buscadores y visitas.
- Página principal: CTA → botón principal; Hero → imagen principal. Confirmación y acción de guardar usan el nombre comprensible de la página.
- Pagos: API conectada → Cuenta conectada; API Key Secret, Access Token y Client Secret → claves del proveedor; Client ID → identificador de PayPal. Modo de prueba reemplaza Sandbox en el selector.
- Entregas: clave del transportista y conexión automática pendiente reemplazan las etiquetas técnicas.
- Buscadores: título y descripción de la tienda en buscadores; identificadores de medición claramente opcionales.
- Correos, acceso, configuración y páginas legales: avisos y confirmaciones distinguen guardar en el panel de una función disponible para clientes. En legales, guardar versión reemplaza Publicar para evitar prometer una publicación que ese formulario no realiza.

Las direcciones que un proveedor de pagos necesita y sus nombres comerciales se conservan. Las claves internas y nombres de campos de los servicios no se renombraron.

## Mostrar y ocultar

`AdminHelpProvider` mantiene la preferencia durante la navegación y la guarda como `true` o `false` en `emprendedor-show-help`. Por defecto las ayudas están visibles. Si el navegador impide el almacenamiento, el panel sigue funcionando con una preferencia en memoria.

El botón Ocultar ayudas / Mostrar ayudas controla las introducciones y `AdminHelp`. Los componentes administrativos Input, Textarea y Select también aplican la preferencia a sus ayudas. `persistentHint` conserva avisos operativos, como el tratamiento de claves guardadas, el acceso con Google pendiente y las credenciales de transportistas no disponibles.

Errores, confirmaciones, alertas de seguridad, advertencias de pagos y estados de carga no dependen de esta preferencia. Tampoco se ocultan los controles, sus etiquetas o restricciones de validación.

## Ayudas y accesibilidad

Página principal explica dónde aparece el título, qué descripción es opcional, qué escribir en el botón, la imagen principal y el logo opcional. Se aprovechan además las ayudas existentes de productos, promociones, contacto, buscadores y correos, ahora vinculadas a la preferencia.

Las explicaciones son texto legible, sin depender de pasar el ratón. El botón es accesible con teclado, tiene `aria-expanded`, `aria-controls`, foco visible y altura mínima de 44 px. Las nuevas explicaciones usan texto secundario oscuro sobre fondos claros. El encabezado permite ajustar sus elementos a varias líneas en pantallas estrechas.

## Errores

`humanizeAdminError` convierte errores de transporte, excepciones y detalles técnicos reconocibles en mensajes útiles. Se aplica en las alertas administrativas, la carga de identidad, Página principal y los mensajes de PayPal. Mantiene validaciones comprensibles y los avisos para iniciar sesión. No modifica respuestas del servicio ni elimina los registros técnicos existentes.

La detección contempla los ejemplos Request failed 500, Invalid payload, resolver_tienda returned null, errores de red, excepciones, HTML y JSON. Es una clasificación de presentación: nuevos formatos de error deben añadir casos a sus pruebas. No se introdujo registro de claves o credenciales.

## Verificación

- `npm.cmd run typecheck`: aprobado.
- `npm.cmd run build`: aprobado; continúa el aviso de Vite sobre un paquete de más de 500 kB.
- Todas las 25 suites `frontend/tests/*.cjs`: aprobadas.
- `admin-panel-help.cjs`: siete pruebas sobre valores por defecto, ocultar/mostrar, persistencia, almacenamiento bloqueado, descripciones, errores, avisos críticos y ayudas de formularios.
- `git diff --check`: aprobado.
- Navegador con datos sintéticos del entorno de revisión: Página principal visible, guardar disponible al ocultar ayudas, preferencia conservada al pasar a Productos y recargar, recuperación con Enter y aviso crítico de Correos visible con ayudas ocultas.
- Revisión de Página principal en 1280×720, 768×1024 y 390×844: sin desbordamiento horizontal; botón de ayudas visible. Se restauró el tamaño original.

## Límites y pendientes

La revisión de navegador utilizó datos sintéticos; no representa una prueba con cuentas reales ni un cobro. No se activaron servicios de correos, Google, medición o publicación legal que ya estaban pendientes. Esas limitaciones siguen indicadas en pantalla. El aviso de tamaño del paquete y la ampliación futura de los formatos de error quedan como mantenimiento separado.
