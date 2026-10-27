# QA final — SCRUM-455 y SCRUM-456

Fecha: 24 de octubre de 2026. Ecommerce OpenMind.

## Dictamen

**SCRUM-455: APTA PARA FINALIZAR en el código corregido.**

**SCRUM-456: APTA PARA FINALIZAR en el código corregido.**

La aprobación corresponde a las correcciones del commit `87aa120`, verificadas sobre la integración `8f8ab3a`. El código original de `8f8ab3a` requería corregir confirmaciones falsas de pagos y un filtrado insuficiente de campos sensibles. No se declara que esa versión original estuviera libre de estos defectos.

Las observaciones de dependencias de desarrollo y bundle se documentan como deuda. Según la instrucción de publicación del usuario, no bloquean por sí solas estas tareas. La integración y publicación autorizadas se realizan después de terminar las validaciones; el hash final y la comprobación remota se entregan en la respuesta de cierre. No se ha cambiado el estado de las tareas en un gestor de proyectos.

## Procedencia, protección y método

Se ejecutó `git fetch origin` y se confirmó que el worktree reutilizado estaba limpio y coincidía con `origin/develop`: `8f8ab3af45c4884ef6b75e777e4764f9af41ecad`. Se revisaron `6af1365`, `f408af4`, `7c990e7`, `27eef3d` y el antecedente `f5c880e`. Al retomar, el remoto seguía en `8f8ab3a`; las cuatro correcciones ya estaban guardadas en `87aa120` y el informe aún no existía.

Rama de correcciones: `fix/SCRUM-455-456-qa-final`. Worktree: `C:\Users\maria\Ecommerce\ua-consultoria-openmind\integracion-scrum455456`.

Las escrituras de navegador/HTTP se ejecutaron con datos artificiales en Postman local con estado en memoria. El backend se probó en Docker montando el código del worktree, con bases temporales de pruebas. Las cuatro páginas legales existentes se comprobaron además mediante lecturas de la aplicación local, con escrituras bloqueadas. No se efectuaron cargos, envíos de correo, eliminaciones de producción ni publicaciones legales reales.

Se distinguen las pruebas automatizadas de navegador, las suites unitarias/de componentes/estáticas y la inspección visual de capturas. No hubo interacción manual humana ni auditoría con lector de pantalla. No se presentan inspecciones estáticas como recorridos funcionales aprobados.

## SCRUM-455 — funcionalidades verificadas

| Área | Verificación ejecutada |
| --- | --- |
| Productos | Navegador: validación sin POST inválido, crear, editar, desactivar, recargar y abrir «Editar precios». Cambiar el mínimo conserva el precio de variante. Suites de creación, edición, stock y variantes aprobadas. |
| Promociones | Navegador: crear, editar, activar/desactivar y eliminar con confirmación posterior al guardado. HTTP: ciclo CRUD y comprobación de lista. Validaciones en la suite `promotions`. |
| Pedidos | Navegador: preparación, envío, entrega, cancelación y recarga. Selector/texto coinciden con el estado confirmado. Estado guardado con correo fallido informa ambos resultados. Backend de estados aprobado. |
| Transferencias | Navegador: aprobar/rechazar y actualizar lista, con recarga. Configuración y validación cubiertas por suites frontend/backend. |
| Negocio/portada | Navegador: nombre, portada, una escritura ante doble activación, fallo conservando edición y guardado parcial con aviso diferenciado. Contenido/secciones cubiertos también por suites de editores y bloques. |
| Marketing | Navegador: personalización, guardar/recuperar borrador y recargar, error de cuota sin éxito anterior, barra de acciones accesible a 375 px y sin desbordamiento. Mensaje de borrador local sin publicar. Creación/edición y productos también cubiertos por suites de componentes. |
| Pagos | Navegador: guardar configuración, error del servidor, nueve respuestas mal formadas entre las tres pasarelas, recuperación y una petición ante doble activación. No se ejecutaron pagos. |
| Correos | Navegador: guardar plantilla y fallo posterior sin éxito falso. Backend de plantillas aprobado. No se enviaron correos reales. |
| Entregas | Navegador: guardar, recargar, fallar y recuperar. Suites de configuración backend aprobadas. |
| Contactos/exportación | Navegador: lista, CSV artificial descargado y fallo sin anuncio de generación exitosa. Archivo `contactos-qa.csv` comprobado. |
| Acceso de clientes | Navegador: confirmación explícita de almacenamiento local y persistencia tras recargar. |
| Plantillas/diseño | Navegador: aplicar plantilla, conservar selección local y no cambiar catálogo/contenido. Suites del editor visual aprobadas. |
| SEO/analítica | Navegador: persistencia local, recarga y fallo de almacenamiento. Suites de SEO, Google Analytics y Meta Pixel aprobadas. No se verificó recepción externa de eventos. |
| Perfil | Navegador: guardar correo, recargar y conservar edición tras error. Veinte pruebas backend de perfiles aprobadas. |

