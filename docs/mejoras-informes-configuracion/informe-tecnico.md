# Informe técnico — Historial PDF y configuración de OpenMind

Fecha: 15 de octubre de 2026, zona America/Santiago.
Repositorio: C:\Users\maria\Ecommerce\ua-consultoria-openmind.
Rama: feature/mejoras-informes-configuracion. Base: 3807443d76f88436af1ab82ddffc483e0fe2621d.

## Resultado y protección del trabajo

Se implementaron las dos mejoras. El árbol estaba limpio al comenzar. La rama de trabajo se verificó antes de editar y se confirmó mediante consulta de solo lectura que develop remoto continúa en el commit indicado. Todos los cambios quedan locales, sin preparar ni confirmar en Git. No se ejecutaron add, commit, push, merge, rebase, pull ni cambios de rama. No hubo publicación ni despliegue.

Las pruebas SQL y Mongo usaron bases temporales; no se agregaron pedidos ni se modificaron estados o información de la tienda comercial. Las muestras PDF y las respuestas del navegador contienen fixtures claramente identificadas como pruebas, exclusivamente para QA. Se instalaron ReportLab y pypdf en los entornos de pruebas y en el contenedor local de desarrollo. Las dependencias quedan declaradas para instalaciones posteriores.

## Historial e informes

El dashboard conserva su selector rápido de 7 días, 30 días y este año, sus métricas, gráficos y últimas órdenes. Se agregó al final una sección independiente Historial e informes, con año, mes opcional, resumen, gráficos de ingresos/pedidos, distribución por estado, meses destacados y tabla mensual con totales. Los controles históricos no cambian el período rápido.

Los años proceden de fechas reales de los pedidos de la tienda en Chile más el año actual; no existe un listado fijo. Se excluyen años futuros. Un año sin actividad es consultable por API y devuelve ceros; el selector muestra los años con registros y el actual. El informe anual siempre incluye enero a diciembre. El mensual devuelve únicamente el mes consultado. Sin pagos confirmados, el ticket es nulo y se presenta como Sin pagos confirmados, evitando inventar un promedio. Los máximos informan todos los meses empatados; sin actividad no hay un ganador.

Se implementaron carga, error, reintento, cancelación de consultas al salir/cambiar filtros, descarga y error de descarga. Las tablas tienen encabezados semánticos y desplazamiento horizontal contenido. Los gráficos incluyen etiquetas y cifras accesibles sin depender del color. Los importes del historial conservan los centavos de los decimales del backend y se formatean como strings, evitando pérdida de precisión al mostrar cantidades grandes.

### Consultas, consistencia y seguridad

El servidor resuelve la tienda con resolver_tienda(exigir_propietario=True) y exige autenticación. El navegador envía solamente año y mes; no elige una tienda. El resolver existente rechaza identidades inconsistentes, usuarios ajenos o inactivos y configuraciones sin tienda o con múltiples tiendas. La arquitectura actual es una tienda por instalación: la prueba con dos tiendas verifica fallo cerrado 503, no soporte de múltiples tiendas dentro de la misma instalación.

consultar_informe usa dos consultas de datos: años distintos con datetimes y un agregado SQL por mes/estado mediante ExtractMonth, Count y Sum. Los límites son intervalos semiabiertos de medianoche local y medianoche del período siguiente en America/Santiago. A ellas se suman las consultas existentes para resolver y autorizar la tienda; se verificó un máximo de cuatro consultas en el caso con autenticación forzada, independiente de la cantidad de pedidos. No hay joins a ítems/pagos, consultas a Mongo ni pedidos individuales enviados al navegador. La consulta de años debe recorrer las fechas de la tienda para obtener los años distintos; no se añadió caché ni un índice nuevo.

