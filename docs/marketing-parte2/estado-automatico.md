# Marketing Parte 2 — completa y validada

Fecha: 16/10/2026. Rama: feature/mejoras-informes-configuracion.

## IMPLEMENTADO

Auditoría previa: useMarketingSources carga catálogo y marca; content.ts decide elegibilidad y precios; Marketing coordina producto/SKU/formato; PublicationPreview recibe contenido/marca/diseño sin consultar ni guardar. ContentPicker/FormatPicker reutilizables. Servicio administrativo y autorización servidor existentes se conservan. No hacen falta endpoints, migraciones, dependencias ni almacenamiento nuevo.

Diseño técnico antes de programar: sourceData (PublicationContent + imágenes reales autorizadas) y brandData (StoreBrand) de solo lectura; designState tipado independiente con plantilla, textos editoriales, tipografía, colores locales, encuadre, visibilidad y composición. El renderer no decide precios. Plantillas Fotografía, Destacado y Esencial con adaptaciones por formato. Se conserva identidad comercial explícita bajo cualquier encabezado editable. Ajustes en memoria; historial acotado. Cambio de producto limpia textos/imagen/historial; formato y plantilla conservan ajustes compatibles. Restablecer requiere confirmación local. Ajuste geométrico del texto con bloqueo honesto de piezas que no quepan, sin recortar condiciones comerciales.

### Componentes y estado final

- `domain/editor.ts`: DesignState, TextStyle, listas cerradas, normalización, validación editorial, contraste y reducer DesignHistory. No contiene precio, descuento ni stock editables.
- `domain/types.ts`: PublicationDesign conserva formato/layout y admite editor opcional; compatible con el renderer probado en Parte 1.
- `components/DesignStudio.tsx`: separa el selector de contenido de DesignSession. La clave producto/origen reinicia exclusivamente documento e historial; la búsqueda no se desmonta. SKU, plantilla y formato conservan ajustes compatibles. Actualizar datos retira la pieza mientras carga, actualiza datos comerciales y conserva el diseño de ese producto. Salir/recargar pierde las ediciones.
- `components/DesignControls.tsx`: secciones mediante botones nativos con aria-pressed, campos etiquetados, plantillas con radio y representación visual, controles de teclado y confirmación de reset.
- `components/PublicationPreview.tsx`: recibe sourceData como content, brandData como brand y designState dentro de design; no muta fuentes ni consulta/guarda. Render de texto escapado por React; colores validados, tipografías cerradas. ResizeObserver ajusta tipografía y bloquea una composición imposible con mensaje explícito. La leyenda conserva los datos completos. No se truncan título, variante ni datos comerciales dentro de las piezas válidas.
- `pages/Marketing.tsx`: integra el estudio existente con selección, formato y estados de carga/error. `editor.css`: estilos acotados, tres composiciones y adaptación por formato. En escritorio preview al lado de los controles, con posición sticky; móvil/tablet selección, preview y editor por secciones.
- `tests/marketing-editor.cjs` y `tests/marketing-editor-browser.cjs`: nuevas verificaciones. `tests/marketing-browser.cjs`: conserva recorrido previo y permite activar el recorrido adicional mediante MARKETING_EDITOR_TESTS=1 y separar salida mediante MARKETING_EVIDENCE_DIR.

No se cambiaron rutas, servicios compartidos, dependencias frontend, endpoints, backend productivo, modelos ni migraciones en Parte 2. La integración de navegación/Productos sigue siendo la realizada en Parte 1. ThemeEditor.tsx conserva el cambio previo ajeno a Marketing.

### Controles funcionales

