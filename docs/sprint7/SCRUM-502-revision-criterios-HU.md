# SCRUM-502 — Revisión de criterios de las 17 HU

Fecha: 2026-10-28. Esta matriz se preparó antes de ejecutar SCRUM-503. **No contiene veredictos funcionales.**

## Fuentes y trazabilidad

Fuente principal: `H_Usuario.pdf`, 10 páginas, 17 HU; fuente complementaria: `RequerimientosEcommerce.pdf` (ERS 5.2). Excel `Backlog_Ecommerce 1.xlsx`, hoja `Backlog_Ecommerce`: fila 430 BL-428 «Revisar criterios de aceptación de cada HU.», 431 BL-429 validación funcional, 432 BL-430 validación final. El Excel no contiene IDs SCRUM ni criterios de esos tickets: equivalencias confirmadas por la Product Owner: SCRUM-502 = BL-428, SCRUM-503 = BL-429 y SCRUM-504 = BL-430. Se autoriza utilizar las HU oficiales y la ERS como criterios. No se modificaron fuentes.

Se conserva el texto del PDF, normalizando solamente saltos de línea, guiones de partición, ligadura fi y comillas de su extracción. La numeración oficial se conserva: la lista conceptual del prompt no sustituye los nombres/orden del PDF. HU14-CA04 es la cláusula condicional ubicada dentro del bloque de criterios; se cuenta explícitamente para no omitirla.

## Reglas de uso de la matriz

Cada fila incluye texto oficial, operación verificable, resultado/evidencia esperada y referencias al contexto detallado de su HU (frontend, backend, suites existentes y datos). Las rutas frontend parten de `frontend/src/`, backend de `backend/`, tests frontend de `frontend/tests/`. Los nombres de suites son puntos de inspección, no evidencia de ejecución ni garantía de cobertura completa. Un test simulado no acredita un servicio comercial real.

Clasificación principal excluyente: **46 claros**, **15 dependen de servicio externo**, **1 ambiguo**; 62 en total. La dependencia de PostgreSQL/Mongo local se aplica a todas las pruebas integradas que los usan y no se cuenta como proveedor externo. Los criterios externos también tienen lógica local verificable. No se declara ninguno no aplicable: el carácter condicional de HU14-CA04 requiere resolver la condición.

## Integridad de fuentes

- `H_Usuario.pdf` SHA-256: `cd618202a2c2a49fce270d6f5a6bf8ddc2478b8906a2080e002d7a2bfeaeaf57`.
- `RequerimientosEcommerce.pdf` SHA-256: `36155e7121f7826e474e5a75c2b61269a7cef4c78ffc5509f7e3ffa738364693`.
- `Backlog_Ecommerce 1.xlsx` SHA-256: `0eea61467d33d455b1670f6db24bbe699268736b8f90d864674deded432115f3`.

## HU01 — Landing Page e Ingreso a la Tienda

Fuente: H_Usuario.pdf, página 1.
- Frontend F01: `features/admin/pages/LandingPage.tsx; features/landing/pages/LandingPage.tsx; features/landing/components/EnterStoreButton.tsx`.
- Backend/API B01: `apps/landing/; /api/landing/`.
- Tests existentes T01: frontend `landing-content.cjs,landing-sections.cjs,landing-editor.cjs`; Django `apps.landing`.
- Datos D01: Propietario, tienda única, landing guardada y visitante sin sesión; variar título y CTA.

| ID | Texto oficial | Flujo verificable y evidencia esperada | Frontend / backend / tests / datos | Clasificación y dependencia/ambigüedad |
|---|---|---|---|---|
| HU01-CA01 | Dado que el emprendedor configura la información principal de su negocio, cuando un visitante ingresa al dominio de la tienda, entonces el sistema debe mostrar la landing page configurada. | Ejecutar las condiciones Dado/Cuando del texto oficial; contrastar UI y respuesta/persistencia con: el sistema debe mostrar la landing page configurada. | F01; B01; T01; D01 | Claro. Sin servicio externo: lógica propia con bases locales y usuario autorizado/invitado según criterio. |
| HU01-CA02 | Dado que el visitante se encuentra en la landing page, cuando selecciona el botón de ingreso a la tienda, entonces el sistema debe dirigirlo al catálogo público. | Ejecutar las condiciones Dado/Cuando del texto oficial; contrastar UI y respuesta/persistencia con: el sistema debe dirigirlo al catálogo público. | F01; B01; T01; D01 | Claro. Sin servicio externo: lógica propia con bases locales y usuario autorizado/invitado según criterio. |

## HU02 — Personalización de Interfaz y Branding

Fuente: H_Usuario.pdf, página 1.
- Frontend F02: `features/admin/pages/Design.tsx; features/admin/pages/ThemeEditor.tsx; features/storefront/visual/`.
- Backend/API B02: `apps/visual_config/; /api/visual-config/`.
- Tests existentes T02: frontend `visual-config.cjs,visual-editor.cjs,visual-editor-final.cjs`; Django `apps.visual_config`.
- Datos D02: Cuatro plantillas, logo válido, paleta y visitante en otro contexto.

| ID | Texto oficial | Flujo verificable y evidencia esperada | Frontend / backend / tests / datos | Clasificación y dependencia/ambigüedad |
|---|---|---|---|---|
| HU02-CA01 | Dado que el emprendedor ingresa al panel de gestión, cuando selecciona una de las cuatro plantillas disponibles, entonces el sistema debe aplicar la estructura visual correspondiente a la tienda. | Ejecutar las condiciones Dado/Cuando del texto oficial; contrastar UI y respuesta/persistencia con: el sistema debe aplicar la estructura visual correspondiente a la tienda. | F02; B02; T02; D02 | Claro. Sin servicio externo: lógica propia con bases locales y usuario autorizado/invitado según criterio. |
| HU02-CA02 | Dado que el emprendedor carga el logo de su negocio, cuando guarda la configuración, entonces el sistema debe mostrar el logo en la tienda pública. | Ejecutar las condiciones Dado/Cuando del texto oficial; contrastar UI y respuesta/persistencia con: el sistema debe mostrar el logo en la tienda pública. | F02; B02; T02; D02 | Claro. Sin servicio externo: lógica propia con bases locales y usuario autorizado/invitado según criterio. |
| HU02-CA03 | Dado que el emprendedor personaliza la apariencia de la tienda, cuando se muestra la interfaz pública, entonces el logo institucional de la Universidad debe permanecer visible de acuerdo con la regla de negocio de autoría. | Ejecutar las condiciones Dado/Cuando del texto oficial; contrastar UI y respuesta/persistencia con: el logo institucional de la Universidad debe permanecer visible de acuerdo con la regla de negocio de autoría. | F02; B02; T02; D02 | Claro. Sin servicio externo: lógica propia con bases locales y usuario autorizado/invitado según criterio. |