Ventas usa Pedido.ESTADOS_PAGADOS y monto_total, igual que el dashboard. La cantidad de pedidos incluye todos los estados. El ticket divide ingresos confirmados por cantidad de pedidos confirmados con Decimal y ROUND_HALF_UP. El total conserva los componentes incluidos en monto_total, conforme a las métricas actuales. La pantalla y el PDF usan exactamente la misma función de consulta. Cada descarga vuelve a consultar el backend: si cambian pedidos entre la visualización y la descarga, el PDF refleja los datos más recientes, no una captura congelada del navegador.

### Generación PDF

ReportLab genera documentos vectoriales A4 en memoria. No se usan capturas del dashboard ni servicios externos. Contienen nombre de Tienda, título, período, generación en hora chilena, indicadores, cifras CLP, estados, lectura descriptiva y nota comercial/no tributaria. El anual incluye tabla de doce meses, gráficos separados de ventas/pedidos y máximos mensuales. El mensual utiliza un gráfico de distribución por estado junto con sus indicadores del mes. Los períodos vacíos muestran tablas en cero y un mensaje claro, sin páginas de gráficos vacíos.

Las tablas admiten paginación, encabezados repetidos y textos escapados; todas las páginas llevan numeración. La distribución anual se mantiene en una sección completa. Las muestras finales tienen tres páginas para el anual con actividad, una para el mensual y dos para el anual vacío. Se renderizaron todas las páginas con Poppler y se inspeccionaron visualmente: texto, acentos, márgenes, cifras, tablas, gráficos, saltos y pies legibles, sin superposición ni cortes. Se comprobó además texto y tamaño A4 con pypdf.

Nombres: informe-ventas-pedidos-AAAA.pdf e informe-ventas-pedidos-AAAA-MM.pdf. Respuesta application/pdf, Content-Disposition attachment y Cache-Control no-store. El frontend descarga el blob y libera su URL temporal.

## Auditoría y organización de configuración

La auditoría anterior a los cambios se documenta también en contrato-y-auditoria.md.

| Pantalla anterior | Campos y acciones | Persistencia anterior |
| --- | --- | --- |
| /emprendedor/configuracion — Settings | Nombre, descripción del negocio, correo, teléfono, logo, subir/quitar imagen y guardar | AdminContext/adminRepository, localStorage identificado por instalación/tienda |
| /emprendedor/landing — LandingPage y LandingContentEditor | Título, descripción de portada, texto de botón, imagen principal, logo, subir/quitar imágenes, activar/desactivar secciones, selección/quitar hasta seis productos/categorías, agregar/quitar hasta cuatro beneficios e iconos, teléfono, WhatsApp, correo, redes, web, horarios, dirección, región/provincia/comuna/localidad/Maps, guardar y ver tienda | GET/PUT /api/landing/configuracion/, modelo ConfiguracionLanding; catálogo público Mongo para selecciones |

Logo, correo y teléfono eran duplicados con fuentes distintas. La descripción del negocio y la de portada cumplen propósitos diferentes y se conservaron ambas. El nombre del negocio era exclusivo de Configuración; los demás controles de portada eran exclusivos de Página principal. Diseño conserva plantillas, colores, editor y sus opciones, con su persistencia existente.

Organización final: una entrada Configuración de la tienda en el menú. Su página reúne dos apartados, enlazados mediante navegación interna accesible por teclado:

1. Información del negocio: nombre obligatorio (máximo 150) y descripción del negocio, con guardado propio en Tienda mediante el backend. Incluye recuperación explícita del nombre/descripción previamente guardados en este navegador.
2. Página principal y contacto: reutiliza el formulario completo existente. Conserva portada, CTA, imagen, logo, productos, categorías, beneficios, contactos, redes, horarios, ubicación y todas las banderas. Es el único formulario principal para logo, correo y teléfono. Incluye recuperación de datos locales únicamente en campos vacíos y guardado posterior explícito.

La navegación incluye un enlace al módulo de Apariencia y editor visual, sin copiar sus formularios ni duplicar Entregas/Pagos. Los dos guardados son independientes y están claramente rotulados; no se promete una transacción global entre ambos apartados. No se borra el almacenamiento local anterior ni se sobrescribe automáticamente el backend al cargar.