| Sección | Comportamiento real |
| --- | --- |
| Plantilla | Fotografía: imagen/ficha; Destacado: ficha enmarcada y columnas en cuadrado/banner, filas en historia; Esencial: jerarquía tipográfica y ficha primero. Disponibles en 1:1, 9:16 y 16:9. No cambian datos ni borran ajustes. |
| Textos | Encabezado adicional opcional (48 caracteres), subtítulo (72) con visibilidad y CTA (48, con reserva si vacío). El nombre real permanece separado y no se renombra. Los campos editoriales no admiten HTML, dígitos, importes, porcentajes ni términos comerciales comunes; se informa y no se renderiza texto inválido. No sustituye la responsabilidad editorial humana ni interpreta semánticamente todas las frases posibles. |
| Tipografía | Arial, Georgia y Courier del sistema; tamaño por bloque 85–115%, peso normal/negrita, cursiva, alineación izquierda/centro/derecha, color por bloque. Las preferencias se conservan por bloque. El autoajuste de composición puede reducir proporcionalmente el resultado hasta 65%; si no cabe se bloquea. |
| Colores | Tres paletas y Colores de mi tienda; fondo, texto, acento/imagen y etiqueta/botón. Colores opacos hex validados. Texto con poco contraste se sustituye por negro/blanco y se avisa; precio, oferta y CTA mantienen contraste AA. Retornar a tienda limpia colores por bloque, conservando textos y tipografía. |
| Imagen y logo | Mostrar/ocultar logo local; seleccionar cualquier imagen autorizada del producto; contain/cover, posición arriba/centro/abajo y zoom 100–130%. Sin deformación; aviso de recorte al llenar/zoom. Imagen/logo fallidos tienen reserva de texto. Nombre de tienda permanece. Recursos con no-referrer. |
| Composición | Espaciado amplio/compacto, alineación de ficha, imagen primero/después y visibilidad de subtítulo. No permite ocultar precio, nombre ni alcance comercial. |
| Historial | Deshacer/rehacer de hasta 40 cambios; nuevo cambio limpia futuro. Restablecer vuelve a Fotografía y valores de marca/default, conserva producto/formato y requiere confirmación; se puede deshacer. No guarda borradores ni escribe por cada clic. |

## VALIDADO

Puerta Parte 1 aprobada antes de esta etapa: ../marketing-parte1/estado-automatico.md. Regresión adicional: 323 casos aprobados con Mongo temporal (verificacion-parte2/mongo-regresion.txt), código 0; SQL en SQLite. Se mantiene la exclusión histórica documentada de un caso de migración; no se declara aprobado.

### Comandos y evidencia de esta ejecución

Todos los resultados finales siguientes tienen código de salida **0**. Los conteos se solapan; no sumar como casos únicos.

| Comando (frontend salvo indicación) | Resultado/evidencia |
| --- | --- |
| node tests/marketing-editor.cjs | 5 aprobadas, unit-final.txt: límites/valores inválidos, textos maliciosos/comerciales, contraste, historial/reset y render de 3 plantillas × 3 formatos preservando fuente/marca. |
| node tests/marketing.cjs | 11 aprobadas, parte1-unit.txt, ejecutado después de integrar el editor. |
| npm run build | build-final.txt, TypeScript app/config y Vite aprobados. Sigue aviso preexistente del bundle principal >500 kB. |
| node tests/marketing-browser.cjs, MARKETING_EDITOR_TESTS=1 | browser-final.txt: Edge a 375/768/1440 px, 27 combinaciones de plantilla/formato/viewport, controles efectivos, geometría sin superposición, texto largo/sin espacios, contraste, logo presente/ausente/fallido, imágenes alternativas, reset/cancelar/undo/redo, cambio de producto y teclado. También repite selección/ofertas/variantes, carga/errores/reintento, búsqueda, catálogo vacío, acceso contextual, PDF/configuración y exclusión de promociones locales. Ninguna mutación HTTP y cero errores pageerror. |
| docker exec django_backend python scripts/test_dashboard.py apps.core.test_reports apps.core.test_store_configuration apps.core.test_dashboard apps.core.test_ultimas_ordenes apps.core.test_estados_pedido apps.core.test_order_status_update apps.core.test_pickup apps.core.test_delivery apps.landing.test_contenido apps.landing.test_guardar_configuracion apps.landing.test_consultar_configuracion apps.landing.test_validacion apps.visual_config.test_store_identity | 147 aprobadas, backend-focal.txt. SQLite temporal; incluye PDF real en memoria, configuración, logo/landing, estados, pedidos y retiro. Proveedores simulados según cada test. |
| Pruebas previas de la puerta | ../marketing-parte1/verificacion-parte2/: Mongo real 5, PostgreSQL real 57 y Mongo integración 323; frontend informes 6, dashboard 8+23, visual 47, editor existente 15+58+6 y analytics/checkout aprobados. Ejecutados en esta misma tarea antes de iniciar editor; no se presentan como ejecuciones posteriores. |
| git diff --check; git diff --cached --stat | Sin errores de whitespace ni cambios staged. Solo lecturas Git. |

