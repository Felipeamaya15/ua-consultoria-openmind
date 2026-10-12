# Configuración visual — Etapa 1

> Documento de la implementación inicial. La revisión técnica posterior corrigió
> el scope por tienda, la persistencia de colores efectivos y otros problemas.
> El estado vigente está en [visual-config-revision-etapa-1.md](visual-config-revision-etapa-1.md).

Repositorio: `C:\Users\maria\Ecommerce\ua-consultoria-openmind`.
Rama: `feature/mejoras-flujos-tienda`. Estado inicial limpio.

## 1. Arquitectura anterior y auditoría

El panel `Design.tsx` y `ThemeEditor.tsx` guardaban `template`, los tres colores
globales y `themeEditor[template]` mediante `AdminContext` y `adminRepository`.
El almacenamiento es `localStorage`, clave `ua-entrepreneur-demo-v1`, con sobre
`{ version: 1, config: ... }`. Cada personalización de plantilla incluye colores,
`paletteName` e imágenes con `src`, escala, posición y radio.

`StoreContext` leía las personalizaciones de la plantilla indicada por la ruta,
escribía colores en `document.documentElement` y aplicaba los ajustes de imágenes
por índice con un `MutationObserver`. Los colores podían quedar activos al cambiar
de plantilla o volver al administrador. Los colores globales de tiendas sin
`themeEditor` no se aplicaban por ese camino.

Los layouts, homes, catálogo y `ProductCard` distinguen las plantillas con rutas
`/plantilla/1` a `/plantilla/4`, IDs `editorial`, `minimal`, `visual`, `catalog`,
`useStorefrontTemplate` y clases específicas. Su geometría está definida principalmente
con clases Tailwind y CSS, además de ramas de renderizado distintas.

El contenido de la landing se administra por separado. `admin/pages/LandingPage.tsx`
usa `landingService` y `/api/landing/configuracion/` para persistir título,
descripción, CTA, hero, logo, flags y contenido de productos/categorías/beneficios,
contacto y ubicación. `useLandingContent`, `useLandingSectionVisibility` y los
cuatro homes consumen esos datos. `landing/pages/LandingPage.tsx` es una redirección
de compatibilidad; `Layout4.tsx` es un layout separado, no el contenedor visual de
las cuatro rutas actuales. `LandingDetails.css` tiene estilos por plantilla.

Backend auditado:

- `ConfiguracionVisual`: relación con tienda, `plantilla_seleccionada`,
  `logo_negocio` y JSONField `personalizacion`.
- Endpoints `/api/visual-config/plantillas/`, `logo-negocio/` y
  `plantilla-seleccionada/`. El serializer de selección expone solamente la plantilla;
  ningún endpoint actual expone `personalizacion`. El editor local no usa esos
  endpoints para guardar sus colores y ajustes.
- `ConfiguracionLanding` y su serializer contienen los datos de contenido, imágenes
  y flags de la landing, no una configuración tipada de diseño por sección.

Se conservan IDs, rutas, sobre local v1, colores antiguos, imágenes, contenido
remoto y flags de visibilidad de las secciones.

## 2. Arquitectura nueva

`StoreContext.visualConfig` entrega una configuración completa y efectiva.
`StoreVisualRoot` aplica sus variables CSS al mismo contenedor de cada layout.
Los consumidores usan atributos semánticos en lugar de búsqueda de elementos por
posición para el nuevo diseño.

Orden de resolución:

1. `VISUAL_DEFAULTS`.
2. `VISUAL_PRESETS[template].config`.
3. Colores antiguos: globales y luego los de la plantilla activa.
4. `config.visualConfig`, overrides comunes a la tienda.
5. `config.themeEditor[template].visualConfig`, overrides de esa plantilla.

Los colores del formato nuevo tienen prioridad sobre los antiguos. Los controles
de color existentes escriben también un override de color por plantilla para
permitir cambios aun cuando existen colores comunes en el formato nuevo.

## 3. Tipos y contrato

`visual/types.ts` define `VisualSections`, `VisualConfig`, `VisualConfigOverrides`,
`DeepPartial`, `VisualPreset`, `LegacyThemeColors`, `Viewport`, `Alignment`,
`Density`, `Shape`, `Shadow`, `BorderConfig`, `ProductGridConfig`,
`ProductCardConfig`, `SectionConfig` e `InfoConfig`.

Grupos completos: `global`, `topBar`, `header`, `hero`, `heroCta`, `categories`,
`productGrid`, `productCard`, `sections` (`content`, `featured`, `benefits`),
`info`, `contact`, `location`, `footer`, `catalog` y `responsive`.
El catálogo tiene su propio hero opcional, grilla y tarjeta independientes.

