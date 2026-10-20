# Marketing Parte 1 — Informe técnico

Fecha de cierre: 16 de octubre de 2026 (America/Santiago).
Repositorio: C:\Users\maria\Ecommerce\ua-consultoria-openmind.
Rama de trabajo: feature/mejoras-informes-configuracion.
Alcance: módulo base, selección de productos/ofertas y vista previa temporal. No se implementaron las etapas posteriores.

## Resultado

Se incorporó Marketing al menú del emprendedor, en /emprendedor/marketing. La pantalla muestra el título y descripción solicitados, selección por producto o promoción, búsqueda por nombre/categoría/SKU, elección opcional de variante, selector de formato y composición automática. Desde Productos se añadió Crear publicación, que abre el mismo módulo con el ID Mongo seleccionado mediante ?producto=.... No existe un segundo editor.

Funcionan publicación cuadrada (1:1), historia (9:16) y banner (16:9). Las dimensiones 1080x1080, 1080x1920 y 1920x1080 quedan definidas como referencias para una exportación futura, no como archivos generados. Cambiar de formato reorganiza la composición sin deformar imágenes, volver a consultar el catálogo ni guardar la publicación. Las imágenes usan object-fit: contain. Sin imagen o ante una imagen inaccesible, se utiliza una composición tipográfica con los datos reales; no se genera ni sustituye la foto por un producto inventado.

Se contemplan carga, catálogo vacío, búsqueda sin coincidencias, selección inexistente, producto inactivo, falta de stock, precio inválido, logo ausente/inaccesible, fallo de catálogo o marca y reintento. Actualizar datos consulta nuevamente las fuentes y restablece la elección automática de variante para no conservar un SKU que haya dejado de estar disponible. Durante la recarga se retira la pieza anterior. La vista previa se genera en memoria al seleccionar y se pierde al salir/recargar, salvo la preselección de producto incluida en la URL.

## Conservación y trazabilidad

Antes de implementar se verificaron la rama y el estado mediante consultas Git de solo lectura. Se registraron SHA-256 de 78 archivos locales anteriores en cambios-previos-sha256.json. La comprobación final está en verificacion-conservacion.json:

- 75 archivos siguen idénticos byte a byte; ninguno falta.
- Los otros tres solo contienen adiciones de Marketing en rutas, navegación y ayuda contextual.
- Se compararon también los contenidos originales de Productos y package.json: Productos solo añade el enlace contextual y package.json está idéntico.
- Los archivos de informes/PDF, configuración, sus servicios, pruebas y evidencias anteriores se conservaron. Las nuevas pruebas y capturas escriben exclusivamente dentro de docs/marketing-parte1/.

Al retomar la sesión, HEAD ya incluía ecfe68e (informes históricos y configuración); la tarea no ejecutó ese commit ni ninguna operación Git de escritura. Tampoco se modificó el documento oficial de requisitos. ThemeEditor.tsx aparece modificado en el estado de trabajo, pero corresponde al trabajo anterior: su huella coincide con el registro inicial de esta tarea. No se debe atribuir ese cambio a Marketing.

No se ejecutaron add, commit, push, pull, merge, rebase, switch, checkout, reset, restore ni stash; no se creó PR, publicación o despliegue.

## Auditoría de las fuentes

### Productos y variantes

El catálogo comercial actual está en MongoDB, separado del modelo SQL legado Producto. El listado administrativo existente GET /api/catalog/productos/admin/listado/ usa ProductoAdminDetailView, IsAuthenticated y resolver_tienda(exigir_propietario=True). ProductRepository.list_by_store filtra por tienda_id resuelto en el servidor y devuelve los documentos de esa tienda, incluidos los inactivos para su gestión. ProductAdminDetailSerializer expone ID Mongo, nombre, categoría, imágenes, actividad y variantes completas.

El servicio general fetchAdminProducts es útil para la pantalla de Productos, pero su adaptación elimina las banderas activo/es_activa de las variantes y calcula un precio base sin filtrar existencias. Reutilizar ese resultado para publicidad permitiría anunciar una variante desactivada o agotada. Por eso Marketing reutiliza el mismo endpoint protegido, con un adaptador pequeño propio que conserva esas banderas y trata los datos comerciales por separado. No se cambió el servicio compartido ni el catálogo.

