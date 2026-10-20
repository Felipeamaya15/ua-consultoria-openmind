# Auditoría previa — 16/10/2026

Rama verificada: feature/mejoras-informes-configuracion. HEAD inicial: 90dc49b.
Se leyeron rutas, cuatro layouts/portadas/cabeceras/pies, contextos, almacenamiento, servicios y resolver de tienda antes de modificar código.

| Ruta | Presentación propia | Hallazgo de identidad |
|---|---|---|
| /plantilla/1 | EditorialLayout + EditorialHome | Cabecera y pie usan config.name; logo config.logo con posible fallback local. |
| /plantilla/2 | MinimalLayout/Header/Footer + MinimalHome | Cabecera fija Mi Tienda.; pie usa nombre de contexto. |
| /plantilla/3 | VisualLayout/Header/Footer + VisualHome | Cabecera fija Velta; firma Velta en portada. Bloque UNIVERSIDAD/Autónoma/de Chile en cabecera blanca, además de InstitutionalBadge en barra azul y pie. |
| /plantilla/4 | CatalogLayout/Header/Footer + CatalogHome | Nombre fijo Mi Tienda en navegación y pie; logo landing.logo. |

## Fuentes compartidas y precedencia actual

- Router: cada plantilla conserva su layout y portada; comparte catálogo, detalle, carrito, checkout, acceso, seguimiento y páginas legales.
- StoreIdentityProvider: GET /api/visual-config/plantilla-seleccionada/ obtiene tienda_id del mismo resolver del backend.
- Django/PostgreSQL: Tienda.nombre/descripcion vía GET/PUT /api/tienda/configuracion/. ConfiguracionLanding vía GET/PUT /api/landing/configuracion/: título, descripción de portada, CTA, logo, imagen, banderas y contenido de contacto/ubicación/beneficios/selección.
- MongoDB: catálogo público /api/catalog/productos/, adaptado por catalogService; seleccionados mediante IDs estables desde contenido.productos_destacados. No se usan mockProducts en las portadas.
- StoreContext: combina defaults, negocio del almacenamiento local, información Django y logo landing. Consume landing/catálogo una sola vez y no resetea todo al cambiar identity. Errores de negocio se silencian y permiten mostrar datos locales antiguos. Puede mantener una respuesta anterior mientras cambia la tienda.
- Colores, tipografías y geometría: resolveStoreVisualConfig → defaults → preset de plantilla → colores heredados → overrides generales → overrides propios de plantilla. Persisten en localStorage con clave de instalación + tienda y envelope de identidad verificado. themeEditor conserva cada plantilla por separado. StoreVisualRoot aplica variables CSS por viewport; el editor escribe esa misma fuente. No se encontró backend de publicación de estilos: no inventar sincronización a servidor.
- Imágenes heredadas: MutationObserver aplica personalizaciones por clave estable o índice. data-landing-image, data-landing-content y data-institutional-branding excluyen contenido de negocio e institucional.
- Administrador: LandingPage contiene BusinessInformation y LandingPageContent; guardados separados en los servicios anteriores. Recuperación heredada es una acción explícita, seguida de guardar. El guardado de nombre emite evento; el de landing no notifica a un proveedor público ya montado.
- Nombre comercial, descripción del negocio, título de portada y descripción de portada son campos distintos. Textos editoriales como Nuestra historia son independientes y no deben reemplazarse automáticamente.

## Logos: función identificada

InstitutionalBadge usa /logo-universidad-autonoma.png y marca institucional independiente (barra y pie). El bloque tipográfico de VisualHeader está escrito a mano, no es un logo comercial ni una imagen configurada: repite la marca institucional dentro de la cabecera comercial. landing.logo es una tercera fuente, propiedad del emprendedor; aunque coincida con UA no se debe borrar por comparación de imagen. Corrección prevista: retirar solamente el bloque institucional redundante de VisualHeader y conservar las marcas institucionales compartidas; el espacio comercial sigue usando logo/nombre persistidos.

## Historial relevante (solo lectura)

90dc49b reorganizó Página principal sin cambiar las fuentes de datos públicas. ecfe68e integró el nombre persistido en StoreContext pero no retiró los nombres fijos de las cabeceras 2/3/4. Los layouts existentes ya difieren; no se atribuye el fallo al merge ni a Marketing sin evidencia. No se reemplazará ninguna cabecera completa.

## Contraste real inicial (GET, sin escrituras)

Docker disponible: frontend 5173, backend 8000, PostgreSQL y MongoDB. Las cuatro consultas públicas devolvieron 200. Tienda 1: nombre Mi tienda, descripción null; título de portada Bienvenido a MiTienda, descripción Aquí encontrarás todo lo que buscas!, logo e imagen configurados; 8 productos. Por tanto el título de portada no es el nombre comercial. Se conservarán los valores reales; las pruebas de guardado se harán con API simulada o base de pruebas aislada.

Restricciones: preservar cambios locales registrados en cambios-previos-sha256.json, evidencias y tmp; sin Git de escritura, migraciones, esquemas ni contratos nuevos.
