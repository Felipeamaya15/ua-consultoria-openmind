# SCRUM-473 — Verificación de la carga inicial

Fecha: 2026-10-31. Fuente: archivos reales de la rama `develop` (commit `d379679`). Alcance: Objetivo de carga inicial inferior a 2,5 segundos.

| Campo | Detalle |
| --- | --- |
| Ticket | SCRUM-473 · Verificar objetivo de carga inicial inferior a 2,5 segundos |
| Backlog | BL-396 (relacionado con BL-394, medir, y BL-395, optimizar) |
| Componente | Frontend y API pública del catálogo |
| Versión del código | Rama `develop`, commit `d379679` |
| Fecha | 31 de octubre de 2026 |
| Estado | Mediciones registradas; los valores exactos de LCP y CLS se confirman con el informe de Lighthouse (sección 6.2) |
| Resultado | Condición A (escritorio): **cumple**, LCP aproximado de 1,5 s. Condición B (móvil 4G simulada): **no cumple**, LCP aproximado de 6,4 a 7,1 s |
| Evidencia del equipo | `docs/medicion-carga-inicial-catalogo.json` y las pruebas `sprint7-catalog-load-time.cjs` y `sprint7-catalog-optimization.cjs` |

## 1. Propósito y criterio de aceptación

Este documento verifica si la **carga inicial del catálogo** de la tienda es menor a **2,5 segundos**. El valor coincide con el umbral “bueno” del indicador **LCP** (Largest Contentful Paint), que mide cuánto tarda en aparecer el elemento más grande de la pantalla; por eso se usa como métrica de la carga inicial.

| Condición | Qué se mide | Criterio |
| --- | --- | --- |
| **A. Escritorio, sin limitación de red** (obligatoria) | LCP de `/plantilla/1/catalogo`, mediana de 3 corridas de Lighthouse | Menor a 2,5 s |
| **B. Móvil con red 4G simulada** (informativa, más exigente) | LCP de la misma pantalla, con la simulación de Lighthouse (1,6 Mbps y 150 ms de latencia) | Menor a 2,5 s; si no se cumple, se documenta la causa y la recomendación |

> **Datos que deben acompañar cada medición**
>
> Cantidad de productos activos de la tienda, peso aproximado de sus imágenes y tamaño de la respuesta de `/api/catalog/productos/`. Sin ellos, el tiempo medido no se puede comparar.

## 2. Lo que ya existe en el repositorio

| Evidencia | Resultado | Qué mide |
| --- | --- | --- |
| `docs/medicion-carga-inicial-catalogo.json` | Estado APROBADO con umbral de 2.000 ms: listado 14,7 ms de promedio, catálogo completo con variantes 110,8 ms (5 corridas, 12 productos) y llamada real al backend de 67 ms con 6 productos | Tiempo de datos y de la petición, no de la pantalla |
| `frontend/tests/sprint7-catalog-load-time.cjs` | 2 de 2 pruebas correctas | Carga del listado y de las variantes con respuestas simuladas |
| `frontend/tests/sprint7-catalog-optimization.cjs` | 2 de 2 pruebas correctas | Una sola petición HTTP para listado y variantes, sin N+1; `loading="lazy"` en las tarjetas |

Esa evidencia es útil pero **no responde por sí sola al ticket**: mide la obtención de datos y no el momento en que el comprador ve el catálogo en el navegador (descarga de la aplicación, tipografías, imágenes y pintado). Esa parte es la que se mide en la sección 6.

## 3. Peso de la aplicación compilada

Se compiló la aplicación para producción (`vite build`, 279 módulos) y se midió cada archivo, con y sin compresión gzip.

| Archivo | Sin comprimir | Con gzip | Cuándo se descarga |
| --- | --- | --- | --- |
| `index-*.js` (código común) | 675 KB | 206 KB | Siempre, al inicio |
| `index-*.css` (estilos) | 344 KB | 45 KB | Siempre, al inicio |
| `Catalog-*.js` (pantalla del catálogo) | 24 KB | 6 KB | Al abrir el catálogo |
| `ProductDetail-*.js`, `Checkout-*.js` | 28 KB y 44 KB | 6 KB y 12 KB | Solo al entrar a esas pantallas |
| `ThemeEditor-*.js`, `Marketing-*.js` | 68 KB y 65 KB | 21 KB y 21 KB | Solo en el panel |
| **Todo el sitio (36 archivos)** | **1.489 KB** | **379 KB** |  |