La imagen representativa es la primera imagen válida de imagenes. Se conservan imágenes reales HTTP/HTTPS o datos de imagen compatibles, y las rutas relativas se resuelven contra la URL de la API. No se aceptan javascript:, data:text/html ni URLs con credenciales. Si el recurso no carga se informa y se retira la imagen. No se consulta una colección ajena ni se construyen fotos de reemplazo.

Las variantes se consideran activas con la misma regla del backend: activo y es_activa no deben ser false. Para publicitar se exige además SKU no vacío, stock entero positivo y precio válido.

### Promociones

Promotions.tsx administra config.promotions mediante AdminContext/adminRepository y almacenamiento local por instalación/tienda. La configuración predeterminada incorpora mockPromotions. El checkout dispone de códigos internos definidos en backend (VERANO20 y NUEVO5000), sin una fuente de campañas publicables asociadas a tienda con ciclo de vigencia y autorización editorial. Ninguno de esos elementos se convirtió en una promoción de Marketing.

La fuente confiable disponible para esta parte es precio_oferta de una variante real del catálogo, junto con precio, actividad y stock. La opción Promociones permanece visible, explica que no existen campañas generales disponibles y muestra exclusivamente productos con al menos una oferta de variante publicitable. Si no hay ofertas, muestra un estado vacío. No se crean descuentos, campañas ni cupones nuevos y no se altera el comportamiento del módulo Promociones existente.

El catálogo no registra fechas de inicio/fin de esas ofertas: la interfaz no inventa vigencias ni anuncia vencimientos o urgencia. La elegibilidad significa que el precio de oferta está registrado y disponible al momento de consultar; no equivale a una campaña programada.

### Identidad visual

Nombre: GET /api/tienda/configuracion/, reutilizando fetchStoreInformation. Es la información persistida en Tienda por la unificación anterior. Si no se puede leer un nombre real, se bloquea la composición y se ofrece reintento; no se usa el nombre de demostración del navegador.

Logo: GET /api/landing/configuracion/, reutilizando fetchLandingConfig. Se emplea el mismo logo de Configuración/Página principal y no se crea otro campo. Una tienda sin logo sigue funcionando con su nombre. Si falla su consulta o carga, se informa y se usa el nombre, sin imagen de marca ficticia.

Colores: config.template y personalización actual del panel, resueltos mediante resolveStoreVisualConfig, con las mismas prioridades de plantilla/ajustes existentes. Se aplican color principal y secundario. No se escribe una nueva configuración de marca. Los colores hex con alpha se componen sobre blanco para obtener fondos sólidos; valores como transparent/currentColor que no definan un fondo autónomo utilizan una paleta de reserva apropiada. Se elige texto negro o blanco según luminancia para mantener contraste AA. Las cuatro plantillas públicas permanecen sin cambios.

## Arquitectura

| Capa | Implementación y responsabilidad |
| --- | --- |
| Datos comerciales | MarketingProduct/MarketingVariant y PublicationContent. Adaptación estricta del catálogo; selección de precio, stock y oferta en domain/content.ts. No contiene React ni datos de demostración. |
| Identidad de tienda | BrandSource/StoreBrand y domain/brand.ts. Nombre/logo de fuentes existentes y paleta resuelta con contraste. |
| Configuración del diseño | PublicationDesign: formato y layout product-spotlight; PUBLICATION_FORMATS define proporciones y referencias futuras. Estado temporal independiente de los datos comerciales. |
| Render | PublicationPreview recibe content, brand y design. No consulta API, aplica descuentos, guarda ni exporta. Solo mantiene estados visuales de recursos que no cargan. Puede reutilizarse en una etapa posterior. |
| Carga/orquestación | marketingService y useMarketingSources consultan catálogo/marca, manejan cancelación, errores y reintento. Marketing.tsx coordina selección y formato. |
| Controles | ContentPicker y FormatPicker reutilizan campos del panel y controles nativos de teclado. CSS propio, acotado por prefijo marketing-. |