## HU03 — Catálogo Flexible y Navegación Pública

Fuente: H_Usuario.pdf, página 2.
- Frontend F03: `features/storefront/pages/Catalog.tsx; features/storefront/pages/ProductDetail.tsx; features/admin/pages/Products.tsx`.
- Backend/API B03: `apps/catalog/presentation/views.py; /api/catalog/productos/`.
- Tests existentes T03: frontend `product-creation.cjs,storefront-variants.cjs`; Django `apps.catalog.test_creation,apps.catalog.test_product_flow_regressions`.
- Datos D03: Productos activos con atributos distintos y visitante invitado; filtro que incluya/excluya productos.

| ID | Texto oficial | Flujo verificable y evidencia esperada | Frontend / backend / tests / datos | Clasificación y dependencia/ambigüedad |
|---|---|---|---|---|
| HU03-CA01 | Dado que un comprador invitado o no registrado accede al enlace de la tienda, cuando navega por el catálogo, entonces el sistema debe permitir visualizar los productos sin solicitar inicio de sesión. | Ejecutar las condiciones Dado/Cuando del texto oficial; contrastar UI y respuesta/persistencia con: el sistema debe permitir visualizar los productos sin solicitar inicio de sesión. | F03; B03; T03; D03 | Claro. Sin servicio externo: lógica propia con bases locales y usuario autorizado/invitado según criterio. |
| HU03-CA02 | Dado que el emprendedor registra un producto, cuando define atributos propios de su rubro, entonces el sistema debe permitir almacenar y desplegar dichos atributos en la vista pública. | Ejecutar las condiciones Dado/Cuando del texto oficial; contrastar UI y respuesta/persistencia con: el sistema debe permitir almacenar y desplegar dichos atributos en la vista pública. | F03; B03; T03; D03 | Claro. Sin servicio externo: lógica propia con bases locales y usuario autorizado/invitado según criterio. |
| HU03-CA03 | Dado que el catálogo contiene atributos definidos, cuando el comprador utiliza los filtros de búsqueda, entonces el sistema debe filtrar dinámicamente los productos según los parámetros seleccionados. | Ejecutar las condiciones Dado/Cuando del texto oficial; contrastar UI y respuesta/persistencia con: el sistema debe filtrar dinámicamente los productos según los parámetros seleccionados. | F03; B03; T03; D03 | Claro. Sin servicio externo: lógica propia con bases locales y usuario autorizado/invitado según criterio. |

## HU04 — Gestión de Productos e Inventario

Fuente: H_Usuario.pdf, página 2.
- Frontend F04: `features/admin/pages/Products.tsx; features/storefront/pages/ProductDetail.tsx`.
- Backend/API B04: `apps/catalog/; /api/catalog/productos/crear/; /api/catalog/productos/<id>/stock/`.
- Tests existentes T04: frontend `product-creation.cjs,product-editing.cjs,stock-feedback.cjs`; Django `apps.catalog.test_creation,apps.catalog.test_editing,apps.catalog.test_stock,apps.core.test_checkout`.
- Datos D04: Propietario, imagen válida, dos productos y stock positivo/cero.

| ID | Texto oficial | Flujo verificable y evidencia esperada | Frontend / backend / tests / datos | Clasificación y dependencia/ambigüedad |
|---|---|---|---|---|
| HU04-CA01 | Dado que el emprendedor ingresa los datos, imágenes y stock inicial de un producto, cuando guarda la información, entonces el sistema debe registrar el producto y dejarlo disponible para su gestión. | Ejecutar las condiciones Dado/Cuando del texto oficial; contrastar UI y respuesta/persistencia con: el sistema debe registrar el producto y dejarlo disponible para su gestión. | F04; B04; T04; D04 | Claro. Sin servicio externo: lógica propia con bases locales y usuario autorizado/invitado según criterio. |
| HU04-CA02 | Dado que el emprendedor modifica los datos o el stock de un producto, cuando guarda los cambios, entonces el sistema debe actualizar la información correspondiente en el catálogo y en el inventario. | Ejecutar las condiciones Dado/Cuando del texto oficial; contrastar UI y respuesta/persistencia con: el sistema debe actualizar la información correspondiente en el catálogo y en el inventario. | F04; B04; T04; D04 | Claro. Sin servicio externo: lógica propia con bases locales y usuario autorizado/invitado según criterio. |
| HU04-CA03 | Dado que el stock disponible de un producto llega a cero, cuando un comprador intenta adquirirlo, entonces el sistema debe impedir la compra e informar que el producto no se encuentra disponible. | Ejecutar las condiciones Dado/Cuando del texto oficial; contrastar UI y respuesta/persistencia con: el sistema debe impedir la compra e informar que el producto no se encuentra disponible. | F04; B04; T04; D04 | Claro. Sin servicio externo: lógica propia con bases locales y usuario autorizado/invitado según criterio. |

## HU05 — Gestión de Variantes y SKUs

Fuente: H_Usuario.pdf, página 3.
- Frontend F05: `features/admin/pages/Products.tsx; features/storefront/pages/ProductDetail.tsx; features/storefront/context/CartContext.tsx`.
- Backend/API B05: `apps/catalog/; /api/catalog/productos/<id>/variantes/`.
- Tests existentes T05: frontend `storefront-variants.cjs,guest-cart.cjs`; Django `apps.catalog.test_inventory,apps.catalog.test_cart,apps.core.test_variante_atributos`.
- Datos D05: Producto con dos combinaciones/SKU, stocks independientes y carrito vacío.

