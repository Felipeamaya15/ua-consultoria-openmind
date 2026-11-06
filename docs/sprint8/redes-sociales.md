# Marketing: perfiles sociales

Se reutiliza `ConfiguracionLanding.contenido.contacto`: `instagram`, `facebook`,
`whatsapp` y el nuevo campo opcional `youtube` contienen el único enlace/número.
`redes_sociales[red]` agrega `activo` y, solo para WhatsApp, `mensaje`.
Los registros anteriores sin metadatos se consideran activos si tienen valor;
consultarlos no los modifica. No se almacenan contraseñas ni autorizaciones OAuth.

## Contrato privado

`GET /api/landing/redes-sociales/` devuelve el sobre habitual `{exito, data}`.
`data` contiene las cuatro redes, cada una con `{perfil, activo, mensaje}`
(`mensaje` vacío salvo WhatsApp). Requiere propietario activo, igual que PATCH.

`PATCH /api/landing/redes-sociales/` acepta una o varias redes conocidas:

```json
{"instagram":{"perfil":"@mi.tienda","activo":true},"whatsapp":{"perfil":"+56 9 1234 5678","activo":true,"mensaje":"Hola"}}
```

Cada objeto reemplaza la configuración de esa red. `{"instagram":null}` elimina
su enlace y desactiva la red. Campos desconocidos, perfiles inválidos o vacíos,
mensajes de más de 500 caracteres y valores de activación que no sean booleanos
producen 400 sin cambios parciales. PATCH devuelve las cuatro redes persistidas.
Los enlaces admitidos pertenecen a la red indicada: perfiles de Instagram,
Facebook (incluido `profile.php?id=`) y canales de YouTube (`@`, `channel`, `c`,
`user`). No se comprueba existencia o propiedad de la cuenta en servicios externos.
WhatsApp acepta números internacionales de 8 a 15 dígitos, con código de país.

Se conserva el resolutor de tienda de la instalación: el cliente no puede elegir
otra tienda. Sin sesión: 401; usuario ajeno/inactivo: 403; identificador de tienda
ajeno: 400; instalación con cero o varias tiendas: 503. No se relaja este contrato
para habilitar multitienda. Los datos públicos siguen en GET de la landing.

Las escrituras bloquean la tienda y su configuración, modifican solo el contacto
social y conservan imágenes, textos, secciones y otros contactos. Si aún no existe
landing se crea una configuración vacía, sin activar secciones ni inventar textos.
Una vez administrada una red en Marketing, los PUT antiguos de landing conservan
su valor y sus metadatos; las otras redes antiguas mantienen su compatibilidad.

## Integración y alcance

Las cuatro plantillas comparten `LandingDetails`: respetan las redes activas y
la visibilidad existente de Información de contacto. WhatsApp incorpora el mensaje
codificado; YouTube se añade al mismo bloque. La edición de redes se centraliza
en Marketing; Página principal enlaza a ese editor y conserva teléfono, correo,
sitio web y horarios. Registrar o borrar aquí un enlace no autoriza ni elimina
cuentas externas. La identidad estable de cada red permite futuros consumidores
de perfiles; OAuth requerirá un contrato independiente para credenciales y permisos.

Biblioteca multimedia, Difusión y Secciones quedan fuera de este cambio.

## Verificación del 4 de noviembre de 2026

Se retomaron íntegros los 19 archivos del commit existente `0ac789b` en
`feature/sprint8-marketing-secciones`. Esta continuación no creó commits ni
ejecutó push, merge o cambios de rama.

Correcciones comprobadas en esta revisión:

- Los identificadores `instagram.comercio` y `facebook.company` ya no se
  confunden con dominios; se mantienen las comprobaciones de host de los enlaces.
- Frontend y backend aceptan de forma consistente rutas de perfil codificadas.
- Facebook rechaza rutas compuestas solo por puntos y parámetros adicionales
  vacíos en `profile.php?id=...`.
- La carga y el reintento usan `LoadingState` y `ErrorState`, conservando las
  convenciones y pruebas existentes del panel.
- El test de formularios antiguos verifica las cuatro redes: no restaura una
  eliminada, no sobrescribe enlaces, no reactiva perfiles ni pierde el mensaje.

### Resultados técnicos reales

Comandos ejecutados desde la raíz, salvo Node/npm que también se ejecutaron
desde `frontend` según la invocación. Las bases Django de estas pruebas son
aisladas; no se sustituyó la base de desarrollo.

| Ejecución | Resultado |
| --- | --- |
| `docker compose exec -T backend python manage.py test --noinput` | 1.037 tests, OK, salida 0 |
| `docker compose exec -T backend python manage.py test apps.landing --noinput` | 74 tests, OK; repetida después de ampliar la protección de las cuatro redes |
| `docker compose exec -T backend python manage.py makemigrations --check --dry-run` | No changes detected, salida 0 |
| `node tests/social-profiles.cjs` | 7 tests, OK; incluye casos de validación, escrituras, eliminación, errores y cancelación |
| `node tests/landing-content.cjs` | OK, incluye redes activas/inactivas, YouTube y mensaje de WhatsApp en las cuatro variantes |
| `node tests/marketing-navigation.cjs` | 4 tests, OK |
| `node tests/error-state.cjs` | 15 tests, OK después de corregir el uso del componente compartido |
| `node tests/loading-state.cjs` | 13 tests, OK después de corregir el uso del componente compartido |
| Batería de scripts Node sin navegador ni generación de reportes | 73 ejecuciones, 71 aprobadas, 2 fallidas; desglose debajo |
| `npm run build` (incluye `npm run typecheck`) | OK, repetida tras las correcciones; aviso de chunk principal mayor de 500 kB |
| `git diff --check` | OK |