### Hallazgos corregidos

1. **Pagos:** se reprodujo éxito con `{exito:true,data:{}}`. Las tres pasarelas ahora requieren `activo` y `configurado` booleanos y `ambiente` string antes de confirmar; reflejan el estado `configurado` devuelto. Ante una respuesta ambigua se comunica que no pudo confirmarse el guardado y se pide comprobarlo antes de repetir.
2. **Identidad:** se elimina el fallback de nombre/descripción/logo obsoletos desde almacenamiento local; se conserva la configuración visual restante. Es un defecto preexistente, no una regresión introducida por SCRUM-455/456.
3. **CSS:** `PickupEditor.tsx` usa `var(--muted-foreground)`. El warning desapareció del build. El backend shipping protegido no se modificó.

Pendientes fuera de esta aprobación: proveedores de pago reales, correo externo, recepción en cuentas analíticas, accesibilidad manual y combinaciones de todos los dispositivos. No son necesarios cargos ni publicaciones reales para validar estas confirmaciones.

## SCRUM-456 — errores y seguridad

| Escenario | Resultado |
| --- | --- |
| HTTP 400/401/403/404/409/422/429/500/502/503/504 | Ejecutados contra Postman por HTTP. Status y mensajes españoles también cubiertos por unitarias. Aprobados. |
| JSON inválido / sobres incorrectos | Rechazados sin éxito falso; arrays, ausencias y tipos inválidos cubiertos. |
| Conexión y timeout | Mensaje comprensible; timeout durante conexión y lectura conserva la incertidumbre de una escritura. |
| AbortController | Cancelación antes, durante fetch y durante lectura reconocida como AbortError. No se confunde con error de red. |
| Reintentos/duplicados | Una petición tras fallo de escritura, sin reintento automático. Navegador: portada y pagos no duplican ante doble activación. No se afirma idempotencia global del backend. |
| Recuperación | Navegador: error y guardado posterior en negocio, marketing, pagos, entregas y perfil. |
| Sesión | Prueba 401 sin acceso a storage/window: el cliente no elimina credenciales ni redirige. |
| Datos sensibles | Unitarias de tokens, claves, URL privada, rutas, trazas y cuerpos externos; sin mensajes/consola sensibles en los casos probados. |

Se reprodujo una filtración 422 con `error.detalles.clavePrivada: ['valor-privado-qa']`: el filtro no reconocía ese campo. Se amplió para `clavePrivada`, `clave_secreta`, `private_key` y `credencial`; se añadieron cuatro regresiones. Los ocho grupos de `api-request.cjs` pasan. Esto prueba los casos ejecutados, no la ausencia absoluta de secretos en cualquier texto arbitrario recibido.

`feedback-http.cjs` valida 15 escenarios HTTP/red/timeout/cancelación y llamadas de negocio, portada multipart, promociones, pedidos y legales sobre HTTP real contra Postman. No usa un stub de fetch para esos intercambios.

No se cambiaron endpoints, payloads de pagos ni mecanismos de autenticación. La validación de respuestas en la UI es adicional al sobre compartido.

## Páginas legales

| Página | Borrador, publicación y tienda simulada | Lectura local existente |
| --- | --- | --- |
| Términos y condiciones | Aprobado en navegador | HTTP 200, versión 4 visible |
| Privacidad | Aprobado en navegador | HTTP 200, versión 1 visible |
| Cambios/devoluciones | Aprobado en navegador | HTTP 200, versión 1 visible |
| Cookies | Aprobado en navegador | HTTP 200, versión 1 visible |

El borrador no cambia la publicación hasta publicar. Recuperar/restaurar versiones modifica solo el borrador y conserva la versión vigente. Las escrituras fueron exclusivamente artificiales. La configuración real sin token respondió 401; se bloquearon escrituras en el recorrido público real.

No reapareció la incidencia de cancelación de Strict Mode en los recorridos ejecutados. Las suites del ciclo de carga/cancelación y versiones también pasaron. No se modificó nuevamente el componente legal de producción. Las pruebas legales backend están incluidas en los 80 casos de core.

## Regresión general

No se suman archivos de suites, comprobaciones de navegador y casos Django como si fueran unidades equivalentes.