| ID | Texto oficial | Flujo verificable y evidencia esperada | Frontend / backend / tests / datos | Clasificación y dependencia/ambigüedad |
|---|---|---|---|---|
| HU05-CA01 | Dado que el emprendedor crea un producto con variantes, cuando define sus atributos, entonces el sistema debe permitir registrar cada combinación como una variante identificable mediante su SKU. | Ejecutar las condiciones Dado/Cuando del texto oficial; contrastar UI y respuesta/persistencia con: el sistema debe permitir registrar cada combinación como una variante identificable mediante su SKU. | F05; B05; T05; D05 | Claro. Sin servicio externo: lógica propia con bases locales y usuario autorizado/invitado según criterio. |
| HU05-CA02 | Dado que una variante posee un stock determinado, cuando el emprendedor actualiza su inventario, entonces el sistema debe modificar el stock correspondiente sin afectar las demás variantes. | Ejecutar las condiciones Dado/Cuando del texto oficial; contrastar UI y respuesta/persistencia con: el sistema debe modificar el stock correspondiente sin afectar las demás variantes. | F05; B05; T05; D05 | Claro. Sin servicio externo: lógica propia con bases locales y usuario autorizado/invitado según criterio. |
| HU05-CA03 | Dado que una variante posee stock disponible, cuando el comprador la selecciona en el catálogo, entonces el sistema debe permitir agregar dicha combinación al carrito. | Ejecutar las condiciones Dado/Cuando del texto oficial; contrastar UI y respuesta/persistencia con: el sistema debe permitir agregar dicha combinación al carrito. | F05; B05; T05; D05 | Claro. Sin servicio externo: lógica propia con bases locales y usuario autorizado/invitado según criterio. |

## HU06 — Configuración de Autenticación de Compradores

Fuente: H_Usuario.pdf, página 3.
- Frontend F06: `features/admin/pages/Authentication.tsx; features/storefront/pages/Login.tsx; features/storefront/pages/Checkout.tsx`.
- Backend/API B06: `apps/authentication/; /api/auth/configuracion/; /api/auth/register/; /api/auth/google/`.
- Tests existentes T06: frontend `account-navigation.cjs,cart-checkout.cjs`; Django `apps.authentication.tests.test_auth,apps.core.test_checkout`.
- Datos D06: Propietario, habilitar/deshabilitar cada modalidad; comprador nuevo, segundo navegador y cliente Google autorizado.

| ID | Texto oficial | Flujo verificable y evidencia esperada | Frontend / backend / tests / datos | Clasificación y dependencia/ambigüedad |
|---|---|---|---|---|
| HU06-CA01 | Dado que el emprendedor configura las modalidades de autenticación, cuando guarda la configuración, entonces el sistema debe almacenar las modalidades habilitadas para la tienda. | Ejecutar las condiciones Dado/Cuando del texto oficial; contrastar UI y respuesta/persistencia con: el sistema debe almacenar las modalidades habilitadas para la tienda. | F06; B06; T06; D06 | Claro. Sin servicio externo: lógica propia con bases locales y usuario autorizado/invitado según criterio. |
| HU06-CA02 | Dado que el emprendedor habilita la compra como invitado, cuando un comprador accede al checkout, entonces el sistema debe permitir continuar sin exigir la creación de una cuenta. | Ejecutar las condiciones Dado/Cuando del texto oficial; contrastar UI y respuesta/persistencia con: el sistema debe permitir continuar sin exigir la creación de una cuenta. | F06; B06; T06; D06 | Claro. Sin servicio externo: lógica propia con bases locales y usuario autorizado/invitado según criterio. |
| HU06-CA03 | Dado que el emprendedor habilita el registro mediante correo, cuando un comprador selecciona dicha modalidad, entonces el sistema debe permitir la creación de una cuenta con los datos requeridos. | Ejecutar las condiciones Dado/Cuando del texto oficial; contrastar UI y respuesta/persistencia con: el sistema debe permitir la creación de una cuenta con los datos requeridos. | F06; B06; T06; D06 | Claro. Sin servicio externo: lógica propia con bases locales y usuario autorizado/invitado según criterio. |
| HU06-CA04 | Dado que el emprendedor habilita autenticación mediante Google, cuando un comprador selecciona dicha modalidad, entonces el sistema debe permitir iniciar sesión mediante el proveedor de autenticación configurado. | Ejecutar las condiciones Dado/Cuando del texto oficial; contrastar UI y respuesta/persistencia con: el sistema debe permitir iniciar sesión mediante el proveedor de autenticación configurado. | F06; B06; T06; D06 | Depende de servicio externo. Google OAuth: cliente, origen autorizado y cuenta de prueba; distinguir UI/backend de autenticación real. |

## HU07 — Carrito de Compras y Flujo de Checkout

Fuente: H_Usuario.pdf, página 4.
- Frontend F07: `features/storefront/pages/Cart.tsx; features/storefront/pages/Checkout.tsx; features/storefront/context/CartContext.tsx`.
- Backend/API B07: `apps/core/presentation/checkout.py; /api/checkout/pedidos/`.
- Tests existentes T07: frontend `guest-cart.cjs,cart-checkout.cjs,order-summary-and-errors.cjs`; Django `apps.catalog.test_cart,apps.core.test_checkout`.
- Datos D07: Dos productos con precio y stock conocidos, cantidades 1/2, retiro y datos de invitado.

| ID | Texto oficial | Flujo verificable y evidencia esperada | Frontend / backend / tests / datos | Clasificación y dependencia/ambigüedad |
|---|---|---|---|---|
| HU07-CA01 | Dado que el comprador agrega productos al carrito, cuando modifica las cantidades, entonces el sistema debe actualizar los subtotales y el total correspondiente. | Ejecutar las condiciones Dado/Cuando del texto oficial; contrastar UI y respuesta/persistencia con: el sistema debe actualizar los subtotales y el total correspondiente. | F07; B07; T07; D07 | Claro. Sin servicio externo: lógica propia con bases locales y usuario autorizado/invitado según criterio. |
| HU07-CA02 | Dado que el comprador está listo para comprar, cuando selecciona “Proceder al Checkout”, entonces el sistema debe mostrar un resumen consolidado de los productos, cantidades, costos y datos necesarios para continuar con el pago. | Ejecutar las condiciones Dado/Cuando del texto oficial; contrastar UI y respuesta/persistencia con: el sistema debe mostrar un resumen consolidado de los productos, cantidades, costos y datos necesarios para continuar con el pago. | F07; B07; T07; D07 | Claro. Sin servicio externo: lógica propia con bases locales y usuario autorizado/invitado según criterio. |
| HU07-CA03 | Dado que una modalidad de compra sin autenticación se encuentra habilitada, cuando el comprador accede al checkout sin una cuenta, entonces el sistema debe permitirle ingresar los datos requeridos para completar el pedido. | Ejecutar las condiciones Dado/Cuando del texto oficial; contrastar UI y respuesta/persistencia con: el sistema debe permitirle ingresar los datos requeridos para completar el pedido. | F07; B07; T07; D07 | Claro. Sin servicio externo: lógica propia con bases locales y usuario autorizado/invitado según criterio. |