El módulo se carga de forma diferida con lazyPage. No se añadieron dependencias, modelos, tablas, migraciones ni endpoints. El paquete compilado de Marketing queda separado del bundle principal. Vite sigue informando del tamaño del bundle principal superior a 500 kB, aviso que ya existía antes de esta etapa.

## Reglas de precio y descuento

1. Producto activo; solo variantes activas con stock entero mayor que cero.
2. Precio numérico finito, no negativo y representable de forma segura en centavos. Cero es un precio real permitido; null, valores negativos, infinitos, cadenas o datos inválidos no se convierten en un precio inventado.
3. Los importes se redondean a dos decimales con half-up, conforme al precio unitario del checkout, y se manejan como centavos enteros para visualización/cálculo. Se conserva la presentación CLP, incluidos centavos si están registrados.
4. Si hay precio_oferta, debe ser numérico, finito, no negativo y estrictamente menor que el precio regular de la misma variante. Una oferta inconsistente excluye esa variante de la publicidad. Si ambos importes quedan iguales después de redondear, no se anuncia descuento.
5. En Productos se elige por defecto el precio efectivo más bajo entre las variantes disponibles. Desde aparece solo cuando hay precios efectivos distintos y no se eligió un SKU concreto.
6. Elegir un SKU muestra su precio exacto sin Desde. Los precios regulares y de oferta nunca se toman de variantes diferentes.
7. En Promociones se consideran únicamente variantes con oferta válida y stock. La elección automática toma la oferta de menor precio; identifica la variante y no usa Desde como si correspondiera a todo el producto.
8. El porcentaje se calcula con los dos importes de esa variante y se trunca a dos decimales para no exagerar el ahorro. Si el descuento es menor a 0,01%, la etiqueta dice Precio de oferta en lugar de 0%.
9. La referencia tachada se rotula Precio regular: es el valor regular actual del catálogo, no un historial demostrado de precios anteriores. En productos con varias variantes la pieza indica que la oferta corresponde a esa variante y muestra su identificación. El detalle completo permanece también en la leyenda accesible de la vista previa.
10. Ante falta de stock, actividad o precio válido no se renderiza el llamado Disponible en nuestra tienda.

## Endpoints reutilizados y aislamiento

| Endpoint | Uso |
| --- | --- |
| GET /api/catalog/productos/admin/listado/ | Productos administrativos reales, autenticados con Token, sin parámetro de tienda enviado por Marketing. Lectura sin caché. |
| GET /api/tienda/configuracion/ | Nombre persistido, mediante el servicio existente. |
| GET /api/landing/configuracion/ | Logo persistido, mediante el servicio existente. |
| GET /api/visual-config/plantilla-seleccionada/ | Identidad de tienda usada por StoreIdentityProvider existente del panel. |
| GET /api/auth/emprendedor/perfil/ | Comprobación de propietario mediante RequireAdmin existente. |

La instalación sigue la arquitectura actual de una tienda por instancia: resolver_tienda valida la tienda instalada y su propietario. No se habilitó una arquitectura nueva de múltiples tiendas por instalación. Las pruebas verifican que documentos de otro tienda_id en Mongo no aparecen, que usuarios ajenos/inactivos no acceden y que no se puede suplantar la tienda por query/header. El ID en el enlace contextual solo preselecciona dentro de los productos ya autorizados; un ID ajeno o eliminado no abre otra tienda ni genera una publicación.

## Flujo de uso

1. Entrar en Marketing desde el menú o usar Crear publicación en Productos.
2. Elegir Productos o Promociones. En esta última opción solo se ofrecen precios de oferta reales disponibles.
3. Buscar y seleccionar el producto; opcionalmente elegir una variante disponible.
4. Revisar la composición y elegir cuadrado, historia o banner. La imagen se encuadra, no se estira.
5. Usar Actualizar datos cuando se necesite volver a consultar precios, stock, nombre o logo. No hay guardado de la publicación ni acciones de redes sociales en esta parte.

