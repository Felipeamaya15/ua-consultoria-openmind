# Revisión técnica final — Etapa 1

Repositorio: `C:\Users\maria\Ecommerce\ua-consultoria-openmind`.
Rama conservada: `feature/mejoras-flujos-tienda`.
Revisión realizada sobre los cambios pendientes de Etapa 1, sin commit.

## 1. Problemas encontrados

| Problema comprobado | Consecuencia | Estado |
| --- | --- | --- |
| Clave local única sin identidad | Una instalación/tienda podía leer personalizaciones de otra | Corregido |
| Colores hidratados se guardaban como datos explícitos | Guardar una imagen o cambiar plantilla podía congelar los colores del preset | Corregido |
| Edición de colores por plantilla copiaba colores al nivel global | Afectaba la paleta de otras plantillas | Corregido |
| `patchThemeCustomization` sustituía `visualConfig` superficialmente | Una actualización parcial podía perder overrides hermanos | Corregido |
| Editor mostraba éxito aunque `setConfig` devolviera false | Confirmación de guardado incorrecta | Corregido |
| Variables del draft eran estilos inline del iframe | Las actualizaciones asíncronas de React podían sustituir el preview | Corregido |
| Eventos del editor solo se conectaban al cargar el iframe | Imágenes añadidas después por la carga de contenido quedaban sin eventos | Corregido |
| Datos parciales de imágenes se casteaban sin validar | Escalas y posiciones inválidas podían producir `NaN` | Corregido |
| Ajustes de imágenes no restauraban el DOM al retirar una personalización | Podían quedar fuente y transformaciones del ajuste anterior | Corregido |
| `display: block` de descripción anulaba `line-clamp` | Las descripciones podían dejar de truncarse | Corregido |
| Checkout y Transbank accedían directamente a la clave antigua | El nuevo scope podía dejar lectores/escritores inconsistentes | Corregido |
| Rutas, nombres y algunas unions repetidos | Riesgo de divergencia entre consumidores | Centralizados |
| Tres tokens CSS emitidos sin consumidor | Contrato CSS innecesario | Emisión retirada |

No se encontraron defaults visuales alternativos ni otro algoritmo de resolución
efectiva en StoreContext o ThemeEditor. Los presets son parches del baseline común.

## 2. Correcciones realizadas

`resolveStoreVisualConfig` centraliza la adaptación de configuración persistida,
colores legacy, overrides comunes, overrides por plantilla y drafts del editor.
Todos desembocan en `resolveVisualConfig`; ningún consumidor replica el deep merge.

`mergeVisualOverrides` actualiza parches parciales sin expandir defaults y
`removeVisualOverride` retira una hoja para recuperar herencia, conservando hermanos.
Los tipos comunes de alineación, densidad, forma, sombra, viewport y fuentes se
derivan de constantes reutilizadas por el validador. `templates.ts` centraliza la
relación número/ID; el hook obtiene los nombres de `VISUAL_PRESETS`.

Se separó la identidad en `StoreIdentityContext`. El endpoint público existente
`GET /api/visual-config/plantilla-seleccionada/` ahora añade `data.tienda_id`, resuelto
por el mismo `resolver_tienda` del backend. Conserva `plantilla_seleccionada` y su
comportamiento anterior, incluso cuando aún no existe configuración visual.
No acepta que el cliente seleccione otra tienda.

El backend solo recibió ese campo adicional de respuesta. No se modificaron modelos
ni schema, no se prepararon migraciones y no se ejecutó `migrate`. Los tests nuevos
son `SimpleTestCase`, con acceso a BD prohibido y gestores mockeados; no crean BD
de pruebas ni ejecutan migraciones.

## 3. Merge: profundo

La resolución efectiva usa deep merge dirigido por el schema de defaults:

`defaults → preset → colores legacy → overrides tienda → overrides plantilla`.

Se conservan hermanos al modificar una hoja de `heroCta`, `productCard.border`,
columnas o responsive. Desktop es la base, tablet la sobreescribe y mobile hereda
tablet antes de aplicar su propio parche.

`0` y `false` válidos se conservan. Un string vacío se conserva donde es un valor
admitido, por ejemplo `paletteName`, fuente de imagen o descripción del negocio.
Para colores, enums, tamaños de fuente y ratios, los valores inválidos se ignoran
y continúa el valor del nivel anterior. Arrays y null no sustituyen ramas de objetos.
La resolución no muta inputs, presets ni defaults y no comparte sus referencias.

El ejemplo conceptual `hero.cta.radius` corresponde en este contrato a
`heroCta.radius`; actualizarlo no altera `hero.titleSize`, overlay o alineación.

## 4. Scope de localStorage

Clave efectiva:

```text
ua-entrepreneur-demo-v1:store:<encodeURIComponent(apiBaseUrl)>:<encodeURIComponent(storeId)>
```

Sobre persistido:

