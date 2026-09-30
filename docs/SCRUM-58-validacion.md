# SCRUM-58: landing configurable por tienda

## Arquitectura y persistencia

Se reutilizan ConfiguracionLanding, su OneToOne con Tienda, resolver_tienda y el mismo GET/PUT `/api/landing/configuracion/`. GET es público; PUT exige el propietario activo de la tienda local. No se agregó una configuración global ni endpoints paralelos.

Se conserva `secciones` como objeto de booleanos con las claves existentes. El nuevo campo JSON `contenido` agrupa selecciones y datos editables. Modelo de datos:

```json
{
  "titulo": "QA SCRUM-58",
  "descripcion": "Configuración persistida correctamente",
  "texto_boton": "Ver productos",
  "secciones": {
    "Productos destacados": true,
    "Categorías": true,
    "Beneficios": true,
    "Información de contacto": true,
    "Mapa / ubicación": true
  },
  "contenido": {
    "productos_destacados": [],
    "categorias": [],
    "beneficios": [
      {"titulo": "Título ingresado por el propietario", "descripcion": "Descripción ingresada", "icono": "truck"}
    ],
    "contacto": {"telefono": "", "whatsapp": "", "correo": "", "instagram": "", "facebook": "", "sitio_web": "", "horario": ""},
    "ubicacion": {"direccion": "", "comuna": "", "ciudad": "", "region": "", "enlace_maps": ""}
  }
}
```

Las listas del ejemplo están vacías intencionalmente: deben seleccionarse referencias reales de la tienda, no copiar IDs de ejemplo.

- Productos: hasta 6 IDs MongoDB, en orden de selección. Se guardan IDs estables de `/api/catalog/productos/`; los enlaces usan sus slugs actuales. No se duplican nombres, precios ni imágenes. El backend valida que los productos estén activos y pertenezcan a la tienda. El público omite referencias que dejaron de estar activas o fueron eliminadas, sin sustituirlas por otros productos.
- Categorías: hasta 6 valores únicos del campo categoria del catálogo activo. El proyecto no tiene entidad/ID de categoría; por eso se guarda el valor canónico existente. No se crea una relación ficticia. Se validan contra los productos de la misma tienda. Si cambia el nombre o desaparece la categoría, hay que volver a seleccionarla.
- Beneficios: hasta 4, con título de hasta 100 caracteres, descripción de hasta 250 e icono predefinido (`truck`, `lock`, `return`, `chat`).
- Contacto: campos opcionales; redes sociales y sitio web requieren URL HTTP/HTTPS completa. WhatsApp se ingresa como número con código de país y se convierte a enlace wa.me.
- Ubicación: datos opcionales y URL de Google Maps. Se muestra dirección y botón Ver en Google Maps. No se agregó iframe, proveedor de mapas ni coordenadas, para mantener simple la integración.

Configuraciones anteriores reciben contenido={} mediante la migración, manteniendo hero, imágenes, logo y banderas. Los clientes anteriores que omiten contenido en PUT conservan el contenido almacenado. Una bandera ausente conserva visibilidad anterior, pero una sección sin datos no se muestra. Los datos desactivados permanecen almacenados; se validan también al guardar. El panel permite retirar selecciones que ya no existen. No se generan contenidos demo para configurar una tienda antigua.

## Panel y plantillas

`/emprendedor/landing` consulta backend y catálogo reales. Cada sección tiene switch y controles; los controles se deshabilitan al apagarla, conservando datos. Un único PUT multipart guarda hero, archivos, banderas y contenido. Solo una respuesta exitosa muestra confirmación; los errores de validación y conexión son visibles. El logo admite JPG/PNG/WebP hasta 1 MB; la imagen principal hasta 2 MB. Omitir un archivo existente lo conserva; quitarlo envía el campo vacío.

Las rutas y layouts originales no se modifican. `/` sigue dirigiendo a `/plantilla/1` y `/landing` sigue como alias a `/`.

| Contenido | Editorial (1) | Minimal (2) | Visual (3) | Catalog (4) |
| --- | --- | --- | --- | --- |
| Productos seleccionados | Grilla Destacados | Tarjetas del hero, Descubrimiento (4), banner y Más para ti (restantes) | Composición original, de 1 a 6 tarjetas | Primer seleccionado en bloque destacado, restantes en Seleccionados para ti |
| Categorías seleccionadas | Barra del header y grilla | Botones bajo buscador | Sin módulo de categorías; no se agregó | Sin módulo de categorías; no se agregó |
| Beneficios | Franja original, con descripción | Bloque compartido añadido usando estilos de la plantilla | VisualBenefits original | Bloque de beneficios del footer original |
| Contacto | Bloque compartido al final de inicio | Igual | Igual | Igual |
| Ubicación | Bloque compartido al final de inicio | Igual | Igual | Igual |

Contacto y ubicación no tenían componentes existentes: se añadió un solo componente compartido con el tono de cada plantilla, sin sustituir header, hero, secciones, navegación ni footer. Minimal no tenía beneficios: se reutiliza ese componente compartido. No se fuerza un nuevo módulo de categorías en Visual/Catalog.