Las piezas soportan nombres largos con ajuste y truncamiento visual acotado para conservar la proporción. El nombre completo y la identificación de variante se mantienen en el texto accesible/leyenda. Los datos incompletos se explican mediante mensajes, no mediante campañas o valores de sustitución.

## Archivos de esta etapa

### Creados

- frontend/src/features/marketing/domain/types.ts: contratos separados y formatos.
- frontend/src/features/marketing/domain/content.ts: elegibilidad, precios, ofertas, búsqueda y construcción del contenido.
- frontend/src/features/marketing/domain/brand.ts: paleta y contraste.
- frontend/src/features/marketing/services/marketingService.ts: consulta autenticada y adaptación de productos/marca.
- frontend/src/features/marketing/hooks/useMarketingSources.ts: carga, cancelación y actualización.
- frontend/src/features/marketing/components/ContentPicker.tsx: origen, búsqueda y selección de producto/variante.
- frontend/src/features/marketing/components/FormatPicker.tsx: formatos accesibles.
- frontend/src/features/marketing/components/PublicationPreview.tsx: pieza visual reutilizable y recursos ausentes.
- frontend/src/features/marketing/pages/Marketing.tsx y marketing.css: página y estilos acotados.
- frontend/tests/marketing.cjs: pruebas de dominio, servicios, marca y render.
- frontend/tests/marketing-browser.cjs: recorridos reales de navegador con HTTP simulado y capturas.
- backend/apps/catalog/test_marketing_sources.py: cinco pruebas del endpoint existente con Mongo temporal.
- docs/marketing-parte1/: este informe, manifiesto inicial, verificación de conservación, registros y evidencias.

### Puntos de integración modificados

- frontend/src/features/admin/routes.tsx: importación diferida y ruta protegida de Marketing; conserva las rutas y redirecciones anteriores.
- frontend/src/features/admin/config/navigation.ts: entrada Marketing.
- frontend/src/features/admin/config/pageHelp.ts: título/descripción solicitados.
- frontend/src/features/admin/pages/Products.tsx: enlace contextual, sin alterar carga, edición, inventario o desactivación.

No se modificó Promociones, el código backend productivo, checkout, pedidos, seguimiento, retiro, los servicios de informes/configuración ni las cuatro plantillas públicas. No se modificó package.json; los nuevos tests se ejecutan directamente con Node.

## Pruebas ejecutadas

Los conteos se solapan: no deben sumarse como casos únicos.

| Prueba | Resultado | Fuente/evidencia |
| --- | --- | --- |
| Unidad y contratos de Marketing | 11 aprobadas | node tests/marketing.cjs; frontend-marketing-tests.txt. Datos, variantes, ofertas inválidas/ausentes, precio cero, redondeo, imágenes, marca, contraste, Token, errores y tres formatos. |
| Fuente Marketing con MongoDB real | 5 aprobadas | backend-marketing-mongo-tests.txt. Endpoint administrativo con productos persistidos en bases Mongo test_*; SQL en SQLite en memoria. Permisos, aislamiento, imágenes, precios y banderas de variantes. |
| Backend focalizado de regresión | 147 aprobadas | backend-regression-tests.txt. SQLite en memoria; informes/PDF, configuración, estados, pedidos, retiro, entregas, landing e identidad. Proveedores/catálogo simulados cuando lo prevén los tests. |
| PostgreSQL real | 57 aprobadas | postgres-regression-tests.txt. Script test_reports_postgres.py dentro de Docker, base test_openmind_reports_<uuid> creada/eliminada. Informes PDF, configuración, dashboard, órdenes y estados. |
| Integración con MongoDB real | 323 aprobadas | mongo-regression-tests.txt. Script test_develop_integration.py dentro de Docker; SQL SQLite efímero y Mongo temporal. Catálogo, stock, carrito, checkout, pagos, pedidos, seguimiento, entregas y aislamiento. |
| Informes frontend | 6 aprobadas | npm run test:reports; frontend-reports-tests.txt. |
| Analytics/checkout | Aprobado | npm run test:analytics; frontend-analytics-tests.txt. Incluye navegación, cotizaciones simuladas, retiro y cuatro plantillas. |
| Dashboard/órdenes frontend | 8 + 23 aprobadas | npm run test:dashboard; frontend-dashboard-tests.txt. |
| Configuración visual | 47 aprobadas | npm run test:visual; frontend-visual-tests.txt. |
| Editor visual | 15 + 58 + 6 aprobadas | npm run test:editor-ux; frontend-editor-tests.txt. |
| TypeScript y producción | Aprobados | npm run build, que incluye typecheck de app y configuración; frontend-build.txt. Se conserva el aviso de tamaño del bundle principal. |
| Edge, app real con HTTP simulado | Aprobado a 375, 768 y 1440 px | browser-tests.txt. Tres formatos, proporciones, texto/CTA dentro de la pieza, imágenes sin deformar, carga/error/reintento, producto sin datos, logo, búsqueda, variantes, ofertas y teclado. |
| Regresiones de navegador | Aprobadas | Mismo recorrido simulado: acceso contextual, enlace anterior a Configuración, descarga PDF con nombre correcto, creación/persistencia de promoción local y su exclusión de Marketing. |
| Conservación | Aprobada | verificacion-conservacion.json y revisión exacta de los puntos de integración. Sin archivos previos perdidos y sin staging. |