Navegador usa aplicación local real con API interceptada y fixtures QA. No equivale a editar la tienda comercial. Los tests de servicios reales usan bases temporales Mongo/PostgreSQL y las eliminan; no modifican productos, configuraciones o pedidos comerciales. No hubo pagos ni llamadas a Meta. Para reproducir navegador: DASHBOARD_PLAYWRIGHT_MODULE apunta al Playwright disponible del runtime, MARKETING_EVIDENCE_DIR a esta carpeta/evidencias y URL predeterminada http://127.0.0.1:5173; Edge msedge instalado.

Se revisaron visualmente capturas de la pantalla completa a 1440 px, Fotografía cuadrada móvil, Destacado banner móvil/cuadrado escritorio, Esencial historia móvil/banner tablet, nombre largo y bloqueo de caso extremo. `evidencias/` contiene las 27 piezas editor-*, tres bloqueos, pantallas completas y casos previos sin imagen/nombre largo. Son capturas de QA; **no hay exportación de publicaciones implementada**.

### Fallos encontrados y resueltos

- Compilación inicial: unión del tipo de acciones no discriminaba next; corregida (build-inicial.txt, código 2; build-final.txt, código 0).
- Primer recorrido: el interruptor compartido oculto interceptaba clics de prueba. Se reemplazó solo en Marketing por checkbox nativo visible con área de etiqueta de 44 px (browser-inicial.txt, código 1).
- Ajuste de disposición: la búsqueda se reiniciaba al desmontar el selector con la clave del documento (assert 10 opciones frente a 2). Se aisló DesignSession; el recorrido final pasa esa misma búsqueda en los tres anchos. El intento fallido no se declara aprobado.
- El primer PostgreSQL de la puerta carecía de pypdf: dependencia de pruebas ya declarada instalada en el contenedor y repetición exitosa, documentada en Parte 1.

### Conservación

baseline-parte1.json registra 103 archivos al comenzar Parte 2. conservacion.json no detecta faltantes; solo se extendieron cuatro archivos existentes de Parte 1: types.ts, Marketing.tsx, PublicationPreview.tsx y marketing-browser.cjs. Dominio comercial, servicios, permisos backend y evidencia anterior siguen idénticos. De los 78 archivos anteriores de informes/configuración, 75 siguen idénticos y las otras tres son las integraciones ya registradas de navegación/ayuda/rutas de Parte 1. No se borraron archivos ni se ejecutaron operaciones Git de escritura.

**Veredicto: Parte 2 completa y validada para el alcance local solicitado.** Se comenzó solo después de validar Parte 1. No quedan fallos importantes conocidos en las pruebas aplicables.

## PENDIENTE

- Aceptación humana con catálogo y marca propios; los recorridos gráficos entregados son QA, no una campaña comercial.
- Parte 3 no implementada: exportación a resolución objetivo, tratamiento CORS/proxy y límites/validación de recursos remotos, sincronización de fuentes/imagenes y comparación preview/archivo. Las imágenes actuales se leen de las fuentes existentes; no se garantiza todavía que un recurso externo permita rasterizarse/exportarse.
- Persistencia/borradores: definir propiedad, versión de documento, cambios de catálogo, conflictos y autorización antes de guardar. Hoy todo vive en memoria, incluido historial.
- Subida de imágenes nuevas pospuesta: necesita validación de tamaño/tipo/formato, almacenamiento y permisos. No existe campo de URL ni subida arbitraria en este editor.
- Campañas generales con vigencia y condiciones requieren fuente backend confiable. Solo se publicitan ofertas reales del catálogo; no se inventan fechas, cupones ni descuentos.
- No se ejecutaron cobros reales, revisión humana con dispositivos físicos ni el caso histórico de migración excluido por el script de integración. No se presentan como aprobados.

Propuestas breves para Jira, sin crear tickets: (1) aceptación visual/accesible del editor con marcas reales; (2) pipeline de recursos y exportación Parte 3 con pruebas de resolución/CORS; (3) documento versionado y borradores autorizados; (4) fuente publicable de campañas con vigencia/condiciones compartidas con checkout. Integración social pertenece a una fase posterior.

## BLOQUEADO

Sin bloqueos actuales.