La batería incluyó Marketing, borradores, editor, navegación, landing, productos,
carrito, pedidos, promociones, legales, correos, identidad, analítica y envíos.
No se modificaron pruebas para ocultar fallos:

- `editor-incremental.cjs`: falla la herencia del color alternativo en un
  breakpoint (`#f0edff` frente a `#eeffee`). El mismo fallo se reprodujo cargando
  en memoria los módulos del commit `0d45b6e`, anterior a Redes sociales, sin
  cambiar archivos ni rama. Queda fuera del alcance de esta pestaña.
- `store-identity-baseline.cjs`: ejecuta por diseño la revisión histórica
  `f5c880e`; reproduce el fallo de identidad antigua. `store-identity.cjs` actual
  sí pasa. Este control histórico no demuestra una regresión de Redes sociales.

Antes de seleccionar la batería se interrumpieron dos recorridos amplios que
incluían utilidades de navegador y generadores históricos. Se observaron un
timeout en `business-time-browser.cjs`, una restricción de acceso de esbuild en
`checkout-pickup-visual.cjs`, falta del fixture HTTP :8005 para
`commercial-browser.cjs` y del fixture :4915 para `feedback-http.cjs`. Esas
utilidades no quedaron validadas. Los reportes generados por los recorridos se
retiraron o se restituyeron a su contenido anterior; no forman parte del cambio.
El CLI de Postman encontrado está integrado en su aplicación y rechaza ejecución
desde esta terminal (`POSTMAN_CLI_ELECTRON` no definido). No se configuraron
cuentas ni workspaces para suplirlo: la evidencia de API procede de Django y
peticiones HTTP locales reales.

### Comprobación de localhost y persistencia

Con la sesión real de emprendedor en `localhost:5173` se verificó:

- Carga de las cuatro tarjetas y acceso directo `#redes-sociales`.
- Rechazo de URL ajena a YouTube y número corto de WhatsApp.
- Guardado de perfiles temporales de Instagram, Facebook y YouTube; edición,
  desactivación y reactivación de YouTube.
- Persistencia tras recargar; consulta ORM de solo lectura confirmó el enlace
  de YouTube y su estado en PostgreSQL.
- Las cuatro plantillas (editorial, minimal, visual, catalog) mostraron los
  cuatro enlaces del contacto persistido. Una red desactivada dejó de aparecer.
- La vista previa de WhatsApp codifica tildes, espacios y `&` del mensaje.
- Eliminación con confirmación de los tres perfiles creados para esta prueba;
  tras recargar permanecieron vacíos y dejaron de aparecer públicamente.
  El número original de WhatsApp, su estado y la visibilidad del contacto se
  conservaron; no se guardó el mensaje temporal.
- HTTP real sin sesión: GET y PATCH privados devolvieron 401; GET público de
  landing devolvió 200. Los tests de base aislada comprobaron usuario ajeno,
  propietario inactivo, identificadores ajenos y fallo cerrado con varias tiendas.

La revisión visual se realizó a 1280 px, sin desbordamiento. La herramienta del
navegador mantuvo ese ancho pese a solicitar 375 y 768 px, también en una pestaña
nueva. Por tanto, no se declara realizada una comprobación visual móvil/tablet.
Se restableció el ajuste del navegador. La grilla conserva su regla de una
columna bajo 768 px, y las suites existentes de responsividad pasaron.

### Inventario de la implementación conservada

Los 19 archivos originales siguen presentes:

```text
backend/apps/landing/serializers.py
backend/apps/landing/social_profiles.py
backend/apps/landing/test_social_profiles.py
backend/apps/landing/urls.py
backend/apps/landing/views.py
docs/sprint8/redes-sociales.md
frontend/src/features/admin/components/LandingContentEditor.tsx
frontend/src/features/landing/components/LandingDetails.tsx
frontend/src/features/landing/types/landing.types.ts
frontend/src/features/landing/types/socialProfiles.ts
frontend/src/features/marketing/components/MarketingSections.tsx
frontend/src/features/marketing/components/SocialProfiles.tsx
frontend/src/features/marketing/marketing.css
frontend/src/features/marketing/pages/Marketing.tsx
frontend/src/features/marketing/services/socialProfilesService.ts
frontend/src/features/storefront/components/ui/Icon.tsx
frontend/tests/landing-content.cjs
frontend/tests/marketing-navigation.cjs
frontend/tests/social-profiles.cjs
```

Esta continuación modifica solo los validadores backend/frontend, el componente
de tarjetas, sus dos archivos de tests y este documento. No requiere migraciones.