El navegador usa respuestas HTTP de prueba y una imagen marcada como QA. Esto no se presenta como un recorrido de edición de la tienda comercial real. La lectura y los permisos con servicios reales se verificaron por separado en las pruebas de Mongo/PostgreSQL. Las pruebas no hicieron cobros reales ni llamadas a servicios de redes sociales. No se escribieron productos, pedidos ni configuraciones en las bases comerciales.

La suite de integración existente construye 324 casos y ejecuta 323: conserva su exclusión previa de test_guest_migration_recovers_existing_checkout_snapshots. Ese caso no se declara aprobado. La suite PostgreSQL no depende de Mongo; en la suite Mongo la parte relacional usa SQLite.

La prueba PostgreSQL tuvo una interrupción inicial de revisión automática por límite de uso y no se ejecutó en ese intento. Tras retomar la sesión se ejecutó y pasó. La primera ampliación de la prueba de persistencia local también reveló que su preparación reescribía los datos al recargar; se corrigió el fixture sin modificar Promociones. Los registros entregados corresponden a ejecuciones finales, no a esos intentos fallidos.

### Reproducir

Desde frontend:

- node tests/marketing.cjs
- npm run test:reports
- npm run test:analytics
- npm run test:dashboard
- npm run test:visual
- npm run test:editor-ux
- npm run build

Servicios reales, desde la raíz con Docker de desarrollo activo:

- docker exec django_backend python scripts/test_develop_integration.py apps.catalog.test_marketing_sources
- docker exec django_backend python scripts/test_reports_postgres.py
- docker exec django_backend python scripts/test_develop_integration.py

Para el recorrido gráfico: desde frontend, ejecutar node tests/marketing-browser.cjs. Configurar DASHBOARD_PLAYWRIGHT_MODULE con un módulo Playwright disponible y MARKETING_TEST_URL si la URL no es http://127.0.0.1:5173. Se usó Edge y el Playwright incluido en el runtime de Codex. El script requiere producto-qa.png y las muestras JSON/PDF anteriores de informes, que solo lee; todas sus rutas /api/ son interceptadas. No se añadió Playwright como dependencia del producto; se utilizó únicamente como herramienta de prueba disponible en el entorno.

## Evidencia visual

En evidencias/ se incluyen marketing-375.png, marketing-768.png y marketing-1440.png para la pantalla completa. Las piezas square-*.png, story-*.png y banner-*.png muestran los tres formatos en cada tamaño. Se agregan casos -sin-imagen y -nombre-largo. La imagen producto-qa.png es exclusivamente una fixture gráfica de pruebas: no se incorpora a la aplicación ni a respuestas productivas.