- **Carga mínima para ver la tienda:** unos 251 KB comprimidos (JS y CSS). Con la red simulada de Lighthouse móvil (1,6 Mbps) solo su descarga toma cerca de 1,3 s, y con una red de 100 Mbps menos de 0,1 s.
- **Hay división por rutas:** el panel y el pago no se descargan al abrir el catálogo.
- **Tipografías externas:** `storefront.css` pide Google Fonts con `@import` dentro del CSS. Eso bloquea el pintado hasta resolver esa petición y encadena más peticiones (hoja de estilos de Google y luego los archivos de la fuente).

## 4. Riesgo principal: el peso del listado

La petición que alimenta el catálogo es `GET /api/catalog/productos/`. Según el código:

- Devuelve **todos los productos activos** de la tienda, **sin paginación**.
- Cada producto trae su **primera imagen completa**, que en el sistema se guarda como texto base64 dentro del documento (hasta 2 MB por imagen), más todas sus variantes activas.
- La imagen se convierte a WebP con calidad 90 al subirla, pero **no se redimensiona** (solo se limita a 25 millones de píxeles y 2 MB).
- El servidor **no comprime** las respuestas (no hay `GZipMiddleware`) ni define `Cache-Control` en el catálogo.
- El `loading="lazy"` de las tarjetas no ayuda con la descarga del JSON, porque las imágenes viajan dentro de él.

Por eso la carga inicial depende del peso de las fotos que sube cada emprendedor. Estimación teórica del tamaño del listado y del tiempo de descarga (sin contar latencia ni compresión):

| Productos | Peso de cada foto | Tamaño del listado | Red de 100 Mbps | Red 4G simulada (1,6 Mbps) |
| --- | --- | --- | --- | --- |
| 6 | 100 KB | 0,8 MB | 0,1 s | 4 s |
| 12 | 100 KB | 1,6 MB | 0,1 s | 8 s |
| 12 | 500 KB | 7,8 MB | 0,7 s | 41 s |
| 12 | 2 MB | 32,0 MB | 2,7 s | 168 s |
| 24 | 500 KB | 15,7 MB | 1,3 s | 82 s |
| 24 | 2 MB | 64,0 MB | 5,4 s | 336 s |

> **Cómo leer la tabla**
>
> Con fotos de unos 100 KB, el listado de 6 a 12 productos pesa entre 0,8 y 1,6 MB: se descarga en 0,1 s a 100 Mbps, pero tarda de 4 a 8 s en la 4G simulada. Con fotos de 500 KB y 12 productos son unos 8 MB (0,7 s y 41 s). Con fotos de 2 MB, el máximo permitido, la descarga **pasa de 2,5 s incluso a 100 Mbps**. Si el LCP depende de esas imágenes, la condición B difícilmente se cumpliría sin miniaturas o paginación. Los 67 ms medidos por el equipo corresponden a 6 productos; el JSON de esa medición no indica el peso de sus imágenes.

## 5. Cómo medir

Se mide sobre la **versión compilada** (no el servidor de desarrollo de Vite, que carga cientos de módulos sueltos y no es representativo). Con Docker, en PowerShell desde la raíz del proyecto, con el resto de los servicios arriba:

1. Detener el frontend de desarrollo para liberar el puerto 5173 (el backend solo acepta ese origen):

```powershell
docker compose stop frontend
```

2. Compilar y servir la versión de producción en ese puerto (queda en la terminal, no la cierres):

```powershell
docker compose run --rm --no-deps -p 5173:5173 frontend sh -c "npx vite build --outDir /tmp/dist --emptyOutDir && npx vite preview --outDir /tmp/dist --host 0.0.0.0 --port 5173"
```

3. Cuando aparezca `Local: http://localhost:5173/`, abrir una **ventana de incógnito** de Chrome o Edge y repetir lo siguiente **3 veces**:

- **Network:** F12, pestaña **Network**, marcar **Disable cache**, throttling en **No throttling**, abrir `http://localhost:5173/plantilla/1/catalogo` y anotar de la petición `productos/` su **Size** (tamaño) y **Time**, y al pie de la lista los valores **Finish** y **Load**.
- **Lighthouse:** F12, pestaña **Lighthouse**, modo **Navigation**, marcar solo **Performance**, **Mobile**, **Analyze page load**. Anotar el puntaje y los valores **FCP**, **LCP**, **TBT**, **CLS** y **Speed Index**, y qué elemento es el LCP. Repetir con **Desktop**.
- **Importante:** mantener DevTools acoplado a la ventana de la página y esa ventana en primer plano. Con DevTools en una ventana aparte, Chrome no pinta la página y Lighthouse falla con el error `NO_FCP`.

4. Al terminar, cerrar la terminal con Ctrl+C y volver a levantar el frontend normal:

```powershell
docker compose start frontend
```

## 6. Resultados de la medición

Medido el 31 de octubre de 2026 sobre la versión compilada, en Chrome (ventana de incógnito), en `/plantilla/1/catalogo`. **Datos de la prueba:** 2 productos activos, con fotos de unos 120 KB cada una (estimado a partir del tamaño del listado) y una respuesta de `productos/` de 330 kB.

### 6.1 Red, sin limitación

| Dato | Valor |
| --- | --- |
| Peticiones totales | 29 |
| Datos transferidos / tamaño de los recursos | 1.377 kB / 2.378 kB |
| Peticiones a `productos/` | **2 peticiones de 330 kB cada una** (218 ms y 207 ms): el listado se descarga dos veces (P7) |
| DOMContentLoaded | 225 ms |
| Load | 243 ms |
| Finish | 652 ms |

Con la red local la página queda cargada en menos de 0,25 s y termina de descargar todo en 0,65 s: **cumple con amplio margen**. Es una sola corrida; los tiempos son tan bajos que no justifican repetirla.

### 6.2 Lighthouse, rendimiento

| Métrica | Peso | Escritorio: puntos | Escritorio: valor aproximado | Móvil 4G: puntos | Móvil 4G: valor aproximado |
| --- | --- | --- | --- | --- | --- |
| **LCP** (objetivo: menor a 2,5 s) | 25 | 20 | 1,5 s | 2 | **6,4 a 7,1 s** |
| FCP | 10 | 10 | en el máximo | 4 | 3,2 a 3,5 s |
| TBT | 30 | 30 | en el máximo | 29 | 0,10 a 0,15 s |
| CLS (objetivo: menor a 0,1) | 25 | 3 | **0,54 a 0,62** | 25 | en el máximo |
| Speed Index | 10 | 10 | en el máximo | 9 | 2,9 a 3,8 s |
| **Puntaje total** | 100 | **73** |  | **69** |  |

Los valores en segundos se calcularon a partir de los puntos que muestra el informe, con la curva de puntaje de Lighthouse; son **aproximados** hasta confirmarlos con los valores que el informe muestra junto a cada métrica.

### 6.3 Resultado por condición

| Condición | LCP | Criterio | Resultado |
| --- | --- | --- | --- |
| A. Escritorio, sin limitación de red (obligatoria) | Aprox. 1,5 s | Menor a 2,5 s | **Cumple** |
| B. Móvil con red 4G simulada (informativa) | Aprox. 6,4 a 7,1 s | Menor a 2,5 s | **No cumple** |

> **Por qué falla la condición móvil**
>
> La red simulada de Lighthouse transfiere 1,6 Mbps, y la página descarga 1.377 kB: eso son unos 7 s, que coincide con el LCP de 6,4 a 7,1 s. Esa descarga incluye el listado **dos veces** (660 kB), unos 251 kB de código y las tipografías externas, aun con solo 2 productos de fotos livianas. Con más productos y fotos más pesadas empeora (sección 4).

## 7. Observaciones y recomendaciones