Dimensiones y separaciones: píxeles CSS. Ratio de imagen: ancho/alto.
Opacidad: 0..1. Columnas: enteros 1..12. Los valores cero son válidos para
dimensiones, separación, radio y bordes; tamaños de fuente y ratios deben ser
positivos. Colores: hexadecimal de 3/4/6/8 dígitos, `transparent` o `currentColor`.
Familias tipográficas: `sans`, `serif` y `system`, traducidas a familias conocidas.

La versión interna es `1`, independiente de la versión del sobre de almacenamiento.
Una configuración sin versión se interpreta como v1; una versión desconocida se
ignora para renderizar con defaults seguros. No se borran sus datos al cargar o
guardar mediante el repositorio. El resolver ignora claves desconocidas, arrays,
null, tipos incorrectos, enums inválidos y números fuera de rango.

## 4. Presets

| ID conservado | Preset | Diferencias principales |
| --- | --- | --- |
| editorial | Studio Pop | Radio global 8, header inline, hero 640/72, cards 12, footer en 4 columnas |
| minimal | Soft Discovery | Violeta, radio 28, header centrado, hero 680/118, pills, cards 20, spacing amplio |
| visual | Velta Editorial | Radio global 0, header split, hero 760/96, CTA cuadrado, grilla desktop 2, cards de ratio 1 |
| catalog | Obsidian Showcase | Fondo oscuro, naranja, ancho 1160, hero 720/82, cards 14/ratio 1.08, CTA pill |

Los presets son overrides tipados del baseline. Su resolución siempre produce
todos los grupos completos; no se duplica el objeto completo en cada preset.

## 5. Compatibilidad

No se exige que las tiendas antiguas tengan `visualConfig`. Los colores planos,
la plantilla y los ajustes de imágenes siguen disponibles. La carga del panel
hidrata personalizaciones parciales por plantilla sin sustituir `0`, `false` ni
los overrides existentes. Guardar colores o imágenes conserva el resto del diseño.
Las nuevas tiendas reciben colores propios del preset en vez de cuatro paletas
idénticas. Las tiendas que ya guardaron colores conservan esos colores.

## 6. Persistencia y ejemplo

Se reutiliza `adminRepository.save(config)` y el sobre local v1. Se persisten
overrides parciales, no el resultado expandido del resolver.

```ts
const next = {
  ...config,
  visualConfig: {
    version: 1 as const,
    topBar: { visible: false },
    responsive: { mobile: { global: { typography: { baseSize: 14 } } } },
  },
  themeEditor: {
    ...config.themeEditor,
    minimal: {
      ...config.themeEditor.minimal,
      visualConfig: {
        productCard: { radius: 0, padding: 0 },
        catalog: { grid: { columns: { desktop: 4, tablet: 2, mobile: 1 } } },
      },
    },
  },
};
setConfig(next);
```

El repositorio emite `ua-store-config-changed` tras guardar. `StoreContext` escucha
ese evento y `storage` para actualizar tanto el documento actual como otras
pestañas/iframes. Cambiar de ruta resuelve la plantilla de nuevo, evitando colores
residuales. El preview del editor usa el mismo resolver y adaptador CSS.

## 7. Migraciones y backend

No requiere migración para esta etapa. No se modificó backend ni se ejecutó
`migrate`. El JSONField `personalizacion` existente puede almacenar este formato
en una etapa futura, pero todavía requiere un contrato de lectura/escritura y
conectar el repositorio del frontend. La configuración visual sigue siendo local
al navegador; no se sincroniza con otros dispositivos.

## 8. Tests

`npm run test:visual`: 26 casos aprobados. Incluyen todos los casos solicitados,
validación de datos inválidos, versiones futuras, protección contra claves de
prototipo, ausencia de mutación y referencias compartidas, cascada responsive,
grilla/tarjeta propias del catálogo, round trip de persistencia, conservación
de imágenes y overrides al editar colores, actualización de `StoreContext` y
limpieza de observadores/listeners.

También pasaron las 13 suites frontend preexistentes: navegación de cuenta,
carrito/checkout, despacho (54 tests), pedidos cliente, perfil emprendedor,
contenido landing, editor landing, seguimiento, creación y edición de productos,
perfil, feedback de stock y variantes storefront.

No se ejecutaron tests backend porque no se modificó backend.

## 9. Typecheck

`npm run typecheck` aprobado.

## 10. Build y revisión de diff

`npm run build` aprobado. El primer intento dentro del sandbox falló con `EPERM`
al resolver `src/main.tsx`; el mismo comando fuera del sandbox compiló correctamente.
Vite informa un chunk JS mayor a 500 kB. `git diff --check` aprobado.

## 11. Archivos modificados y nuevos