Se inspeccionaron capturas de los tres formatos, los casos sin imagen y nombres largos, y la página completa. La composición mantiene la proporción, conserva el producto con object-fit: contain y presenta una jerarquía de marca/título/precio. La cuadrada reserva más espacio para la imagen y agrupa precio regular/actual; la historia prioriza imagen vertical y el banner usa columnas. Los controles tienen etiquetas, radios nativos, foco visible y navegación por teclado; no hay scroll horizontal global.

## Limitaciones actuales

- Solo son publicitables las ofertas del catálogo; no existe todavía una fuente backend confiable de campañas generales publicables. Los cupones internos y promociones locales continúan separados.
- Sin fechas de vigencia en el modelo de ofertas no se muestran fechas ni vencimientos. La vista es una consulta temporal: Actualizar datos permite volver a confirmar precio y stock, y el checkout mantiene la validación definitiva al comprar.
- Se reutiliza el listado administrativo completo existente. La búsqueda es local y la lista no está paginada; una tienda con catálogo muy grande puede requerir un endpoint de búsqueda paginada en una etapa posterior.
- Los formatos son vistas previas responsivas, no un motor de exportación a la resolución objetivo. En pantallas pequeñas el banner se reduce proporcionalmente; los datos completos siguen disponibles en la leyenda.
- Los títulos excepcionalmente largos se ajustan/truncan visualmente dentro de la pieza; el texto completo queda accesible. La edición manual de un título más breve pertenece al editor futuro.
- Los colores siguen la personalización actualmente disponible en el panel, incluida su persistencia local por tienda; no se migró el sistema de diseño a otro backend.
- Falta aceptación visual del emprendedor con su propio catálogo/logo y una revisión humana de contraste/lectura con las marcas reales. Las capturas aportadas son QA, no campañas comerciales.

## Próximas partes — pendientes, no implementadas

Parte 2: editor visual avanzado sobre PublicationDesign y PublicationPreview: tipografía, tamaños, pesos, cursiva, alineación, paletas, colores, posición, cambio de imagen, visibilidad de logo y plantillas. Diseñar también la experiencia de nombres largos sin alterar datos comerciales originales.

Parte 3: exportación PNG/JPG a resolución objetivo y guardado de diseños/borradores. Definir versionado del documento, identidad y propiedad de diseños, validación de recursos, tratamiento de CORS/imágenes y pruebas de coincidencia entre vista previa y archivo exportado. Nada de esto se añadió silenciosamente a esta etapa.

Parte 4: integraciones con plataformas sociales, permisos, OAuth, publicación y eventualmente programación. Requiere decisiones de cuenta, consentimiento, credenciales, registro de errores y políticas de cada proveedor. No hay llamadas a Meta ni conexión directa en esta parte.

### Backend futuro de promociones comerciales

Antes de publicitar campañas generales se necesita una fuente persistida y autorizada por tienda: estado/publicabilidad, tipo/valor de descuento, referencias reales de producto/SKU Mongo, condiciones de uso y fechas de inicio/fin en zona horaria definida. El backend debe resolver elegibilidad y aplicación del descuento para comprador y Marketing con las mismas reglas, autorizar las mutaciones y exponer solo las condiciones legítimamente publicables. Un código interno no se convierte automáticamente en campaña. Se requieren tests de vigencia, aislamiento, permisos, variantes, compatibilidad con checkout y modificaciones concurrentes. No se crearon estos modelos/endpoints ahora.

## Tareas propuestas para registrar después en Jira

1. Auditar fuentes comerciales, variantes y promociones publicables de Marketing.
2. Agregar ruta y navegación de Marketing, con acceso contextual desde Productos.
3. Implementar adaptación del catálogo autorizado y reglas de precio/oferta por variante.
4. Reutilizar identidad visual de la tienda con estados de recursos ausentes y contraste.
5. Implementar composiciones cuadrada, historia y banner, responsivas y accesibles.
6. Verificar contratos, servicios reales, regresiones y conservación de cambios previos.
7. Documentar Parte 1 y definir contratos del editor, exportación y campañas futuras.

Son propuestas de trazabilidad. No se crearon ni modificaron tickets automáticamente.