## HU08 — Configuración de Modalidades de Pago

Fuente: H_Usuario.pdf, página 4.
- Frontend F08: `features/admin/pages/Payments.tsx; features/storefront/pages/Checkout.tsx`.
- Backend/API B08: `apps/core/presentation/views.py; apps/catalog/presentation/views.py; /api/pagos/configuracion/; /api/pagos/activos/`.
- Tests existentes T08: frontend `transfer-validation.cjs,manual-transfer-rejection.cjs,linkify-validation.cjs`; Django `apps.core.test_transfer_configuration,apps.core.test_linkify_configuracion,apps.core.test_linkify_notificacion,apps.catalog.test_payment_port`.
- Datos D08: Tienda, clave Fernet de test, métodos activos/inactivos, pedido pendiente, datos ficticios de pasarelas.

| ID | Texto oficial | Flujo verificable y evidencia esperada | Frontend / backend / tests / datos | Clasificación y dependencia/ambigüedad |
|---|---|---|---|---|
| HU08-CA01 | Dado que el emprendedor configura una modalidad de pago, cuando ingresa los datos o credenciales requeridos y guarda la configuración, entonces el sistema debe almacenar y habilitar la modalidad correspondiente. | Ejecutar las condiciones Dado/Cuando del texto oficial; contrastar UI y respuesta/persistencia con: el sistema debe almacenar y habilitar la modalidad correspondiente. | F08; B08; T08; D08 | Claro. Sin servicio externo: lógica propia con bases locales y usuario autorizado/invitado según criterio. |
| HU08-CA02 | Dado que el emprendedor habilita Transbank, PayPal o Mercado Pago, cuando configura las credenciales correspondientes, entonces el sistema debe dejar disponible la modalidad configurada para el checkout. | Ejecutar las condiciones Dado/Cuando del texto oficial; contrastar UI y respuesta/persistencia con: el sistema debe dejar disponible la modalidad configurada para el checkout. | F08; B08; T08; D08 | Depende de servicio externo. Transbank, PayPal, Mercado Pago: implementación y credenciales/certificación separadas. |
| HU08-CA03 | Dado que el emprendedor habilita Linkify, cuando configura los datos requeridos, entonces el sistema debe permitir utilizar el mecanismo de verificación automatizada de transferencia configurado. | Ejecutar las condiciones Dado/Cuando del texto oficial; contrastar UI y respuesta/persistencia con: el sistema debe permitir utilizar el mecanismo de verificación automatizada de transferencia configurado. | F08; B08; T08; D08 | Depende de servicio externo. Linkify: contrato, credenciales y evento auténtico firmado. |
| HU08-CA04 | Dado que el emprendedor habilita la transferencia bancaria manual, cuando configura los datos bancarios requeridos, entonces el sistema debe mostrar las instrucciones de transferencia durante el checkout y permitir gestionar posteriormente su verificación. | Ejecutar las condiciones Dado/Cuando del texto oficial; contrastar UI y respuesta/persistencia con: el sistema debe mostrar las instrucciones de transferencia durante el checkout y permitir gestionar posteriormente su verificación. | F08; B08; T08; D08 | Claro. Sin servicio externo: lógica propia con bases locales y usuario autorizado/invitado según criterio. |
| HU08-CA05 | Dado que el emprendedor habilita únicamente determinadas modalidades de pago, cuando el comprador accede al checkout, entonces el sistema debe mostrar únicamente los medios de pago configurados para la tienda. | Ejecutar las condiciones Dado/Cuando del texto oficial; contrastar UI y respuesta/persistencia con: el sistema debe mostrar únicamente los medios de pago configurados para la tienda. | F08; B08; T08; D08 | Claro. Sin servicio externo: lógica propia con bases locales y usuario autorizado/invitado según criterio. |

## HU09 — Configuración de Alternativas de Entrega

Fuente: H_Usuario.pdf, página 5.
- Frontend F09: `features/admin/pages/Shipping.tsx; features/storefront/pages/Checkout.tsx`.
- Backend/API B09: `apps/core/delivery.py; /api/entregas/configuracion/; /api/entregas/alternativas/`.
- Tests existentes T09: frontend `shipping-pickup.cjs,checkout-shipping.cjs`; Django `apps.core.test_delivery,apps.core.test_shipping`.
- Datos D09: Retiro configurado, transportistas habilitados y deshabilitados, datos de integración autorizados.

| ID | Texto oficial | Flujo verificable y evidencia esperada | Frontend / backend / tests / datos | Clasificación y dependencia/ambigüedad |
|---|---|---|---|---|
| HU09-CA01 | Dado que el emprendedor configura las opciones de entrega, cuando habilita retiro en local, Starken o Chilexpress, entonces la alternativa correspondiente debe quedar disponible para ser seleccionada durante el checkout. | Ejecutar las condiciones Dado/Cuando del texto oficial; contrastar UI y respuesta/persistencia con: la alternativa correspondiente debe quedar disponible para ser seleccionada durante el checkout. | F09; B09; T09; D09 | Claro. Sin servicio externo: lógica propia con bases locales y usuario autorizado/invitado según criterio. |
| HU09-CA02 | Dado que el emprendedor deshabilita una alternativa de entrega, cuando un comprador realiza una nueva compra, entonces dicha alternativa no debe estar disponible para selección. | Ejecutar las condiciones Dado/Cuando del texto oficial; contrastar UI y respuesta/persistencia con: dicha alternativa no debe estar disponible para selección. | F09; B09; T09; D09 | Claro. Sin servicio externo: lógica propia con bases locales y usuario autorizado/invitado según criterio. |
| HU09-CA03 | Dado que el emprendedor habilita un operador logístico, cuando configura los datos requeridos para su integración, entonces el sistema debe asociar dicho operador a la tienda para la cotización y gestión del despacho. | Ejecutar las condiciones Dado/Cuando del texto oficial; contrastar UI y respuesta/persistencia con: el sistema debe asociar dicho operador a la tienda para la cotización y gestión del despacho. | F09; B09; T09; D09 | Depende de servicio externo. Contrato de integración Starken/Chilexpress; no confundir tarifas manuales con credenciales. |