| Conjunto | Total | Aprobados | Fallidos finales |
| --- | ---: | ---: | ---: |
| Suites frontend unitarias/de componentes/estáticas | 60 | 60 | 0 |
| Comprobaciones de navegador con Postman | 33 (15 + 18) | 33 | 0 |
| Páginas legales públicas locales, solo lectura | 4 | 4 | 0 |
| Fallos HTTP/red con Postman | 15 | 15 | 0 |
| Backend core | 80 | 80 | 0 |
| Backend perfiles | 20 | 20 | 0 |

Typecheck, build, Django check y diff check aprobados. Los ocho grupos de API están dentro de las 60 suites y también se ejecutaron de forma directa; no se cuentan dos veces. Se revisó además una captura de viewport 375 × 900 px.

Al retomar se volvieron a ejecutar las órdenes obligatorias `npm run typecheck`, `npm run build`, `node tests/api-request.cjs`, `node tests/feedback-regression.cjs` y `node tests/qa-final-regression.cjs`. Los resultados de identidad y legales están incluidos en esos runners. No hubo cambios backend nuevos que requirieran repetir sus 100 casos ya registrados.

Inventario de 91 archivos `.cjs`: 64 programas actuales ejecutados (60 suites y cuatro programas HTTP/navegador), un diagnóstico histórico con fallo esperado, dos orquestadores ejecutados, un helper y 23 guiones de otros entornos no ejecutados. Lista nominal en `test-inventory.json`. Hay cobertura coincidente mediante los recorridos de esta auditoría, pero no se afirma equivalencia completa. Pruebas manuales humanas: 0.

### Investigación de los fallos iniciales

- **store-identity:** defecto real del fallback de identidad local. El mismo fallo se reprodujo cargando fuentes de `f5c880e`, anterior a estas tareas. Se corrigieron tres expresiones del contexto. Se mantienen las aserciones de identidad existentes y se adapta el cargador del contrato de servicios a sus imports actuales. `store-identity-baseline.log` conserva el fallo histórico esperado; no es un gate de la rama corregida.
- **error-state:** el test recorre `.tsx`, incluidos los `.BACKUP` no versionados que contienen patrones antiguos. Pasa sin modificar el test en el worktree limpio de `8f8ab3a`. No se modificaron/eliminaron respaldos para hacerlo pasar ni se identificó un fallo de aplicación asociado.
- Al ampliar la regresión aparecieron siete arneses desactualizados: `customer-orders` no resolvía imports actuales; `admin-panel-help` esperaba copy anterior; `business-time` esperaba meses abreviados frente al formato numérico existente; `loading-state` era sensible a CRLF; `dashboard` no recorría ErrorState anidado y asumía tabla inexistente en lugar de details cerrado; `stock-feedback` y `storefront-variants` carecían de mocks actuales. Se actualizaron conservando las comprobaciones funcionales pertinentes. No se cambió producción de esas áreas para adaptar los tests.
- Los primeros intentos de navegador requirieron ajustar fixtures/selectores (flecha de botón, checkbox oculto, duplicado responsive y etiqueta de estado pendiente). Los JSON conservan los recorridos finales completos. No se convirtieron resultados fallidos en aprobados sin volver a ejecutar.
- Al retomar, un intento adicional terminó antes del recorrido por ECONNREFUSED: el servidor artificial de la sesión anterior estaba apagado. Se reinició el entorno y se repitieron HTTP y ambos recorridos completos; ese intento previo no se contabiliza como aprobado.

## Seguridad y deuda técnica

`npm audit` detectó tres paquetes vulnerables: una severidad moderada y dos altas. Todos pertenecen al árbol de desarrollo; `npm audit --omit=dev` reportó cero. Son resultados de la base de avisos consultada, no una certificación de seguridad total.