La ruta anterior /emprendedor/landing redirige con replace a /emprendedor/configuracion#pagina-principal. Los enlaces del editor visual apuntan directamente al nuevo destino. Los apartados respetan el encabezado fijo al desplazarse. StoreContext y AdminContext leen nombre/descripción del backend y actualizan al guardar o recuperar el foco; los valores locales siguen como compatibilidad si la consulta pública falla. El logo y los contactos públicos continúan consumiendo landing. No se modificó el diseño de las cuatro plantillas ni la lógica del editor visual.

## Endpoints

| Método y ruta | Uso y permisos |
| --- | --- |
| GET /api/tienda/informes/?anio=2026[&mes=10] | Nuevo. Solo propietario activo. Agregados históricos y años disponibles. Año omitido: año chileno actual. Año 1..actual; mes opcional 1..12; filtros desconocidos/repetidos devuelven 400. |
| GET /api/tienda/informes/pdf/?anio=2026[&mes=10] | Nuevo. Mismos filtros y autorización; descarga PDF real. |
| GET /api/tienda/configuracion/ | Nuevo. Información pública mínima: nombre y descripción. Sin usuario, pagos ni información privada. |
| PUT /api/tienda/configuracion/ | Nuevo. Solo propietario activo. Persiste nombre/descripción en Tienda. |
| GET /api/tienda/dashboard/ | Existente y compatible; no se cambió su contrato. |
| GET/PUT /api/landing/configuracion/ | Existente y reutilizado; lectura pública y escritura autorizada. |
| GET /api/catalog/productos/ | Existente; catálogo para productos/categorías de landing. |
| GET /api/visual-config/plantilla-seleccionada/ | Existente; identidad de la tienda y compatibilidad del editor. |

## Archivos creados

- backend/apps/core/infrastructure/reports.py: consultas y métricas compartidas.
- backend/apps/core/infrastructure/report_pdf.py: composición PDF.
- backend/apps/core/presentation/reports.py: validación y endpoints de informes.
- backend/apps/core/presentation/store_configuration.py: información persistida del negocio.
- backend/apps/core/test_reports.py y test_store_configuration.py: pruebas funcionales, permisos, fechas, consultas, persistencia y PDF.
- backend/requirements-test.txt: dependencias de comprobación PDF.
- backend/scripts/preview_reports.py: muestras y JSON de QA desde SQLite efímero.
- backend/scripts/test_reports_postgres.py: suite sobre base PostgreSQL test_openmind_reports_<uuid>, con carga opcional del .env local sin mostrar secretos.
- frontend/src/features/admin/components/dashboard/Reports.tsx: historial, gráficos, tabla y descarga.
- frontend/src/features/admin/services/reportService.ts y reportFormatting.ts: contrato, descarga y formato decimal CLP.
- frontend/src/features/storefront/services/storeInformationService.ts: consulta/guardado de información del negocio.
- frontend/tests/reports.cjs y reports-settings-browser.cjs: pruebas de contratos y recorridos de navegador.
- docs/mejoras-informes-configuracion/: contrato/auditoría, este informe, registros de pruebas y evidencias PDF/JSON/PNG.

## Archivos modificados

- backend/apps/core/urls.py: registro de rutas nuevas.
- backend/requirements.txt: ReportLab, dependencia de producción.
- frontend/package.json: script test:reports.
- frontend/src/features/admin/pages/Dashboard.tsx: integración del historial.
- frontend/src/features/admin/pages/Settings.tsx: configuración unificada y persistencia de información general.
- frontend/src/features/admin/pages/LandingPage.tsx: recuperación explícita de logo/contactos locales.
- frontend/src/features/admin/pages/ThemeEditor.tsx: destinos de los enlaces de contenido.
- frontend/src/features/admin/routes.tsx: redirección de landing antigua.
- frontend/src/features/admin/config/navigation.ts y pageHelp.ts: menú y ayuda contextual.
- frontend/src/features/admin/context/AdminContext.tsx y frontend/src/features/storefront/context/StoreContext.tsx: lectura de nombre/descripción persistidos.
- frontend/tests/dashboard.cjs, recent-orders.cjs y visual-config.cjs: adaptación de dobles de prueba al nuevo componente y al efecto de carga de información pública, conservando las comprobaciones existentes.