Los bloques de productos configurables ya no consumen mockProducts/visualProducts. `mockData.ts` solo recibió un campo opcional catalogId en el tipo Product; no se añadieron productos demo. Se reutilizan el adaptador y servicio real de catálogo. Las imágenes de hero, logo y bloques configurados están protegidas de sustituciones por el editor de imágenes local. Los textos e imágenes editoriales de secciones ajenas (por ejemplo, historia de Visual) permanecen como estaban y no forman parte de este editor.

## Migración y arranque

Existe una sola migración nueva, `landing.0003_configuracionlanding_contenido`, ya aplicada en el entorno local inspeccionado. Desde la raíz del repositorio:

```powershell
docker compose exec backend python manage.py migrate landing
docker compose restart backend frontend
```

No eliminar volúmenes. PostgreSQL conserva configuración; el directorio backend/media mantiene los archivos en el volumen de desarrollo. Django sirve /media/ con DEBUG; producción requiere servir MEDIA_ROOT mediante el servidor de archivos.

## Prueba completa

1. Tener al menos tres productos activos y dos categorías distintas en el catálogo real de esta tienda. En el entorno revisado había cero productos activos, por lo que no se crearon datos demo para completar este paso.
2. Iniciar sesión como propietario y abrir `/emprendedor/landing`.
3. Configurar título, descripción, CTA e imagen; seleccionar tres productos y dos categorías; crear cuatro beneficios propios; ingresar teléfono, WhatsApp, correo, Instagram, dirección y URL de Google Maps.
4. Activar las secciones y pulsar Guardar Landing Page. Recargar el panel: selecciones y campos deben permanecer.
5. Consultar GET `http://localhost:8000/api/landing/configuracion/` en Postman sin autenticación. Comparar `data.contenido` y `data.secciones` con el panel.
6. Abrir `/plantilla/1`, `/plantilla/2`, `/plantilla/3` y `/plantilla/4`. Revisar productos configurados, beneficios, contacto y dirección. Categorías se muestran solo en Editorial y Minimal, que tienen ese módulo. El hero y navegación deben conservar su diseño.
7. Abrir un producto: debe navegar con su slug actual al detalle de la misma plantilla. El CTA principal lleva a `/plantilla/N/catalogo`; Minimal conserva su búsqueda.
8. Desactivar una sección, guardar y recargar: no debe renderizarse. Reactivarla: debe mostrar sus datos anteriores. Vaciar una sección activa: debe quedar oculta.
9. Eliminar/desactivar un producto seleccionado: no debe aparecer públicamente ni ser reemplazado por otro. El panel indicará la referencia no disponible para quitarla o sustituirla.
10. Reiniciar con el comando anterior y repetir GET, panel y cuatro portadas.

Para PUT directo en Postman: usar `Authorization: Token TU_TOKEN` del propietario y raw JSON con el contrato anterior. Para imágenes, Body form-data: titulo, descripcion, texto_boton; secciones y contenido como texto JSON; imagen_principal y logo como File. No establecer Content-Type manualmente. Crear devuelve 201; actualizar devuelve 200. Datos inválidos devuelven 400, usuario no propietario 403 y catálogo no disponible durante validación 503.

## Validación realizada y límites

- Compilación frontend y Django check correctos; comprobación de migraciones sin cambios pendientes del modelo.
- 46 pruebas backend de landing con una base SQLite temporal y migraciones deshabilitadas: persistencia, JSON/multipart, permisos, pertenencia de selecciones a tienda, límites, enlaces, banderas, clientes anteriores y conservación de datos desactivados.
- `node tests/landing-content.cjs`, ejecutado desde frontend: referencias por ID, productos retirados, 0/1/3/6 selecciones en cuatro plantillas, visibilidad, ausencia de bloques vacíos, hero, contacto/Maps, editor y serialización multipart.
- PostgreSQL/Mongo reales: PUT, GET público, lectura del modelo y desactivación sin borrar contenido, dentro de una transacción revertida. El catálogo local tiene cero productos activos; la selección de tres productos/dos categorías reales no pudo completarse allí.
- Backend/frontend reiniciados. Se revisaron el formulario real y las cuatro portadas en navegador: hero existente conservado, sin bloques configurables vacíos ni productos demo. No se guardaron datos de contacto/dirección de prueba en la tienda real.
- El comando estándar de tests PostgreSQL sigue teniendo el bloqueo previo del repositorio al crear auth_user en el esquema de pruebas; por eso se usó la base temporal. No se modificaron migraciones ajenas para resolverlo.
- Categorías sin entidad propia: son valores canónicos de texto, no IDs; renombrarlas requiere actualizar selección.
- Sin mapa embebido ni latitud/longitud. Se utiliza el enlace de Maps configurado.
- No se hizo commit ni push.

## Archivos modificados en esta ampliación