```ts
{
  version: 1,
  identity: { apiBaseUrl: 'https://api.example.test', storeId: '7' },
  config: { /* datos existentes y overrides parciales */ }
}
```

La versión del sobre sigue siendo v1. La versión del contrato visual también es 1
y se valida por separado. Se comprueba la identidad del sobre además de la clave.
El namespace identifica tanto la instalación del backend como la tienda; el propio
localStorage ya pertenece al origen del frontend.

## 5. Evitar contaminación entre tiendas

- El ID proviene del backend, no de un query param, una constante `1` ni el token
  de un usuario usado como sustituto de tienda.
- Antes de confirmarlo, no se leen overrides locales. El storefront usa defaults y
  el panel espera la identidad antes de permitir edición.
- Si falla la identidad, el panel muestra un error y no persiste datos; el
  storefront puede seguir mostrando los defaults y sus estados de carga remota.
- `AdminProvider` remonta el estado con una key basada en la identidad, evitando
  reutilizar el estado local de otra tienda.
- Eventos `storage` y eventos internos se filtran por la clave de esa tienda.
- Sobres corruptos, arrays, versiones desconocidas o identidades diferentes no se
  aplican. El acceso a localStorage se protege también cuando no existe o se deniega.
- El editor y storefront comparten normalización de imágenes y se restauran los
  estilos/fuentes anteriores al retirar una configuración de imágenes.

**Datos antiguos sin identidad:** la clave global original se conserva intacta,
pero no se aplica automáticamente a ninguna tienda. No hay información suficiente
para atribuirla sin riesgo. V1 con identidad coincidente sí se puede leer y el
próximo guardado escribe en su clave propia. Los formatos legacy de colores,
plantilla e imágenes siguen siendo compatibles dentro de un scope identificado.
Recuperar la clave antigua sin identidad requiere confirmar su tienda de origen
y una importación explícita; esta revisión no adivinó ese vínculo.

## 6. Overrides al cambiar preset

El repositorio hidrata datos para la UI, pero al guardar evita persistir colores
que solo fueron calculados. No escribe radios, tamaños ni ramas completas del
resultado de `resolveVisualConfig`. Las imágenes y los overrides explícitos se
conservan al cambiar `config.template`.

Un cambio futuro del radio o color del preset se refleja en las propiedades que
la tienda no personalizó. Un radio personalizado `0`, padding `0`, flag `false`
o un valor legacy explícito siguen ganando sobre el preset. Al editar colores
se escribe el override de esa plantilla y se evita duplicarlo en campos legacy
supersedidos o copiarlo al nivel global.

Los tests modifican temporalmente defaults de presets y verifican ambos caminos:
herencia de propiedades sin personalización y conservación de overrides explícitos.
Retirar una hoja con `removeVisualOverride` recupera la herencia del nivel inferior.

## 7. CSS y consumidores pendientes

El adaptador genera strings válidos para los tres viewports y no emite undefined,
NaN o Infinity. La nomenclatura de variables y las referencias en CSS están
verificadas para los cuatro presets. La descripción visible usa `-webkit-box`
para conservar los `line-clamp` de las cards.

Se retiró la emisión y los aliases de estas variables sin consumidor funcional:

- `--visual-surface` (`global.colors.surface`).
- `--visual-border` (`global.colors.border`).
- `--visual-base-spacing` (`global.baseSpacing`).

Sus propiedades continúan en el contrato y no se perdieron datos persistidos.
No quedan esos tokens huérfanos en el adaptador. Las otras variables emitidas se
consumen en la raíz, top bar, grillas, cards o tokens Tailwind existentes.

Header, hero, CTA hero, categorías, secciones, info/contact/location, footer,
densidad y organización de filtros siguen tipados/resueltos y pendientes de
adaptación completa. No se añadieron consumidores ni controles nuevos para ellos.

## 8. StoreContext y StoreVisualRoot

StoreContext conserva las llamadas y estados de landing y catálogo, cancelación
de efectos y manejo de errores. No absorbe la identidad ni la administración de
autenticación: esa identidad tiene su contexto independiente. Sigue exponiendo
`visualConfig` efectiva y los campos anteriores de la tienda/landing/productos.

La resolución está memoizada por plantilla activa y snapshot de storage; navegar
entre productos de una misma plantilla no recalcula el diseño por el mero cambio
de pathname. StoreVisualRoot mantiene una sola raíz y memoiza el objeto de variables
por referencia de configuración. No escribe variables en `documentElement`.
El render SSR de ambos fue probado con React real y sin globals de navegador.

Las variantes, stock, carrito, filtros, pedidos y auth remota conservan sus flujos.
El checkout ahora lee sus preferencias locales mediante `storePreferences` con la
misma identidad, sin perder flags false. Los métodos de pago siguen viniendo de la
API; se eliminó la copia local obsoleta del formulario Transbank.

## 9. ThemeEditor y Design

Los controles existentes leen colores efectivos mediante el mismo resolver y
escriben overrides por plantilla. Los cambios de imágenes conservan los overrides
de diseño y los cambios de color conservan imágenes y propiedades hermanas.