No se añadieron migraciones ni se modificaron modelos, plantillas públicas, checkout, pagos, estados, envíos o retiro.

## Verificación y resultados finales

Los conteos siguientes se solapan; no representan una suma de casos únicos.

| Verificación | Resultado | Naturaleza y evidencia |
| --- | --- | --- |
| Backend focalizado | 147 aprobadas | SQLite en memoria; catálogo/geocodificación simulados cuando corresponde. backend-tests.txt. Incluye informes, configuración, dashboard, últimas órdenes, estados, retiro, entregas, landing e identidad. |
| PostgreSQL real | 57 aprobadas | Dentro de django_backend; base test_openmind_reports_<uuid> creada y eliminada. postgres-tests.txt. Informes/PDF, configuración, dashboard, últimas órdenes y estados. |
| Integración con MongoDB real | 323 aprobadas | Script existente test_develop_integration.py dentro de Docker; SQL SQLite en memoria y base Mongo test_develop_integration_<uuid>. mongo-integration-tests.txt. Catálogo, inventario, aislamiento, carrito, checkout, seguimiento, pagos y entregas, entre otros módulos. |
| Nuevo servicio y presentación de informes | 6 aprobadas | npm run test:reports; frontend-reports-tests.txt. Token, filtros, errores, blob/filename, render, persistencia de negocio y precisión decimal. |
| Analytics/checkout | Aprobado | npm run test:analytics; frontend-analytics-tests.txt. Incluye navegación, totales, filtros, cuatro plantillas y retiro sin cotización. |
| Dashboard y órdenes | 8 + 23 aprobadas | npm run test:dashboard; frontend-dashboard-tests.txt. |
| Configuración visual | 47 aprobadas | npm run test:visual; frontend-visual-tests.txt. Incluye aislamiento y cuatro presets. |
| Editor visual | 15 + 58 + 6 aprobadas | npm run test:editor-ux; frontend-editor-tests.txt. |
| TypeScript y build | Aprobados | npm run build incluye typecheck de app y configuración; frontend-build.txt. Vite mantiene aviso de chunk principal superior a 500 kB. |
| Navegador Edge | Aprobado a 375, 768 y 1440 px | App real con respuestas HTTP interceptadas, no escritura comercial real. browser-tests.txt y capturas en evidencias/. |
| PDF visual y estructura | Aprobado | Tres PDF de fixtures y sus seis páginas renderizadas e inspeccionadas; A4, texto, cifras, tablas, gráficos y numeración. |
| Revisión Git | Aprobada | git diff --check sin incidencias; rama correcta; ningún cambio preparado/confirmado. |

Los recorridos de navegador comprueban año actual vacío, año anterior con datos, doce meses, mensual, descargas y nombres anual/mensual, independencia del filtro rápido, error de PDF, error de historial y reintento, guardado de negocio y landing, error de guardado, persistencia al recargar el servidor simulado, ausencia de duplicados, protección de campos ya guardados al recuperar locales, recuperación de nombre/descripción, navegación por teclado y menú, redirección antigua, carga fallida que impide sobrescribir landing y render de las cuatro plantillas. No se detectaron errores JavaScript ni desbordamiento horizontal global.