- `backend/apps/landing/models.py`
- `backend/apps/landing/serializers.py`
- `backend/apps/landing/views.py`
- `backend/apps/landing/content_serializers.py`
- `backend/apps/landing/migrations/0003_configuracionlanding_contenido.py`
- `backend/apps/landing/test_contenido.py`
- `frontend/src/features/admin/pages/LandingPage.tsx`
- `frontend/src/features/admin/components/LandingContentEditor.tsx`
- `frontend/src/features/admin/components/ui/ImageUpload.tsx`
- `frontend/src/features/landing/types/landing.types.ts`
- `frontend/src/features/landing/types/landingContent.ts`
- `frontend/src/features/landing/services/landingService.ts`
- `frontend/src/features/landing/hooks/useLandingContent.ts`
- `frontend/src/features/landing/components/LandingDetails.tsx`
- `frontend/src/features/landing/components/LandingStatus.tsx`
- `frontend/src/features/storefront/context/StoreContext.tsx`
- `frontend/src/features/storefront/data/mockData.ts`
- `frontend/src/features/storefront/services/catalogService.ts`
- `frontend/src/features/storefront/pages/EditorialHome.tsx`
- `frontend/src/features/storefront/pages/MinimalHome.tsx`
- `frontend/src/features/storefront/pages/VisualHome.tsx`
- `frontend/src/features/storefront/pages/CatalogHome.tsx`
- `frontend/src/features/storefront/components/store/EditorialLayout.tsx`
- `frontend/src/features/storefront/components/store/visual/VisualBenefits.tsx`
- `frontend/src/features/storefront/components/store/catalog/CatalogFooter.tsx`
- `frontend/tests/landing-content.cjs`
- `docs/SCRUM-58-validacion.md`


## Mejora de carga y formatos del editor (30-09-2026)

La carga inicial del panel muestra `Cargando configuración...`. Configuración y
catálogo se solicitan en paralelo. Cada GET del panel reintenta hasta tres veces
más ante errores de red o respuestas 408, 429 y 5xx, con esperas de 750, 1000 y
1500 ms. Los errores de autorización/validación no se reintentan. No se reintenta
el PUT. Al salir se cancelan solicitudes y esperas pendientes.

Mientras llega el catálogo se muestra `Cargando productos y categorías...` y se
conservan las selecciones, sin marcarlas como retiradas ni sustituirlas. El error
se muestra únicamente cuando termina la carga con fallo. El resto del formulario
puede editarse mientras carga el catálogo; la respuesta del catálogo no reinicia
los campos del formulario.

El horario permite seleccionar días de lunes a domingo y apertura/cierre mediante
inputs `time`. Se almacena en `contenido.contacto.horario`, por ejemplo
`Lunes: 09:00–18:00; Sábado: 10:00–14:00`. El horario de texto antiguo se conserva
hasta que el usuario pulsa explícitamente `Configurar horario por día`. Los días
seleccionados requieren ambas horas. Un cierre anterior a la apertura se interpreta
como atención hasta el día siguiente. No se añade una fecha de calendario: el
requisito aclarado corresponde a días de la semana.

La dirección se selecciona en orden región → provincia (filtro) → comuna → ciudad/
localidad → calle y número. Se incluyen datos oficiales locales de SUBDERE e INE,
sin solicitudes adicionales durante la carga. Consultar
`frontend/src/features/admin/data/README.md` para fuentes y antigüedad del listado.
Existe `Otra localidad` para nombres ausentes del listado censal. Los valores
antiguos se mantienen; nombres regionales abreviados como Metropolitana siguen
permitiendo filtrar. Cambiar región/provincia/comuna vacía únicamente las selecciones
dependientes, por acción del usuario. Los reintentos no vacían datos.

La provincia no añade un campo persistido: filtra las comunas y se reconstruye
a partir de la comuna seleccionada. Se reutilizan región, comuna, ciudad y dirección.
Esta mejora no modifica backend ni necesita migraciones.

Validación adicional desde `frontend`:

```powershell
npm run build
node tests/landing-content.cjs
node tests/landing-editor.cjs
```

Para comprobarlo en pantalla, abrir `/emprendedor/landing`, configurar dos días
con horarios diferentes, seleccionar región/provincia/comuna/ciudad y guardar.
Recargar el panel y abrir la plantilla pública para comprobar horario y ubicación.
Para comprobar los reintentos, cargar el panel durante un reinicio local breve del
backend: primero debe mostrar carga y recuperarse si vuelve antes de agotar intentos.
Si sigue indisponible, se muestra un mensaje de error comprensible al terminar.

Archivos de esta mejora:

- `frontend/src/core/http/initialLoad.ts`
- `frontend/src/features/landing/services/landingService.ts`
- `frontend/src/features/storefront/services/catalogService.ts`
- `frontend/src/features/admin/pages/LandingPage.tsx`
- `frontend/src/features/admin/components/LandingContentEditor.tsx`
- `frontend/src/features/admin/components/WeeklyHoursEditor.tsx`
- `frontend/src/features/admin/components/ChileAddressEditor.tsx`
- `frontend/src/features/admin/data/chileTerritory.json`
- `frontend/src/features/admin/data/chileLocalities.json`
- `frontend/src/features/admin/data/README.md`
- `frontend/tests/landing-editor.cjs`
- `frontend/tests/landing-content.cjs`
- `docs/SCRUM-58-validacion.md`
