# Auditoría de convivencia del merge 09c2b0c

Fecha: 16/10/2026. Rama comprobada: `feature/mejoras-informes-configuracion`.
HEAD: `09c2b0c2b360fd49cfe2385ae7479ca32cc10a24`.

## Procedencia identificada antes de modificar archivos

Se consultaron exclusivamente comandos Git de lectura: branch, status, log y diff. Al iniciar no había modificaciones de archivos rastreados; solo permanecía la carpeta no rastreada anterior `docs/mejoras-informes-configuracion/evidencias/`.

| Procedencia | Referencias locales y contenido |
| --- | --- |
| Trabajo de Marianela | `ecfe68e`: informes históricos/PDF y configuración unificada. `8a20934`: Marketing y editor visual. Se mantiene el nombre visible Página principal. |
| Equipo incorporado desde develop | Segundo padre `fb4391b`, coincidente con la referencia local `origin/develop`: promociones persistidas, códigos/descuentos/envío gratis en checkout (PR #118); historiales de pedidos/ventas (PR #117); protección del seguimiento de invitados y adaptación logística (PR #116 y commits asociados). |
| Integración ya realizada por la usuaria | `09c2b0c`, padres `8a20934` y `fb4391b`. Esta auditoría no realizó ese merge. |

Comparando los cambios de ambos padres desde `3807443`, el único archivo compartido es `backend/apps/core/urls.py`. Al comparar los archivos incorporados del equipo con `fb4391b`, todos quedan idénticos en HEAD salvo ese archivo: allí se añadieron las rutas/importaciones de informes y configuración, conservando las de promociones, historiales, seguimiento y demás rutas. No hay archivos eliminados respecto de `fb4391b`.

Comandos de procedencia: `git diff --name-only 3807443 fb4391b -- backend frontend`, `git diff --name-only 3807443 8a20934 -- backend frontend`, comparación de la intersección; `git diff fb4391b HEAD -- backend/apps/core/urls.py`; `git diff --diff-filter=D --name-only fb4391b HEAD`. No hubo fetch: origin/develop es la referencia local disponible.

## Dependencias revisadas

- Historial del equipo e informes propios leen Pedido, Tienda y ESTADOS_PAGADOS. Conservan endpoints separados: historial paginado/filtrable y agregados/PDF anual-mensual. Comparten autorización de propietario y resolución de tienda en servidor.
- Checkout del equipo ahora resuelve Promocion en PostgreSQL, valida vigencia/uso y registra consumo. Ya no reconoce automáticamente los antiguos códigos fijos. El catálogo/stock de Mongo y la cotización de despacho continúan participando en el checkout.
- La nueva pantalla Promociones usa su servicio HTTP persistido; su copia en AdminContext no reemplaza el backend. Marketing permanece limitado a ofertas de variantes reales del catálogo; no se conectaron automáticamente campañas generales, porque faltaría definir representación de código, mínimo, vigencia y cupos en la pieza.
- Configuración/Página principal y Marketing mantienen sus fuentes de nombre/logo/identidad y las rutas/redirecciones anteriores.
- El seguimiento seguro añade contadores de intentos y estado logístico estandarizado; no se retiraron esas protecciones para hacer pasar pruebas anteriores.

## Cambios mínimos realizados

**Ningún archivo productivo modificado**, ni frontend/src ni backend productivo. No se cambiaron modelos, migraciones, endpoints, componentes, rutas, formularios, configuración ni reglas comerciales.

1. `backend/apps/core/test_shipping.py`: la prueba existente de descuento y despacho ahora crea una promoción porcentual del 20% en su base temporal antes de usar VERANO20. Conserva todas sus aserciones originales: descuento 12.000, envío 4.500, total 52.500 y destino/cotización. No se reintrodujeron cupones fijos en checkout.
2. `frontend/tests/marketing-browser.cjs`: su transporte interceptado reproduce el nuevo contrato de promociones GET/POST y conserva la campaña simulada tras recargar. Se proporciona código válido. Marketing sigue comprobándose sin mutaciones; el único POST permitido es el guardado explícito dentro de Promociones, interceptado por QA. Se conserva la comprobación de que Marketing no convierte campañas generales en ofertas de variantes. No se modificó el módulo Marketing productivo.
3. `backend/apps/core/test_merge_compatibility.py`: siete pruebas nuevas, sin reemplazar pruebas del equipo. Verifican resolución de ambas familias de rutas; totales para un período común; filtros/búsqueda/paginación/agrupación; permisos; límites horarios; código requerido y redondeo del ticket. Las diferencias se hacen explícitas sin cambiar comportamientos.
4. Este documento. Las capturas de esta ejecución están en `../tmp/auditoria-09c2b0c/` desde docs, es decir `tmp/auditoria-09c2b0c/` en la raíz del repositorio. Las evidencias anteriores no se sobrescribieron.

## Resultados reales de esta ejecución

Todos los resultados finales de la tabla tienen código de salida 0. Los conteos se solapan: no sumarlos como casos únicos.

| Comando/comprobación | Resultado |
| --- | --- |
| frontend: npm run build | TypeScript y Vite aprobados. Aviso preexistente del bundle principal >500 kB. |
| frontend: npm run test:reports | 6 aprobadas. |
| frontend: npm run test:analytics | Aprobado: dashboard/navegación/analytics, 61 casos de despacho y contratos de checkout/cuatro plantillas. |
| frontend: npm run test:dashboard | 8 + 23 aprobadas. |
| frontend: npm run test:visual | 47 aprobadas. |
| frontend: npm run test:editor-ux | 15 + 58 + 6 aprobadas. |
| frontend: node tests/marketing.cjs | 11 aprobadas. |
| frontend: node tests/marketing-editor.cjs | 5 aprobadas. |
| frontend: node tests/promotions.cjs | Contrato de validación de códigos aprobado. |
| docker exec django_backend python scripts/test_develop_integration.py | 323 aprobadas tras corregir la fixture; Mongo real temporal y SQL SQLite en memoria. Construye 324 y conserva la exclusión histórica del caso test_guest_migration_recovers_existing_checkout_snapshots; no se declara aprobado. |
| docker exec django_backend python scripts/test_develop_integration.py apps.core.test_promotions apps.core.test_tracking_security apps.catalog.test_marketing_sources | 28 aprobadas: promociones, seguimiento seguro e aislamiento de catálogo/Marketing. |
| docker exec django_backend python scripts/test_develop_integration.py apps.core.test_merge_compatibility apps.core.test_shipping | 36 aprobadas cuando la suite nueva tenía seis casos; después se añadió el séptimo caso de redondeo, validado junto con los otros seis sobre PostgreSQL en la ejecución siguiente. |
| docker exec django_backend python scripts/test_reports_postgres.py | 57 aprobadas con PostgreSQL real temporal. La cadena de migraciones se aplicó únicamente en la base de pruebas test_openmind_reports_* creada/eliminada por el script. |
| Mismo runner PostgreSQL, agregando apps.core.test_merge_compatibility en memoria | 64 aprobadas: 57 previas + 7 nuevas. Se usó stdin con runpy y un envoltorio de call_command, sin editar el runner. |
| frontend: node tests/marketing-browser.cjs con MARKETING_EDITOR_TESTS=1 | Edge 375/768/1440 px aprobado: editor (27 combinaciones plantilla/formato/ancho), fuentes/variantes, estados, PDF, redirección de Página principal y creación/recarga de campaña con el nuevo contrato. Cero errores pageerror. Todas las rutas /api/ interceptadas; ningún producto/pedido/promoción comercial modificado. |
| docker exec django_backend python manage.py makemigrations --check --dry-run | No changes detected. No archivos de migración generados. |
| git diff --check; git diff --cached --stat | Sin errores de whitespace; sin cambios staged. |

Para navegador se usaron Edge y el Playwright disponible en el runtime, con DASHBOARD_PLAYWRIGHT_MODULE configurado, MARKETING_EDITOR_TESTS=1 y MARKETING_EVIDENCE_DIR apuntando a tmp/auditoria-09c2b0c. La URL fue http://127.0.0.1:5173. Las imágenes/campañas son fixtures de QA; esto no equivale a probar altas reales sobre la base comercial.

Intentos fallidos y correcciones: la primera integración de 323 terminó con una falla por cupón no persistido. Se corrigió solo su preparación. Una primera versión de las pruebas nuevas asumió erróneamente que GET de información de tienda era privado y que todos los rechazos de tienda ajena tenían código 400. Se ajustó la prueba al contrato existente: nombre/descripción públicos, escritura privada y promociones con rechazo 403. No se cambió producción para satisfacer esas suposiciones.

## Hallazgos pendientes: no declarar integración completa del entorno

### Base local sin tabla promocion

`showmigrations core --plan` mostró cuatro migraciones pendientes, confirmadas por `migrate core --plan` (solo plan):

1. `0006_configuracionpago_varianteproducto`: SeparateDatabaseAndState, sin operaciones de base de datos en ese archivo.
2. `0019_merge_20261008_1504`: unión de dependencias, sin operaciones.
3. `0020_alter_pedido_estado`: actualización del campo de estados.
4. `0021_promocion`: creación de tabla, restricciones, FK e índice de promociones.

Introspección de solo lectura confirmó `promocion_table_exists: False`, `pedido_table_exists: True`. Por ello la administración de promociones y checkout con código no pueden darse por operativos en esa base local, aunque las pruebas temporales pasen. **No se aplicaron migraciones ni se hizo fake/reset del historial**. No se modificó PostgreSQL comercial.

Plan revisable: aplicar la cadena existente con `docker exec django_backend python manage.py migrate core`, únicamente tras autorización sobre esa base local, y después verificar promociones/checkout sin realizar cobros. `sqlmigrate core 0021_promocion` se consultó sin ejecutar su SQL: crea promocion con sus restricciones/FK/índice; no elimina tablas. Las migraciones originales permanecen intactas y ya funcionaron en la base PostgreSQL temporal.

### Coherencia de historiales e informes

- El historial del equipo usa TIME_ZONE actual UTC; los informes usan America/Santiago explícitamente. Un pedido de `2026-10-01T02:30:00Z` entra en octubre para el historial y en septiembre para el informe. Reproducido en SQLite y PostgreSQL. No es pérdida del pedido ni eliminación de funcionalidad: son límites de período distintos.
- El ticket promedio del historial usa el redondeo decimal predeterminado; los informes usan ROUND_HALF_UP. Para dos ventas de 10,00 y 10,01, el promedio se muestra como 10,00 y 10,01 respectivamente. Reproducido en PostgreSQL. Los totales vendidos coinciden.
- Propuesta para aprobar antes de cambiar reglas: acordar una zona horaria y redondeo común explícitos para ambos contratos, conservando rutas, filtros, paginación, agregados y PDF. No cambiar TIME_ZONE global sin auditar otras dependencias. Las pruebas actuales hacen visibles ambas diferencias; una unificación requeriría actualizar sus expectativas de forma deliberada, sin retirar cobertura.

### Código presentado como opcional en Promociones

La pantalla heredada dice Código de descuento (opcional) y ofrece dejarlo vacío para aplicación automática, pero PromocionSerializer exige code y el checkout solo aplica códigos explícitos. POST sin código devuelve 400; reproducido en pruebas. Ambos archivos se conservaron como llegaron de develop. Propuesta: decidir entre corregir únicamente etiqueta/ayuda para hacer explícito el requisito, o diseñar promociones automáticas como funcionalidad separada. No se implementó una aplicación automática ni se cambiaron las reglas del equipo.

Marketing no publica todavía estas campañas con código: sigue anunciando únicamente precios de oferta de variantes. Se conserva esa separación de alcance; no se considera una regresión ni se declara implementada la integración editorial de campañas.

## Conservación y decisión

El código de ambos desarrollos está conservado y las pruebas aplicables pasan tras ajustar fixtures. Sin embargo, **el entorno local no está completamente preparado** por las migraciones pendientes y quedan decisiones de coherencia comercial/visual descritas arriba. Se requiere autorización antes de aplicar cambios a esa base y acuerdo antes de alterar los contratos del equipo.

La auditoría no ejecutó Git de escritura, commits, merge, pull/fetch, push, restauraciones, borrados de funcionalidades, despliegues ni cobros. No cambió develop/main ni reemplazó archivos con versiones anteriores.