## HU10 — Cotización de Envíos en Tiempo Real

Fuente: H_Usuario.pdf, página 5.
- Frontend F10: `features/storefront/pages/Checkout.tsx; features/storefront/services/shippingService.ts`.
- Backend/API B10: `apps/core/shipping.py; /api/entregas/cotizacion/`.
- Tests existentes T10: frontend `checkout-shipping.cjs,cart-checkout.cjs`; Django `apps.core.test_shipping,apps.core.test_shipping_errores,apps.shipping.test_cotizacion_errores`.
- Datos D10: Destino válido, tarifa disponible/ausente, retiro, operador deshabilitado y API del transportista.

| ID | Texto oficial | Flujo verificable y evidencia esperada | Frontend / backend / tests / datos | Clasificación y dependencia/ambigüedad |
|---|---|---|---|---|
| HU10-CA01 | Dado que el comprador ingresa su comuna o dirección de destino, cuando selecciona un servicio logístico configurado, entonces el sistema debe consultar la API del operador correspondiente y mostrar la tarifa calculada. | Ejecutar las condiciones Dado/Cuando del texto oficial; contrastar UI y respuesta/persistencia con: el sistema debe consultar la API del operador correspondiente y mostrar la tarifa calculada. | F10; B10; T10; D10 | Depende de servicio externo. API comercial Starken/Chilexpress y credenciales reales. |
| HU10-CA02 | Dado que el comprador selecciona la opción de retiro en local, cuando revisa el resumen de compra, entonces el costo de envío debe ser de $0. | Ejecutar las condiciones Dado/Cuando del texto oficial; contrastar UI y respuesta/persistencia con: el costo de envío debe ser de $0. | F10; B10; T10; D10 | Claro. Sin servicio externo: lógica propia con bases locales y usuario autorizado/invitado según criterio. |
| HU10-CA03 | Dado que el servicio logístico configurado no puede calcular una tarifa, cuando el comprador intenta continuar, entonces el sistema debe informar que no fue posible obtener el costo del despacho. | Ejecutar las condiciones Dado/Cuando del texto oficial; contrastar UI y respuesta/persistencia con: el sistema debe informar que no fue posible obtener el costo del despacho. | F10; B10; T10; D10 | Claro. Sin servicio externo: lógica propia con bases locales y usuario autorizado/invitado según criterio. |
| HU10-CA04 | Dado que la tienda tiene habilitados diferentes operadores logísticos, cuando el comprador consulta las alternativas disponibles, entonces el sistema debe utilizar únicamente los servicios configurados por el emprendedor. | Ejecutar las condiciones Dado/Cuando del texto oficial; contrastar UI y respuesta/persistencia con: el sistema debe utilizar únicamente los servicios configurados por el emprendedor. | F10; B10; T10; D10 | Claro. Sin servicio externo: lógica propia con bases locales y usuario autorizado/invitado según criterio. |

## HU11 — Seguimiento Logístico de Envíos

Fuente: H_Usuario.pdf, página 6.
- Frontend F11: `features/storefront/pages/Tracking.tsx; features/storefront/services/`.
- Backend/API B11: `apps/core/presentation/order_tracking.py; apps/shipping/; /api/pedidos/seguimiento/`.
- Tests existentes T11: frontend `order-tracking.cjs,tracking-states.cjs,shipping-tracking.cjs,shipping-tracking-chilexpress.cjs`; Django `apps.core.test_order_tracking,apps.core.test_tracking_security,apps.shipping.tests`.
- Datos D11: Pedido con despacho, código transportista, email correcto/incorrecto, hitos y respuesta vacía/fallida.

| ID | Texto oficial | Flujo verificable y evidencia esperada | Frontend / backend / tests / datos | Clasificación y dependencia/ambigüedad |
|---|---|---|---|---|
| HU11-CA01 | Dado que el comprador posee una orden con despacho, cuando consulta el seguimiento mediante una consulta válida, entonces el sistema debe consultar la API del operador logístico configurado. | Ejecutar las condiciones Dado/Cuando del texto oficial; contrastar UI y respuesta/persistencia con: el sistema debe consultar la API del operador logístico configurado. | F11; B11; T11; D11 | Depende de servicio externo. API seguimiento del transportista configurado. |
| HU11-CA02 | Dado que el operador logístico entrega información de seguimiento, cuando el sistema procesa la respuesta de la API, entonces debe mostrar una línea de tiempo estandarizada del envío. | Ejecutar las condiciones Dado/Cuando del texto oficial; contrastar UI y respuesta/persistencia con: debe mostrar una línea de tiempo estandarizada del envío. | F11; B11; T11; D11 | Depende de servicio externo. Respuesta de transportista; normalizador puede ejercitarse con dobles. |
| HU11-CA03 | Dado que el operador informa hitos de seguimiento, cuando el comprador consulta el estado del despacho, entonces el sistema debe representar dichos hitos mediante estados como “En origen”, “En tránsito” y “En reparto”, según la información disponible. | Ejecutar las condiciones Dado/Cuando del texto oficial; contrastar UI y respuesta/persistencia con: el sistema debe representar dichos hitos mediante estados como “En origen”, “En tránsito” y “En reparto”, según la información disponible. | F11; B11; T11; D11 | Depende de servicio externo. Hitos de transportista; representación local comprobable. |
| HU11-CA04 | Dado que el comprador invitado no posee una cuenta, cuando accede al portal público de seguimiento e ingresa el número de orden y correo electrónico asociados, entonces el sistema debe permitir consultar el seguimiento de forma segura. | Ejecutar las condiciones Dado/Cuando del texto oficial; contrastar UI y respuesta/persistencia con: el sistema debe permitir consultar el seguimiento de forma segura. | F11; B11; T11; D11 | Claro. Sin servicio externo: lógica propia con bases locales y usuario autorizado/invitado según criterio. |