| Paquete instalado | Origen | Corrección identificada |
| --- | --- | --- |
| source-map-js 1.2.1, alta | Tailwind/PostCSS | Parche 1.2.2; [aviso oficial](https://github.com/advisories/GHSA-68fv-2mgg-jv7q). |
| esbuild 0.21.5, moderada | Vite | Desde 0.25.0; [aviso oficial](https://github.com/advisories/GHSA-67mh-4wv8-2f99). |
| Vite 5.4.21, alta | Dependencia directa de desarrollo | Vite 6.4.4 es una candidata corregida para los avisos Windows revisados: [fs.deny](https://github.com/advisories/GHSA-fx2h-pf6j-xcff), [launch-editor](https://github.com/advisories/GHSA-587h-7wmj-h5pm). Requiere validar la migración. |

Prioridad: parchear source-map-js y abordar la migración de Vite en trabajo dedicado. Vite 6.4.4 requiere esbuild `^0.25.0`; los peers instalados de plugin-react 4.7.0 y Tailwind 4.3.3 admiten Vite 6. Esa compatibilidad declarada no sustituye pruebas de migración. El autofix de npm ofrece Vite 8.3.5, con revisión adicional de plugin-react. No se ejecutó audit fix --force ni se cambió el lockfile. Mantener el dev server en un entorno de confianza mientras se corrige: desarrollo no equivale a ausencia de exposición.

El bundle principal es **657,61 kB minificados / 201,43 kB gzip**. Build pasa y conserva el aviso de 500 kB. Se recomienda medir y dividir cargas; no se ocultó el warning aumentando su umbral. El warning CSS sí quedó resuelto.

Django check pasa. Docker advierte que PAYMENT_CREDENTIALS_KEY no está configurada en este entorno local; las pruebas usan datos artificiales y no procesan cobros. No se incluyen valores de credenciales.

## Git y archivos ajenos

Commit de código/pruebas: `87aa120d19874f04a993a993a40ac811ae9c9de5`, `fix(SCRUM-455-456): corregir hallazgos de QA final`.

Producción: `frontend/src/shared/services/apiRequest.ts`, `frontend/src/features/admin/pages/Payments.tsx`, `frontend/src/features/storefront/context/StoreContext.tsx` y `frontend/src/features/admin/components/shipping/PickupEditor.tsx`.

Pruebas: 14 archivos cambiados/añadidos; lista exacta con `git show --name-only 87aa120`. Evidencias en este directorio y actualización de `docs/scrum455456/regression-results.json`. El commit documental se conserva separado. El hash de merge y la verificación del push se informan al cierre, evitando una referencia circular al hash del propio documento.

El checkout original mantiene sus cambios de shipping.py/settings.py, carpetas de sprint, `.BACKUP` y mock del editor. No se tocaron ni se incluyeron en commits. `protected-files.json` inventaría 87 archivos y confirma los siete hashes históricos disponibles. No se presenta ese inventario como una nueva comparación histórica de 87 hashes. La comprobación final vuelve a comparar todos los hashes capturados al retomar.

No se utilizan reset --hard, clean, add global, force push ni stashes. La publicación autorizada se hace con merge normal y push sin reescritura. No se eliminan ramas ni worktrees.

## Reproducción y evidencias

Desde `integracion-scrum455456/frontend`:

```powershell
node tests/qa-final-regression.cjs # Incluye feedback-regression.cjs
node tests/api-request.cjs
node tests/legal-pages.cjs
npm run typecheck
npm run build
npm audit --json
npm audit --omit=dev --json
git diff --check
```

Terminal de API artificial:

```powershell
postman simulation run tests/feedback.sim.yaml --port 4916 --no-history
```

Terminal frontend:

```powershell
$env:VITE_API_URL='http://127.0.0.1:4916/openmind'
npm run dev -- --host 127.0.0.1 --port 5196 --strictPort
```

Con ambos procesos activos, secuencialmente:

```powershell
$env:FEEDBACK_API='http://127.0.0.1:4916/openmind'
$env:FEEDBACK_URL='http://127.0.0.1:5196'
$env:FEEDBACK_OUT=(Resolve-Path '../docs/qa-final-scrum455456').Path
node tests/feedback-http.cjs
node tests/feedback-browser.cjs
node tests/qa-final-browser.cjs
```

Playwright usa el runtime local indicado en los scripts, configurable con DASHBOARD_PLAYWRIGHT_MODULE. Diagnóstico histórico: `node tests/store-identity-baseline.cjs f5c880e` termina con código 1 esperado.

Backend desde el repositorio original, con servicios Docker disponibles:

```powershell
docker compose run --rm --no-deps -T -v C:/Users/maria/Ecommerce/ua-consultoria-openmind/integracion-scrum455456/backend:/app backend python manage.py check
docker compose run --rm --no-deps -T -v C:/Users/maria/Ecommerce/ua-consultoria-openmind/integracion-scrum455456/backend:/app backend python manage.py test apps.core.test_legal apps.core.test_estados_pedido apps.core.test_pending_transfers apps.core.test_store_configuration apps.core.test_transfer_configuration apps.core.test_plantillas_correo --noinput --verbosity 1
docker compose run --rm --no-deps -T -v C:/Users/maria/Ecommerce/ua-consultoria-openmind/integracion-scrum455456/backend:/app backend python manage.py test apps.authentication.tests.test_profile apps.authentication.tests.test_entrepreneur_profile --noinput --verbosity 1
```

Evidencias: all-regression-results.json, browser-results.json, extended-browser-results.json, legal-live-results.json, test-inventory.json, audits y árbol de dependencias, logs de build/typecheck/API/backend y capturas. Marketing móvil: marketing-375-viewport.png. No se versionan historiales crudos de simulación ni credenciales.