Se repitieron los casos afectados después de las correcciones. Las ejecuciones iniciales tuvieron una restricción de carpeta temporal de Windows, fallos de credenciales al intentar localhost y una interrupción de procesos Docker. Se resolvieron usando una carpeta temporal dentro del proyecto y la red interna de los contenedores. Los registros entregados contienen los resultados finales. La base PostgreSQL temporal que dejó la ejecución interrumpida se eliminó por su nombre exacto; se verificó que no quedaban bases Mongo temporales de estas ejecuciones.

El script de integración construye 324 casos y ejecuta 323: excluye deliberadamente el caso histórico test_guest_migration_recovers_existing_checkout_snapshots, como ya hacía antes de estos cambios. No se presenta ese caso como aprobado. No se ejecutaron migraciones de datos sobre la base comercial.

### Reproducir

Desde frontend: npm run test:reports, npm run test:analytics, npm run test:dashboard, npm run test:visual, npm run test:editor-ux y npm run build.

Desde backend: instalar requirements-test.txt en un entorno de pruebas; ejecutar scripts/test_dashboard.py con los módulos indicados en backend-tests.txt o la lista del registro de esta entrega. Para PostgreSQL de Docker: docker exec django_backend python scripts/test_reports_postgres.py. Para Mongo de Docker: docker exec django_backend python scripts/test_develop_integration.py. Este último conserva su esquema efímero SQL y su exclusión histórica.

Muestras PDF: desde backend, python scripts/preview_reports.py. Genera únicamente fixtures en SQLite en memoria y archivos de evidencia, sin usar PostgreSQL/Mongo.

Navegador: iniciar frontend y ejecutar node tests/reports-settings-browser.cjs desde frontend, con REPORTS_TEST_URL indicando su URL local y DASHBOARD_PLAYWRIGHT_MODULE indicando el módulo Playwright disponible. En esta entrega se usaron Edge, el Playwright del runtime de Codex y http://127.0.0.1:5173 de Docker. El script requiere los JSON/PDF generados por preview_reports.py y usa datos de prueba fijos de 2025/2026. Todas sus rutas /api/ están interceptadas.

## Limitaciones y comprobaciones manuales pendientes

- Los períodos se atribuyen a fecha_creacion, porque Pedido no dispone de fecha efectiva de pago. Los estados se consultan en su situación actual: cambiar un pedido puede modificar un informe de un año anterior. El PDF lo indica y no se presenta como documento tributario ni cierre contable inmutable.
- Una tienda por instalación es la regla heredada; no se habilitó alojamiento de varias tiendas dentro de la misma base de esta instalación.
- La información del negocio y la portada tienen guardados independientes. Los datos locales se conservan para recuperación explícita. El diseño/editor mantiene su persistencia local previa; no se realizó una migración general de personalización visual al backend.
- La interfaz conserva su fallback local previo si falla la carga pública de nombre/descripción. El formulario de información general bloquea el guardado si no pudo cargar el servidor.
- Falta la aceptación visual del emprendedor con el nombre, logo, catálogo, contactos y contenido comercial reales de su tienda. Las pruebas del navegador usan fixtures; la persistencia real y los permisos se verificaron mediante los tests backend contra PostgreSQL, no editando la tienda del usuario.
- No se realizaron cobros reales, cotizaciones con proveedores externos ni validaciones geográficas con servicios de pago. Las regresiones de esos flujos se probaron con los dobles previstos en las suites existentes. La confirmación del funcionamiento en una cuenta externa real queda fuera de estas pruebas.
- Falta la revisión humana y posterior decisión de integración. No hay publicación, despliegue ni cambios de Git preparados por esta entrega.

## Evidencias de muestra

Los PDF dentro de evidencias/ se titulan explícitamente como una tienda de prueba: anual 2025 con actividad (3 páginas), octubre 2025 (1 página) y anual 2024 sin movimientos (2 páginas). Sus JSON proceden del mismo agregado usado para generarlos. Las capturas muestran el panel y las cuatro plantillas en móvil, tablet y escritorio con HTTP simulado. No contienen resultados comerciales del usuario.