## HU12 — Dashboard Operativo

Fuente: H_Usuario.pdf, página 6.
- Frontend F12: `features/admin/pages/Dashboard.tsx`.
- Backend/API B12: `apps/core/presentation/dashboard.py; /api/tienda/dashboard/; /api/tienda/pedidos/ultimos/`.
- Tests existentes T12: frontend `dashboard.cjs,recent-orders.cjs,dashboard-navigation.cjs`; Django `apps.core.test_dashboard,apps.core.test_ultimas_ordenes,apps.core.test_business_periods`.
- Datos D12: Propietario, pedidos de varios estados y fechas dentro/fuera del período, fechas zona negocio.

| ID | Texto oficial | Flujo verificable y evidencia esperada | Frontend / backend / tests / datos | Clasificación y dependencia/ambigüedad |
|---|---|---|---|---|
| HU12-CA01 | Dado que el emprendedor accede al panel administrativo, cuando carga la vista principal, entonces el sistema debe mostrar las métricas principales de ventas y pedidos de la tienda. | Ejecutar las condiciones Dado/Cuando del texto oficial; contrastar UI y respuesta/persistencia con: el sistema debe mostrar las métricas principales de ventas y pedidos de la tienda. | F12; B12; T12; D12 | Claro. Sin servicio externo: lógica propia con bases locales y usuario autorizado/invitado según criterio. |
| HU12-CA02 | Dado que existen ventas registradas, cuando el emprendedor consulta un período determinado, entonces el sistema debe mostrar información histórica correspondiente al período seleccionado. | Ejecutar las condiciones Dado/Cuando del texto oficial; contrastar UI y respuesta/persistencia con: el sistema debe mostrar información histórica correspondiente al período seleccionado. | F12; B12; T12; D12 | Claro. Sin servicio externo: lógica propia con bases locales y usuario autorizado/invitado según criterio. |
| HU12-CA03 | Dado que existen órdenes registradas, cuando el emprendedor accede al dashboard, entonces el sistema debe mostrar las últimas órdenes registradas. | Ejecutar las condiciones Dado/Cuando del texto oficial; contrastar UI y respuesta/persistencia con: el sistema debe mostrar las últimas órdenes registradas. | F12; B12; T12; D12 | Claro. Sin servicio externo: lógica propia con bases locales y usuario autorizado/invitado según criterio. |

## HU13 — Gestión de Estados de Pedidos

Fuente: H_Usuario.pdf, página 7.
- Frontend F13: `features/admin/pages/Orders.tsx; features/storefront/pages/CustomerOrders.tsx; features/storefront/pages/Tracking.tsx`.
- Backend/API B13: `apps/core/presentation/recent_orders.py; /api/tienda/pedidos/<id>/estado/`.
- Tests existentes T13: frontend `customer-orders.cjs,tracking-states.cjs`; Django `apps.core.test_order_status_update,apps.core.test_order_filter,apps.core.test_customer_orders`.
- Datos D13: Pedidos propios/ajenos, cada estado permitido, estado inválido, comprador asociado.

| ID | Texto oficial | Flujo verificable y evidencia esperada | Frontend / backend / tests / datos | Clasificación y dependencia/ambigüedad |
|---|---|---|---|---|
| HU13-CA01 | Dado que el emprendedor consulta una orden, cuando revisa su información, entonces el sistema debe mostrar el estado actual de la orden. | Ejecutar las condiciones Dado/Cuando del texto oficial; contrastar UI y respuesta/persistencia con: el sistema debe mostrar el estado actual de la orden. | F13; B13; T13; D13 | Claro. Sin servicio externo: lógica propia con bases locales y usuario autorizado/invitado según criterio. |
| HU13-CA02 | Dado que el emprendedor actualiza el estado de una orden, cuando selecciona un estado permitido, entonces el sistema debe guardar la actualización correspondiente. | Ejecutar las condiciones Dado/Cuando del texto oficial; contrastar UI y respuesta/persistencia con: el sistema debe guardar la actualización correspondiente. | F13; B13; T13; D13 | Claro. Sin servicio externo: lógica propia con bases locales y usuario autorizado/invitado según criterio. |
| HU13-CA03 | Dado que el emprendedor actualiza una orden, cuando selecciona el nuevo estado, entonces el sistema solo debe permitir los estados “Pendiente”, “Pagado”, “En preparación”, “Despachado”, “Entregado” o “Cancelado”. | Ejecutar las condiciones Dado/Cuando del texto oficial; contrastar UI y respuesta/persistencia con: el sistema solo debe permitir los estados “Pendiente”, “Pagado”, “En preparación”, “Despachado”, “Entregado” o “Cancelado”. | F13; B13; T13; D13 | Claro. Sin servicio externo: lógica propia con bases locales y usuario autorizado/invitado según criterio. |
| HU13-CA04 | Dado que una orden cambia de estado, cuando la actualización es confirmada, entonces el nuevo estado debe quedar disponible para la consulta del comprador. | Ejecutar las condiciones Dado/Cuando del texto oficial; contrastar UI y respuesta/persistencia con: el nuevo estado debe quedar disponible para la consulta del comprador. | F13; B13; T13; D13 | Claro. Sin servicio externo: lógica propia con bases locales y usuario autorizado/invitado según criterio. |
| HU13-CA05 | Dado que el emprendedor consulta sus órdenes, cuando aplica un filtro de estado, entonces el sistema debe mostrar las órdenes correspondientes al estado seleccionado. | Ejecutar las condiciones Dado/Cuando del texto oficial; contrastar UI y respuesta/persistencia con: el sistema debe mostrar las órdenes correspondientes al estado seleccionado. | F13; B13; T13; D13 | Claro. Sin servicio externo: lógica propia con bases locales y usuario autorizado/invitado según criterio. |

## HU14 — Gestión de Páginas Legales

Fuente: H_Usuario.pdf, página 8.
- Frontend F14: `features/admin/pages/Legal.tsx; features/storefront/pages/Legal.tsx; features/storefront/pages/Checkout.tsx`.
- Backend/API B14: `apps/core/presentation/legal.py; /api/legal/; /api/legal/configuracion/publicar/`.
- Tests existentes T14: frontend `legal-pages.cjs,legal-content-versions.cjs,legal-current-version.cjs`; Django `apps.core.test_legal`.
- Datos D14: Tres tipos de página, borrador, publicación v1/v2, visitante y decisión formal sobre aceptación obligatoria.