| # | Observación | Severidad | Recomendación |
| --- | --- | --- | --- |
| P1 | El listado público devuelve todos los productos con su primera imagen completa en base64 y sin paginación: su tamaño crece con el número de productos y el peso de las fotos | Alta | Devolver miniaturas (por ejemplo de 400 px, unos 30 KB) o la URL de la imagen, y paginar (por ejemplo 12 productos por página) |
| P2 | Las imágenes se guardan sin redimensionar, hasta 2 MB cada una | Media | Redimensionar al subirlas (por ejemplo 1.600 px de lado mayor) y generar una miniatura |
| P3 | La API no comprime las respuestas ni define caché en el catálogo público | Media | Activar compresión en el proxy de producción (Caddy: `encode gzip`) y un `Cache-Control` corto (por ejemplo 60 s) en el listado |
| P4 | Google Fonts se pide con `@import` dentro del CSS, lo que bloquea el pintado y encadena peticiones | Media | Usar `<link rel="preconnect">` y `<link rel="stylesheet">` en `index.html`, o alojar las fuentes en el propio sitio |
| P5 | La medición del equipo mide datos con respuestas simuladas, con un umbral de 2.000 ms, y con 6 productos reales en la llamada al backend | Baja | Complementarla con LCP en el navegador (sección 6) y con el peso real de las imágenes |
| P6 | El código común pesa 675 KB (206 KB con gzip) y se descarga en toda pantalla | Baja | Revisar dependencias grandes con un analizador de bundle antes de optimizar |
| P7 | El catálogo pide `GET /api/catalog/productos/` dos veces: una desde `StoreContext.tsx` (línea 154) y otra desde `Catalog.tsx` (línea 44). Medido: 2 peticiones de 330 kB | Media | Reutilizar la lista que ya carga el contexto, o compartir un caché entre ambas, para descargarla una sola vez |
| P8 | En escritorio el CLS es de 0,54 a 0,62, bastante sobre el límite de 0,1: el contenido se mueve mientras carga | Media | Localizar el elemento en “Layout shift culprits” del informe y reservar su espacio (ancho y alto de las imágenes, altura mínima de las zonas que se llenan tras la carga) |

#### Lo que ya está bien

- El listado y las variantes llegan en **una sola petición**, sin llamadas adicionales por producto (prueba del equipo).
- Las tarjetas usan `loading="lazy"` y `decoding="async"` para las imágenes.
- La aplicación se divide por rutas: el catálogo no descarga el panel ni el pago.
- Las cargas iniciales tienen estado de carga y reintentos con espera (`fetchInitialLoad`).
- Las imágenes se convierten a WebP al subirlas.

## 8. Conclusión y limitaciones

- **Condición A (escritorio): cumple.** El LCP es de unos 1,5 s y la red local carga la página en 0,24 s, con 2 productos de fotos livianas.
- **Condición B (móvil 4G simulada): no cumple.** El LCP es de unos 6,4 a 7,1 s. La causa principal es el volumen que se transfiere (1.377 kB, con el listado descargado dos veces) frente a una red de 1,6 Mbps, y empeora con más productos o fotos más pesadas (P1 y P7).
- **CLS de escritorio:** de 0,54 a 0,62, sobre el límite de 0,1; debe revisarse (P8).
- **Limitaciones:** una sola medición por modo, con valores en segundos calculados a partir de los puntos del informe; solo 2 productos con fotos livianas; la red de la condición B es una simulación, no un móvil real; la medición del catálogo se hizo en la plantilla 1.
- **Para dar el ticket por cerrado:** confirmar con el informe los valores exactos de LCP (escritorio y móvil) y de CLS, y decidir qué observaciones P1 a P8 se corrigen y cuáles se aceptan.

## 9. Referencias

- `docs/medicion-carga-inicial-catalogo.json` y `frontend/tests/sprint7-catalog-load-time.cjs`: medición del equipo (BL-394).
- `frontend/tests/sprint7-catalog-optimization.cjs`: optimización del listado (BL-395).
- `backend/apps/catalog/presentation/views.py` (`PublicProductListAPIView`) y `serializers.py` (`ProductPublicListItemSerializer`).
- `backend/apps/core/image_processing.py`: procesamiento de imágenes al subirlas.
- `frontend/src/styles/storefront.css`: importación de Google Fonts.