Modificados:

- `frontend/package.json`
- `frontend/src/features/admin/data/adminRepository.ts`
- `frontend/src/features/admin/data/mockAdminData.ts`
- `frontend/src/features/admin/pages/Design.tsx`
- `frontend/src/features/admin/pages/ThemeEditor.tsx`
- `frontend/src/features/admin/types/index.ts`
- `frontend/src/features/storefront/components/store/EditorialLayout.tsx`
- `frontend/src/features/storefront/components/store/ProductCard.tsx`
- `frontend/src/features/storefront/components/store/catalog/CatalogLayout.tsx`
- `frontend/src/features/storefront/components/store/minimal/MinimalLayout.tsx`
- `frontend/src/features/storefront/components/store/visual/VisualLayout.tsx`
- `frontend/src/features/storefront/context/StoreContext.tsx`
- `frontend/src/features/storefront/data/mockData.ts`
- `frontend/src/features/storefront/pages/Catalog.tsx`
- `frontend/src/features/storefront/pages/EditorialHome.tsx`
- `frontend/src/features/storefront/pages/MinimalHome.tsx`
- `frontend/src/styles/storefront.css`

Nuevos:

- `frontend/src/features/admin/data/themeCustomization.ts`
- `frontend/src/features/storefront/components/store/StoreVisualRoot.tsx`
- `frontend/src/features/storefront/visual/types.ts`
- `frontend/src/features/storefront/visual/defaults.ts`
- `frontend/src/features/storefront/visual/presets.ts`
- `frontend/src/features/storefront/visual/resolveVisualConfig.ts`
- `frontend/src/features/storefront/visual/cssVariables.ts`
- `frontend/src/features/storefront/visual/storage.ts`
- `frontend/src/styles/visual-config.css`
- `frontend/tests/visual-config.cjs`
- `docs/visual-config-etapa-1.md`

## 12. Integración mínima y limitaciones

Se aplican ahora: colores principales, fondo/texto del contenedor, tipografía base,
radio global para los tokens existentes, top bar (visible, colores, altura mínima,
alineación), grillas regulares de landing editorial/minimal y catálogo, y tarjetas
de producto compartidas (radio/borde/sombra, padding de cuerpo en grilla, ratio/radio
del contenedor de imagen, títulos/precios, descripción, visibilidad/ancho/forma del
botón). Los controles de compra conservan sus condiciones de stock y disponibilidad.

No se crearon los controles completos del editor. Header, hero, CTA hero, categorías,
sections, info/contact/location, footer, densidad y organización de filtros están
tipados/resueltos pero todavía requieren adaptar sus componentes para consumir todas
sus propiedades. La grilla editorial de VisualHome y las composiciones propias de
CatalogHome/MinimalHome conservan sus estructuras; las tarjetas que esos homes
renderizan directamente como links no consumen todavía el modelo de `ProductCard`.
Las vistas compactas y parte del padding en listas conservan geometría existente.

La top bar usa altura mínima para admitir texto en pantallas pequeñas. El catálogo
solo altera las columnas cuando está en modo grilla; la vista lista sigue siendo lista.
Los tokens de superficie/borde nuevos están disponibles para la siguiente etapa;
los controles heredados conservan sus tokens de texto/superficie originales.

Responsive: desktop desde 1024px, tablet 640–1023px, mobile hasta 639px.
Los overrides tablet heredan desktop y mobile hereda tablet. Las columnas tienen
valores independientes por viewport. El adaptador exporta variables para los tres
tamaños; no hace falta detección JS del ancho ni controles responsive avanzados.

La validación realizada es de tipos, compilación y tests automatizados de resolución,
persistencia y componentes. No se realizó una revisión visual interactiva en navegador.
Los ajustes de imágenes heredados aún usan índices del DOM; reemplazarlos por IDs
estables de sección/imagen queda pendiente.

## 13. Preparado para Etapa 2

- Crear controles por sección sobre `VisualConfigOverrides`.
- Extender el adaptador y los componentes por sección usando `StoreContext.visualConfig`.
- Mantener un único resolver para storefront y preview, con defaults y presets comunes.
- Añadir controles responsive sobre la cascada ya disponible.
- Conectar `adminRepository` con el JSONField backend mediante endpoints de tienda.
- Incorporar revisiones visuales y tests de cada nuevo consumidor del diseño.

## 14. Git status

Rama conservada: `feature/mejoras-flujos-tienda`.
17 archivos modificados y 11 nuevos sin seguimiento, todos correspondientes a esta
etapa. Cambios sin commit. No se hicieron commit, push, merge, reset, rebase ni cambio
de rama. El listado del apartado 11 corresponde al estado de trabajo final.