| ID | Texto oficial | Flujo verificable y evidencia esperada | Frontend / backend / tests / datos | Clasificación y dependencia/ambigüedad |
|---|---|---|---|---|
| HU14-CA01 | Dado que el emprendedor accede al módulo de información legal, cuando selecciona una de las páginas disponibles, entonces el sistema debe proporcionar campos editables para personalizar su contenido. | Ejecutar las condiciones Dado/Cuando del texto oficial; contrastar UI y respuesta/persistencia con: el sistema debe proporcionar campos editables para personalizar su contenido. | F14; B14; T14; D14 | Claro. Sin servicio externo: lógica propia con bases locales y usuario autorizado/invitado según criterio. |
| HU14-CA02 | Dado que el emprendedor completa y guarda los contenidos, cuando un comprador accede a la tienda, entonces el sistema debe permitir visualizar los Términos y Condiciones , la Política de Privacidad y la Política de Reembolso publicados. | Ejecutar las condiciones Dado/Cuando del texto oficial; contrastar UI y respuesta/persistencia con: el sistema debe permitir visualizar los Términos y Condiciones , la Política de Privacidad y la Política de Reembolso publicados. | F14; B14; T14; D14 | Claro. Sin servicio externo: lógica propia con bases locales y usuario autorizado/invitado según criterio. |
| HU14-CA03 | Dado que el emprendedor publica una página legal, cuando un comprador accede al enlace correspondiente, entonces el sistema debe mostrar la versión vigente del contenido configurado. | Ejecutar las condiciones Dado/Cuando del texto oficial; contrastar UI y respuesta/persistencia con: el sistema debe mostrar la versión vigente del contenido configurado. | F14; B14; T14; D14 | Claro. Sin servicio externo: lógica propia con bases locales y usuario autorizado/invitado según criterio. |
| HU14-CA04 | La exigencia de aceptación explícita de determinadas páginas legales durante el checkout deberá implementarse únicamente si dicha condición es validada y definida como requisito obligatorio. | Obtener decisión formal de obligatoriedad y páginas incluidas; después comprobar aceptación en checkout solo si se activa la condición. Evidencia esperada: decisión trazable y prueba positiva/negativa de dicha regla. | F14; B14; T14; D14 | Ambiguo. Condición explícita del PDF: falta decisión de obligatoriedad/alcance de páginas. Obtener definición del responsable; no inventar checkbox obligatorio ni declarar no aplicable.. |

## HU15 — Promociones y Códigos de Descuento

Fuente: H_Usuario.pdf, página 9.
- Frontend F15: `features/admin/pages/Promotions.tsx; features/storefront/pages/Checkout.tsx; features/storefront/components/store/ProductCard.tsx`.
- Backend/API B15: `apps/core/presentation/promotions.py; /api/promociones/; /api/promociones/validar/`.
- Tests existentes T15: frontend `promotions.cjs,cart-checkout.cjs`; Django `apps.core.test_promotions,apps.core.test_checkout`.
- Datos D15: Cupón porcentual/fijo vigente/expirado, umbral de envío, oferta y precio original.

| ID | Texto oficial | Flujo verificable y evidencia esperada | Frontend / backend / tests / datos | Clasificación y dependencia/ambigüedad |
|---|---|---|---|---|
| HU15-CA01 | Dado que el emprendedor crea un código de descuento por porcentaje o monto fijo, cuando define sus condiciones y lo guarda, entonces el sistema debe registrar la promoción y dejarla disponible para su aplicación. | Ejecutar las condiciones Dado/Cuando del texto oficial; contrastar UI y respuesta/persistencia con: el sistema debe registrar la promoción y dejarla disponible para su aplicación. | F15; B15; T15; D15 | Claro. Sin servicio externo: lógica propia con bases locales y usuario autorizado/invitado según criterio. |
| HU15-CA02 | Dado que un comprador ingresa un código promocional válido, cuando aplica dicho código en el proceso de checkout, entonces el sistema debe recalcular el monto a pagar incorporando el descuento correspondiente. | Ejecutar las condiciones Dado/Cuando del texto oficial; contrastar UI y respuesta/persistencia con: el sistema debe recalcular el monto a pagar incorporando el descuento correspondiente. | F15; B15; T15; D15 | Claro. Sin servicio externo: lógica propia con bases locales y usuario autorizado/invitado según criterio. |
| HU15-CA03 | Dado que el emprendedor configura envío gratuito a partir de un monto mínimo, cuando el total de productos del carrito supera dicho umbral, entonces el sistema debe aplicar el beneficio de envío gratuito. | Ejecutar las condiciones Dado/Cuando del texto oficial; contrastar UI y respuesta/persistencia con: el sistema debe aplicar el beneficio de envío gratuito. | F15; B15; T15; D15 | Claro. Sin servicio externo: lógica propia con bases locales y usuario autorizado/invitado según criterio. |
| HU15-CA04 | Dado que el emprendedor configura un precio de oferta para un producto, cuando el comprador visualiza dicho producto, entonces el sistema debe mostrar el precio de oferta junto con el precio original diferenciado. | Ejecutar las condiciones Dado/Cuando del texto oficial; contrastar UI y respuesta/persistencia con: el sistema debe mostrar el precio de oferta junto con el precio original diferenciado. | F15; B15; T15; D15 | Claro. Sin servicio externo: lógica propia con bases locales y usuario autorizado/invitado según criterio. |

## HU16 — Notificaciones Transaccionales Automatizadas

Fuente: H_Usuario.pdf, página 10.
- Frontend F16: `features/admin/pages/Emails.tsx; features/storefront/pages/OrderConfirmation.tsx`.
- Backend/API B16: `apps/core/email_service.py; apps/core/presentation/checkout.py; /api/tienda/correos/`.
- Tests existentes T16: frontend `email-variables.cjs,order-email-notice.cjs`; Django `apps.core.test_email_service,apps.core.test_correos_pedido,apps.core.test_correos_webpay,apps.core.test_correo_despacho,apps.core.test_enlace_seguimiento`.
- Datos D16: Pedido nuevo, pago aprobado/rechazado, despacho con tracking y buzón de prueba aislado.