ThemeEditor aplica el draft mediante una hoja de variables en el iframe. Esa hoja
es propia del preview y sobrevive a los renders asíncronos del storefront. Un
MutationObserver de childList en body conecta imágenes añadidas posteriormente,
usa la referencia actual del draft y se desconecta al recargar/cerrar el preview.
Solo se muestra éxito si `setConfig` devolvió true.

No se añadieron controles nuevos ni se implementó todavía el editor por sección.

## 10. Tests

- **47 casos** de `visual-config.cjs`, todos aprobados.
- **14 archivos de suites frontend** ejecutados, incluyendo la suite visual y las
  13 preexistentes; todos aprobados. La suite de despacho reporta además sus
  **54 tests** aprobados. Las otras suites existentes usan grupos de assertions
  sin un contador uniforme; no se inventó un total de casos para esos grupos.
- **4 tests backend** del contrato de identidad, aprobados sin acceso a BD.

Cobertura añadida: dos tiendas y dos APIs, sobre con identidad equivocada, storage
corrupto, v1 identificado/no identificado, ausencia de identidad, SSR y storage
denegado, deep merge en edición, reset de hojas, cambio de preset conservando
overrides, herencia tras cambios futuros de presets, imagen/plantilla sin congelar
colores, separación de colores entre plantillas, variables CSS, line-clamp,
preview asíncrono, éxito/fallo de persistencia, IDs inválidos/fuera de rango y
limpieza de imágenes/listeners/observadores.

## 11. Typecheck

`npm run typecheck` aprobado. El build también ejecuta este script.

## 12. Build

`npm run build` aprobado fuera del sandbox, por la restricción EPERM de Vite
comprobada anteriormente. Continúa el warning de chunk mayor a 500 kB. No se
modificó el empaquetado como parte de esta revisión.

## 13. Diff y operaciones Git

`git diff --check` aprobado. No se hicieron commit, push, merge, rebase, reset ni
cambio de rama. No se ejecutaron migraciones. Permanecen también los cambios de
la implementación anterior sin commit.

## 14. Archivos ajustados durante esta revisión

Modificados respecto del estado recibido de Etapa 1:

- `backend/apps/visual_config/views.py`
- `frontend/src/main.tsx`
- `frontend/src/features/admin/components/TransbankConfigForm.tsx`
- `frontend/src/features/admin/context/AdminContext.tsx`
- `frontend/src/features/admin/data/adminRepository.ts`
- `frontend/src/features/admin/data/themeCustomization.ts`
- `frontend/src/features/admin/pages/Design.tsx`
- `frontend/src/features/admin/pages/ThemeEditor.tsx`
- `frontend/src/features/admin/types/index.ts`
- `frontend/src/features/storefront/context/StoreContext.tsx`
- `frontend/src/features/storefront/hooks/useStorefrontTemplate.ts`
- `frontend/src/features/storefront/pages/Checkout.tsx`
- `frontend/src/features/storefront/visual/types.ts`
- `frontend/src/features/storefront/visual/resolveVisualConfig.ts`
- `frontend/src/features/storefront/visual/cssVariables.ts`
- `frontend/src/features/storefront/visual/storage.ts`
- `frontend/src/styles/visual-config.css`
- `frontend/tests/visual-config.cjs`
- `frontend/tests/cart-checkout.cjs`
- `frontend/tests/checkout-shipping.cjs`
- `docs/visual-config-etapa-1.md` (enlace al estado vigente)

Nuevos de esta revisión:

- `backend/apps/visual_config/test_store_identity.py`
- `frontend/src/features/storefront/context/StoreIdentityContext.tsx`
- `frontend/src/features/storefront/services/storeIdentityService.ts`
- `frontend/src/features/storefront/services/storePreferences.ts`
- `frontend/src/features/storefront/visual/templates.ts`
- `frontend/src/features/storefront/visual/imageSettings.ts`
- `docs/visual-config-revision-etapa-1.md`

El resto de cambios de Etapa 1 se conserva. Defaults y presets fueron auditados
y no necesitaron reescritura. ProductCard/Catalog fueron verificados con sus
tests y con la corrección de CSS; no recibieron controles ni flujos nuevos.

## 15. Recomendación

**Sí, recomiendo avanzar a Etapa 2** sobre esta base corregida. Resolución,
deep merge de edición, presets, herencia, persistencia e identidad están
centralizados y cubiertos por tests.

Frontend y backend deben usar conjuntamente el contrato que incluye `tienda_id`;
con un backend anterior, el panel falla de forma segura al no confirmar identidad.
La persistencia visual sigue siendo local al navegador. La clave antigua sin
identidad necesita una atribución explícita antes de importarse. No hubo validación
visual interactiva en navegador; debe acompañar la integración de consumidores
y controles por sección en Etapa 2. Las imágenes heredadas aún usan índices del DOM.