| ID | Texto oficial | Flujo verificable y evidencia esperada | Frontend / backend / tests / datos | Clasificación y dependencia/ambigüedad |
|---|---|---|---|---|
| HU16-CA01 | Dado que un comprador genera un pedido, cuando la orden es registrada correctamente, entonces el sistema debe enviar un correo electrónico de confirmación de recepción que incluya el resumen de la compra. | Ejecutar las condiciones Dado/Cuando del texto oficial; contrastar UI y respuesta/persistencia con: el sistema debe enviar un correo electrónico de confirmación de recepción que incluya el resumen de la compra. | F16; B16; T16; D16 | Depende de servicio externo. Entrega SMTP real requiere proveedor/buzón; composición y disparadores verificables con outbox aislado. |
| HU16-CA02 | Dado que un pago es procesado, cuando el resultado corresponde a un pago exitoso, entonces el sistema debe enviar una notificación de confirmación al correo del comprador. | Ejecutar las condiciones Dado/Cuando del texto oficial; contrastar UI y respuesta/persistencia con: el sistema debe enviar una notificación de confirmación al correo del comprador. | F16; B16; T16; D16 | Depende de servicio externo. Entrega SMTP real requiere proveedor/buzón; composición y disparadores verificables con outbox aislado. |
| HU16-CA03 | Dado que un pago es rechazado, cuando la plataforma recibe la respuesta correspondiente, entonces el sistema debe informar al comprador que el pago no fue aprobado. | Ejecutar las condiciones Dado/Cuando del texto oficial; contrastar UI y respuesta/persistencia con: el sistema debe informar al comprador que el pago no fue aprobado. | F16; B16; T16; D16 | Depende de servicio externo. Entrega SMTP real requiere proveedor/buzón; composición y disparadores verificables con outbox aislado. |
| HU16-CA04 | Dado que el pedido cambia al estado de despacho, cuando existe información de seguimiento disponible, entonces el sistema debe enviar al comprador una notificación de despacho. | Ejecutar las condiciones Dado/Cuando del texto oficial; contrastar UI y respuesta/persistencia con: el sistema debe enviar al comprador una notificación de despacho. | F16; B16; T16; D16 | Depende de servicio externo. Entrega SMTP real requiere proveedor/buzón; composición y disparadores verificables con outbox aislado. |
| HU16-CA05 | Dado que existe un número o enlace de seguimiento, cuando se envía la notificación de despacho, entonces el correo debe incluir el enlace al portal de seguimiento o la información necesaria para acceder a él. | Ejecutar las condiciones Dado/Cuando del texto oficial; contrastar UI y respuesta/persistencia con: el correo debe incluir el enlace al portal de seguimiento o la información necesaria para acceder a él. | F16; B16; T16; D16 | Depende de servicio externo. Entrega SMTP real requiere proveedor/buzón; composición y disparadores verificables con outbox aislado. |

## HU17 — Configuración de Analítica y SEO

Fuente: H_Usuario.pdf, página 10.
- Frontend F17: `features/admin/pages/Products.tsx; features/admin/pages/SeoAnalytics.tsx; features/storefront/pages/ProductDetail.tsx; features/storefront/services/`.
- Backend/API B17: `apps/catalog/; /api/catalog/productos/<id>/actualizar/; revisar persistencia analítica`.
- Tests existentes T17: frontend `product-seo.cjs,store-seo-metadata.cjs,google-analytics-public-store.cjs,google-analytics-persistence.cjs,meta-pixel-public-store.cjs`; Django `apps.catalog.test_editing,apps.catalog.test_creation`.
- Datos D17: Producto con meta título/descripción, IDs GA/Pixel válidos/invalidos, consentimiento analítico y visitante en otro navegador.

| ID | Texto oficial | Flujo verificable y evidencia esperada | Frontend / backend / tests / datos | Clasificación y dependencia/ambigüedad |
|---|---|---|---|---|
| HU17-CA01 | Dado que el emprendedor edita un producto, cuando ingresa un meta-título y una meta-descripción, entonces el sistema debe almacenar dichos datos asociados al producto. | Ejecutar las condiciones Dado/Cuando del texto oficial; contrastar UI y respuesta/persistencia con: el sistema debe almacenar dichos datos asociados al producto. | F17; B17; T17; D17 | Claro. Sin servicio externo: lógica propia con bases locales y usuario autorizado/invitado según criterio. |
| HU17-CA02 | Dado que un producto posee información SEO configurada, cuando un visitante accede a la página correspondiente, entonces el sistema debe utilizar los metadatos configurados en dicha página. | Ejecutar las condiciones Dado/Cuando del texto oficial; contrastar UI y respuesta/persistencia con: el sistema debe utilizar los metadatos configurados en dicha página. | F17; B17; T17; D17 | Claro. Sin servicio externo: lógica propia con bases locales y usuario autorizado/invitado según criterio. |
| HU17-CA03 | Dado que el emprendedor ingresa un identificador válido de Google Analytics, cuando guarda la configuración, entonces el sistema debe incorporar dinámicamente la configuración de analítica en la tienda pública. | Ejecutar las condiciones Dado/Cuando del texto oficial; contrastar UI y respuesta/persistencia con: el sistema debe incorporar dinámicamente la configuración de analítica en la tienda pública. | F17; B17; T17; D17 | Depende de servicio externo. Script local verificable sin red; recepción de eventos en GA/Meta requiere cuenta, red y consentimiento. |
| HU17-CA04 | Dado que el emprendedor configura un Pixel de Meta/Facebook, cuando guarda la configuración, entonces el sistema debe incorporar el identificador correspondiente en la tienda pública. | Ejecutar las condiciones Dado/Cuando del texto oficial; contrastar UI y respuesta/persistencia con: el sistema debe incorporar el identificador correspondiente en la tienda pública. | F17; B17; T17; D17 | Depende de servicio externo. Script local verificable sin red; recepción de eventos en GA/Meta requiere cuenta, red y consentimiento. |

## Control previo a SCRUM-503

17/17 HU y 62/62 criterios transcritos con ID único. Todos tienen condiciones, resultado/evidencia esperada, componentes, suites a inspeccionar, datos y dependencias. La única ambigüedad se separa del texto oficial (HU14-CA04). La ejecución y los resultados pertenecen exclusivamente a SCRUM-503.
