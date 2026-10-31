# SCRUM-500 — Pruebas de integración logística

Fecha: 2026-10-30. Fuente: archivos reales de la rama `develop` (commit `fba6a48`). Alcance: Cotización, datos de envío, seguimiento y manejo de errores.

| Campo | Detalle |
| --- | --- |
| Ticket | SCRUM-500 · Realizar pruebas de integración logística |
| Backlog | BL-426 |
| Componente | Logística: módulos `shipping` y `core` del backend, y `shippingService.ts` del frontend |
| Versión del código | Rama `develop`, commit `fba6a48` |
| Fecha | 30 de octubre de 2026 |
| Estado | Listo para validación |
| Resultado | 92 de 94 escenarios cumplen; 2 no cumplen (un hallazgo, sección 4) |
| Evidencia | `docs/sprint7/SCRUM-500-evidencia/` (`qa_s9_logistica.py` y `resultados_qa_logistica.json`) |

## 1. Propósito y alcance

Este documento valida la integración de la plataforma con los servicios logísticos implementados. Se comprobó el intercambio de información en los cinco escenarios del ticket: **cotización de alternativas de despacho, datos de envío, seguimiento, respuestas inválidas e indisponibilidad del servicio externo**.

> **Alcance real de la integración**
>
> En esta versión **no existe una conexión con las APIs reales de Chilexpress ni de Starken**. La cotización del checkout usa tarifas por comuna que configura la propia tienda (`docs/shipping-quotes.md`), y el módulo `shipping` calcula con tablas internas y devuelve seguimientos simulados. Las pruebas validan el intercambio entre la plataforma y los adaptadores (contratos, normalizadores, validaciones y códigos de error). Las fallas del operador se simularon sustituyendo la respuesta del adaptador.

## 2. Cómo está construida la integración

Existen dos capas que conviven, y el frontend usa ambas.

| Capa | Rutas | Qué hace | Origen de los datos |
| --- | --- | --- | --- |
| **Cotización de la tienda** | `POST /api/entregas/cotizacion/` y `POST /api/checkout/pedidos/` | Cotiza por operador, región y comuna; emite una referencia firmada que vence a los 15 minutos y el pedido la revalida | Tarifas que la tienda guarda en `ConfiguracionEntrega` |
| **Módulo logístico** | `POST /api/logistica/cotizar/` (y `/chilexpress/`, `/starken/`) y `GET /api/logistica/seguimiento/...` | Cotiza con tablas por región, aplica envío gratis en la RM desde $ 30.000, genera despachos y consulta seguimientos | Tablas internas y respuestas fijas dentro de `adapters.py` |

El módulo `shipping` sigue una arquitectura hexagonal: el contrato `LogisticsPort` define `cotizar_envio`, `generar_despacho` y `consultar_seguimiento`, y lo implementan `ChilexpressAdapter`, `StarkenAdapter`, `StandardLogisticsAdapter` y `MultiCarrierLogisticsAdapter` (que consulta a todos y tolera que uno falle).

#### Códigos de error del módulo logístico

| HTTP | Código | Cuándo ocurre |
| --- | --- | --- |
| 400 | `SIN_COBERTURA`, `FORMATO_TRACKING_INVALIDO`, `ERROR_LOGISTICA` | Destino sin cobertura, código de seguimiento con formato inválido u otra regla de negocio |
| 404 | `TRACKING_NO_ENCONTRADO` | El operador no registra el envío |
| 502 | `RESPUESTA_OPERADOR_INVALIDA`, `PROVEEDOR_NO_DISPONIBLE` | Respuesta corrupta o incompleta, o transportistas que no responden |
| 504 | `TIEMPO_ESPERA_AGOTADO` | Se agotó el tiempo de espera; incluye la cabecera `Retry-After: 30` |
| 500 | `ERROR_INTERNO` | Error inesperado, sin exponer detalles técnicos |

La cotización de la tienda responde con códigos propios: `DESTINO_INVALIDO`, `OPERADOR_INVALIDO`, `TRANSPORTISTA_NO_HABILITADO`, `TARIFA_NO_DISPONIBLE`, `COTIZACION_VENCIDA`, `COTIZACION_INVALIDA` y `COTIZACION_CAMBIO`.

## 3. Resultados

Se ejecutaron **94 escenarios de integración** de caja negra y las **136 pruebas automáticas** que ya existen en el repositorio. Todas las pruebas existentes pasan; de los escenarios nuevos, 92 cumplen y 2 no cumplen.

| Área | Escenarios | Cumplen | No cumplen |
| --- | --- | --- | --- |
| **A**. Cotización de la tienda | 20 | 20 | 0 |
| **B**. Cotización firmada | 11 | 11 | 0 |
| **C**. Módulo logístico: cotización | 20 | 20 | 0 |
| **D**. Seguimiento de envíos | 20 | 18 | 2 |
| **E**. Contratos y validaciones internas | 11 | 11 | 0 |
| **F**. Datos de envío en el pedido | 12 | 12 | 0 |
| **Total** | 94 | 92 | 2 |

#### Pruebas automáticas existentes (ejecutadas)

| Archivo | Pruebas | Resultado |
| --- | --- | --- |
| `apps/shipping/tests.py` | 39 | Todas correctas |
| `apps/shipping/test_cotizacion_errores.py` | 12 | Todas correctas |
| `apps/core/test_shipping.py` | 30 | Todas correctas |
| `apps/core/test_shipping_errores.py` | 13 | Todas correctas |
| `apps/core/test_tracking_security.py` | 17 | Todas correctas |
| `apps/core/test_delivery.py` | 25 | Todas correctas |
| **Total** | **136** | **136 correctas en 1,1 s** |

#### Cobertura de los criterios del ticket

| Criterio | Escenarios | Resultado |
| --- | --- | --- |
| Obtención de alternativas o cotizaciones | A01 a A03, C01 a C05, C10 | Cumple |
| Datos de envío (destino, tarifas, cotización firmada y pedido) | A04 a A20, B01 a B11, F01 a F12 | Cumple |
| Seguimiento | D01 a D06, D08, D09, D18, D19 | Cumple |
| Respuestas inválidas del operador | A13, A14, C19, D10, D11, E04 a E08 | Cumple |
| Indisponibilidad del servicio externo | C13 a C18, D07, D12 a D14 | **Cumple en tiempos de espera; no cumple en conexión rechazada (hallazgo H1)** |

## 4. Hallazgos y recomendaciones

> **Un defecto confirmado**
>
> Si el operador rechaza la conexión (no es un tiempo de espera), el sistema responde **500 ERROR_INTERNO** en lugar de **502 PROVEEDOR_NO_DISPONIBLE** (escenarios D13 y D14). Hoy es latente, porque los adaptadores no hacen llamadas de red reales, pero se manifestará al integrar un operador real.

| # | Hallazgo | Severidad | Recomendación |
| --- | --- | --- | --- |
| H1 | Una conexión rechazada del operador termina en 500. Solo se traducen los tiempos de espera (`TimeoutError`, `requests.exceptions.Timeout`) | Media | Capturar `requests.exceptions.ConnectionError` (o `RequestException`) en los adaptadores y lanzar `ProveedorLogisticoError` |
| H2 | La integración con los operadores es simulada: el seguimiento devuelve eventos fijos (fechas de octubre de 2026) y los códigos que terminan en `0000` o contienen `NOTFOUND` o `TIMEOUT` simulan errores dentro del código de producción | Media | Antes de integrar APIs reales, mover estos comportamientos a un adaptador de prueba y asegurar que el comprador no vea seguimientos ficticios |
| H3 | Conviven dos rutas de cotización con reglas distintas: la del módulo logístico (tablas internas y envío gratis en la RM) y la de la tienda (tarifas configuradas). El frontend contiene llamadas a ambas | Media | Definir cuál es la fuente de verdad del monto que paga el comprador y evitar mostrar dos cifras distintas |
| H4 | Las rutas `/api/logistica/` son públicas: cualquier persona con un código puede consultar un seguimiento | Baja | Confirmar que es lo deseado; el seguimiento del pedido propio (`pedidos/seguimiento/`) ya tiene protección y 17 pruebas |
| H5 | Un transportista desconocido en el cuerpo (por ejemplo `fedex`) se trata como “todos” sin avisar | Baja | Rechazar con 400 o informar el transportista aplicado |
| H6 | El código de seguimiento no tiene límite de longitud (5.000 caracteres devuelven 200) | Baja | Limitar el largo en la ruta o en el adaptador |
| H7 | Una región desconocida recibe una tarifa por defecto en los adaptadores (el serializer la rechaza antes, así que no ocurre por la API) | Baja | Rechazar la región desconocida también en el adaptador |
| H8 | Un código con una barra codificada (`%2F`) devuelve la página 404 HTML de Django, no el JSON de la API | Baja | Aceptable; documentar o agregar un manejador de 404 en `/api/` |

#### Lo que funciona bien

- Los errores nunca filtran detalles técnicos al comprador (C20).
- La cotización firmada impide manipular montos: se rechaza si está vencida, alterada, firmada para otra tienda o si la tarifa cambió, y el pedido no reserva stock en esos casos (B01 a B11 y F03 a F08).
- El reintento de un pedido con la misma clave no lo duplica ni reserva stock dos veces (F10).
- Con un transportista caído, la cotización responde con los demás (degradación parcial, C15) y solo falla si caen todos (C16).
- Las respuestas corruptas del operador, en cualquiera de las seis formas probadas, terminan en 502 y no llegan al comprador (D10 y E04 a E08).

## 5. Cómo reproducir las pruebas

Con Docker, desde la raíz del proyecto (PowerShell). Los escenarios nuevos no requieren MongoDB: el catálogo se simula en el pedido.

```powershell
# 1. Copiar el script de evidencia dentro del backend
Copy-Item docs\sprint7\SCRUM-500-evidencia\qa_s9_logistica.py backend\apps\core\qa_s9_logistica.py

# 2. Escenarios de integración de este ticket (94)
docker compose exec backend python manage.py test apps.core.qa_s9_logistica

# 3. Pruebas automáticas existentes de logística (136)
docker compose exec backend python manage.py test apps.shipping apps.core.test_shipping apps.core.test_shipping_errores apps.core.test_tracking_security apps.core.test_delivery
```

Comprobación manual de las rutas (con el backend en `http://localhost:8000`):

```powershell
# Cotización del módulo logístico
Invoke-RestMethod -Method Post -Uri http://localhost:8000/api/logistica/cotizar/ -ContentType 'application/json' -Body '{"comuna":"Providencia","region":"Metropolitana","total_carrito":20000,"total_items":2}'

# Seguimiento (Chilexpress)
Invoke-RestMethod http://localhost:8000/api/logistica/seguimiento/chilexpress/CHILEX-ABC12345/

# Cotización de la tienda (requiere tarifas configuradas en el panel Entregas)
Invoke-RestMethod -Method Post -Uri http://localhost:8000/api/entregas/cotizacion/ -ContentType 'application/json' -Body '{"operador":"Chilexpress","region":"Metropolitana","comuna":"Providencia"}'
```

## 6. Entorno, limitaciones y pendientes

| Tema | Detalle |
| --- | --- |
| Entorno de la ejecución | Python 3.12 y Django 5.2.18, con SQLite de prueba y las tablas creadas desde los modelos; sin Docker. El catálogo de MongoDB se simula en los escenarios del pedido |
| Operadores reales | No se probó contra Chilexpress ni Starken porque el código no los llama. Al integrarlos hay que repetir los escenarios C13 a C18, D07 y D10 a D14 con respuestas reales |
| Fallas simuladas | Los tiempos de espera, las respuestas inválidas y las caídas se simularon sustituyendo la respuesta del adaptador, no cortando una red real |
| No cubierto | Pruebas de carga y concurrencia, y la pantalla de checkout en un navegador |
| Seguimiento del pedido propio | Se apoya en las 17 pruebas existentes de `test_tracking_security.py`; no se repitió con escenarios nuevos |
| Aceptación | Los escenarios D13 y D14 deberían pasar a CUMPLE una vez corregido el hallazgo H1 |

## 7. Referencias

- `docs/shipping-quotes.md`: cotización y checkout; `docs/correo-despacho.md`: correo de despacho.
- `backend/apps/shipping/` (dominio, casos de uso, adaptadores y vistas) y `backend/apps/core/shipping.py` (cotización firmada).
- `backend/apps/catalog/infrastructure/adapters/` (normalizadores de Chilexpress, Starken y seguimiento).
- `frontend/src/features/storefront/services/shippingService.ts`.

## A. Anexo: detalle de los escenarios

Cada fila muestra el resultado esperado y el obtenido en la ejecución del 30 de octubre de 2026. Las notas aclaran comportamientos que merecen atención.

### A. Cotización de la tienda

| ID | Escenario | Esperado | Obtenido | Estado |
| --- | --- | --- | --- | --- |
| A01 | Cotizar Chilexpress a Providencia con tarifa configurada | 200; monto 4500 CLP, plazo 2, origen configuracion_tienda y cotización firmada con vencimiento | 200; monto 4500 CLP, plazo 2, origen configuracion_tienda, vence en 900 s · Nota: El endpoint es público (sin sesión) | Cumple |
| A02 | Cotizar Starken a Providencia | 200; monto 6900 CLP y plazo 2 días | 200; monto 6900, plazo 2, operador Starken | Cumple |
| A03 | Tarifa sin plazo configurado (Viña del Mar) | 200; plazo_dias nulo | 200; monto 5500, plazo None | Cumple |
| A04 | Operador no permitido (Correos) | 400 sin llegar al cálculo | 400; ['operador'] | Cumple |
| A05 | Operador ausente | 400 | 400 | Cumple |
| A06 | Comuna que no pertenece a la región | 400 con código DESTINO_INVALIDO | 400; DESTINO_INVALIDO | Cumple |
| A07 | Comuna inexistente | 400 con código DESTINO_INVALIDO | 400; DESTINO_INVALIDO | Cumple |
| A08 | Comuna válida sin tarifa configurada (Santiago) | 400 con código TARIFA_NO_DISPONIBLE | 400; TARIFA_NO_DISPONIBLE | Cumple |
| A09 | Transportista deshabilitado en la tienda | 400 con código TRANSPORTISTA_NO_HABILITADO | 400; TRANSPORTISTA_NO_HABILITADO | Cumple |
| A10 | Campo no permitido en el cuerpo (costo) | 400: el serializer estricto lo rechaza | 400 | Cumple |
| A11 | Intento de elegir otra tienda con tienda_id en el cuerpo | 400 | 400 | Cumple |
| A12 | Cabecera X-Tienda-ID de otra tienda | 400: la tienda se contrasta, no se selecciona | 400 | Cumple |
| A13 | Tarifas corruptas en la base (monto texto, negativo, decimal, enorme, booleano; plazo 0, 366, texto) | Siempre 400 TARIFA_NO_DISPONIBLE, nunca 500 | monto='4500'→400 TARIFA_NO_DISPONIBLE; monto=-1→400 TARIFA_NO_DISPONIBLE; monto=1.5→400 TARIFA_NO_DISPONIBLE; monto=100000000000→400 TARIFA_NO_DISPONIBLE; monto=True→400 TARIFA_NO_DISPONIBLE; plazo_dias=0→400 TARIFA_NO_DISPONIBLE; plazo_dias=366→400 TARIFA_NO_DISPONIBLE; plazo_dias='2'→400 TARIFA_NO_DISPONIBLE | Cumple |
| A14 | Dos tarifas duplicadas para el mismo destino | 400 TARIFA_NO_DISPONIBLE (ambigüedad) | 400; TARIFA_NO_DISPONIBLE | Cumple |
| A15 | Método GET en la cotización | 405 | 405 | Cumple |
| A16 | JSON mal formado | 400 | 400 | Cumple |
| A17 | Tipos inválidos (región numérica, comuna lista) | 400 | 400 | Cumple |
| A18 | Texto demasiado largo (200 caracteres) | 400 | 400 | Cumple |
| A19 | Instalación con dos tiendas | 503: nunca elige una al azar | 503; La instalación contiene varias tiendas; revise su  | Cumple |
| A20 | Instalación sin tienda configurada | 503 | 503 | Cumple |

### B. Cotización firmada

| ID | Escenario | Esperado | Obtenido | Estado |
| --- | --- | --- | --- | --- |
| B01 | Cotización vigente y sin cambios | Aceptada | aceptada | Cumple |
| B02 | Cotización vencida (más de 15 minutos) | COTIZACION_VENCIDA | COTIZACION_VENCIDA | Cumple |
| B03 | Cotización manipulada (se altera la firma) | COTIZACION_INVALIDA | COTIZACION_INVALIDA | Cumple |
| B04 | Cotización vacía o ausente | COTIZACION_INVALIDA | vacía→COTIZACION_INVALIDA; None→COTIZACION_INVALIDA | Cumple |
| B05 | Cotización firmada para otra tienda | COTIZACION_CAMBIO | COTIZACION_CAMBIO | Cumple |
| B06 | La tienda cambia el monto de la tarifa después de cotizar | COTIZACION_CAMBIO | COTIZACION_CAMBIO | Cumple |
| B07 | La tienda elimina la tarifa después de cotizar | TARIFA_NO_DISPONIBLE | TARIFA_NO_DISPONIBLE | Cumple |
| B08 | La tienda deshabilita el transportista después de cotizar | TRANSPORTISTA_NO_HABILITADO | TRANSPORTISTA_NO_HABILITADO | Cumple |
| B09 | Cotización de Chilexpress usada para pedir con Starken | COTIZACION_CAMBIO | COTIZACION_CAMBIO | Cumple |
| B10 | Contenido firmado que no es un objeto | COTIZACION_INVALIDA | COTIZACION_INVALIDA | Cumple |
| B11 | Firma hecha con otra sal (otro uso de la clave) | COTIZACION_INVALIDA | COTIZACION_INVALIDA | Cumple |

### C. Módulo logístico: cotización

| ID | Escenario | Esperado | Obtenido | Estado |
| --- | --- | --- | --- | --- |
| C01 | Cotizar con todos los transportistas (RM, compra de $ 20.000) | 200; 3 transportistas, opciones ordenadas por costo y recomendada = la más barata | 200; 7 opciones de CHILEXPRESS, LOGISTICA_CENTRAL, STARKEN; costos [3200, 3290, 3500, 3700, 3990, 4500, 5500] | Cumple |
| C02 | Envío gratis en RM al llegar al umbral ($ 30.000) y no antes ($ 29.999) | Con 30.000 hay opciones gratis; con 29.999 no | $30.000: 3 gratis (CHILEXPRESS_EXTENDIDO (ENVÍO GRATIS), STARKEN_ESTANDAR_DOMICILIO (ENVÍO GRATIS), ESTANDAR_DOMICILIO (ENVÍO GRATIS)); $29.999: 0 gratis | Cumple |
| C03 | Envío gratis no aplica fuera de la RM | Sin opciones gratis en Valparaíso con $ 50.000 | 0 gratis de 7 | Cumple |
| C04 | Cotización con transportista fijo (Chilexpress y Starken) | 200; todas las opciones del transportista pedido | Chilexpress→['CHILEXPRESS']; Starken→['STARKEN'] | Cumple |
| C05 | Recargo por peso: 3,5 kg frente a 1,5 kg en Chilexpress | Diferencia de $ 1.900 por servicio ($ 950 por kg extra) | diferencias {'CHILEXPRESS_EXTENDIDO': 1900, 'CHILEXPRESS_EXPRESS': 1900} | Cumple |
| C06 | Región inexistente (Atlantis) | 400 con el error en el campo region | 400; ['region'] | Cumple |
| C07 | Comuna ausente o vacía | 400 | ausente→400; vacía→400 | Cumple |
| C08 | Valores fuera de rango (items 0, total 0, peso 0,05, total negativo) | 400 en todos | [400, 400, 400, 400] | Cumple |
| C09 | Tipos inválidos (total texto, items decimal) | 400 | [400, 400] | Cumple |
| C10 | Alias de región (RM, Región Metropolitana, Araucanía, OHiggins) | 200 en todos | {'RM': 200, 'Región Metropolitana': 200, 'Araucanía': 200, 'OHiggins': 200} | Cumple |
| C11 | Transportista desconocido en el cuerpo (fedex) | Se comporta como "todos" (comportamiento registrado) | 200; 7 opciones · Nota: No avisa que el transportista pedido no existe | Cumple |
| C12 | Método GET en la cotización | 405 | 405 | Cumple |
| C13 | Tiempo de espera agotado con Chilexpress fijo | 504 TIEMPO_ESPERA_AGOTADO con cabecera Retry-After: 30 | 504; TIEMPO_ESPERA_AGOTADO; Retry-After=30 | Cumple |
| C14 | Tiempo de espera agotado en los tres transportistas | 504 TIEMPO_ESPERA_AGOTADO | 504; TIEMPO_ESPERA_AGOTADO | Cumple |
| C15 | Un transportista falla y los otros responden | 200 con las opciones de los transportistas restantes (degradación parcial) | 200; proveedores ['LOGISTICA_CENTRAL', 'STARKEN'] | Cumple |
| C16 | Todos los transportistas fallan (no por tiempo) | 502 PROVEEDOR_NO_DISPONIBLE | 502; PROVEEDOR_NO_DISPONIBLE | Cumple |
| C17 | Un transportista no cubre el destino y otros sí | 200 con los que cubren | 200; 5 opciones | Cumple |
| C18 | Ningún transportista cubre el destino | 400 SIN_COBERTURA | 400; SIN_COBERTURA | Cumple |
| C19 | Respuesta inválida de un transportista fijo (ValueError) | 502 RESPUESTA_OPERADOR_INVALIDA | 502; RESPUESTA_OPERADOR_INVALIDA | Cumple |
| C20 | Error inesperado interno | 500 ERROR_INTERNO sin filtrar detalles técnicos | 500; ERROR_INTERNO; filtra el detalle: False | Cumple |

### D. Seguimiento de envíos

| ID | Escenario | Esperado | Obtenido | Estado |
| --- | --- | --- | --- | --- |
| D01 | Seguimiento Chilexpress con código válido (CHILEX-ABC12345) | 200; proveedor CHILEXPRESS con historial de eventos y estado estándar | 200; CHILEXPRESS; 4 eventos; estado EN_DISTRIBUCION → En reparto | Cumple |
| D02 | Seguimiento Starken con código STK- | 200 con proveedor STARKEN (se registra el formato aceptado) | 200; STARKEN; 4 eventos | Cumple |
| D03 | Seguimiento del operador estándar (TRK-ABCD1234) por la ruta genérica | 200; LOGISTICA_CENTRAL con 3 eventos | 200; LOGISTICA_CENTRAL; 3 eventos; EN_REPARTO | Cumple |
| D04 | Chilexpress: código con formato inválido (ABC) | 400 FORMATO_TRACKING_INVALIDO | 400; FORMATO_TRACKING_INVALIDO | Cumple |
| D05 | Chilexpress: orden de transporte numérica de 8 dígitos | 200 | 200 | Cumple |
| D06 | Códigos que no existen (terminan en 0000 o contienen NOTFOUND) | 404 TRACKING_NO_ENCONTRADO en Chilexpress, Starken y estándar | 404 TRACKING_NO_ENCONTRADO; 404 TRACKING_NO_ENCONTRADO; 404 TRACKING_NO_ENCONTRADO | Cumple |
| D07 | Tiempo de espera simulado con la palabra TIMEOUT en el código | 504 TIEMPO_ESPERA_AGOTADO con Retry-After | 504; TIEMPO_ESPERA_AGOTADO; Retry-After=30 · Nota: Comportamiento de prueba presente en código de producción | Cumple |
| D08 | Ruta genérica con un código que no corresponde a ningún transportista (ABC12345) | 400 FORMATO_TRACKING_INVALIDO (error de entrada del usuario) | 400; FORMATO_TRACKING_INVALIDO | Cumple |
| D09 | Ruta genérica con código numérico de 8 dígitos (válido en Chilexpress por la ruta fija) | 200 o 400, no 500 | 200; None · Nota: En la ruta genérica, un código sin prefijo reconocido se atiende con Chilexpress (adaptador por defecto) | Cumple |
| D10 | Respuesta del operador inválida o incompleta (objeto vacío, sin eventos, nula, texto, lista) | 502 RESPUESTA_OPERADOR_INVALIDA en todos los casos | {}→502; sin_data→502; sin_eventos→502; None→502; texto→502; lista→502 | Cumple |
| D11 | Eventos con datos corruptos (fecha inválida, estado nulo, descripción nula) | 502, o 200 sin datos corruptos hacia el comprador | 502; [] · Nota: Se registra el comportamiento | Cumple |
| D12 | Tiempo de espera real del operador (requests.Timeout) | 504 TIEMPO_ESPERA_AGOTADO | 504; TIEMPO_ESPERA_AGOTADO | Cumple |
| D13 | Operador caído: conexión rechazada (requests.ConnectionError) | 502 PROVEEDOR_NO_DISPONIBLE | 500; ERROR_INTERNO · Nota: El adaptador solo traduce los tiempos de espera; una conexión rechazada termina como error interno | **No cumple** |
| D14 | Operador caído en Starken (conexión rechazada) | 502 PROVEEDOR_NO_DISPONIBLE | 500; ERROR_INTERNO | **No cumple** |
| D15 | Código con caracteres especiales y HTML (&lt;img src=x&gt;) | Respuesta JSON controlada, sin 500 | 200; tipo application/json; None | Cumple |
| D16 | Código extremadamente largo (5.000 caracteres) | Rechazado o controlado, sin 500 | 200; None · Nota: No hay límite de longitud del código | Cumple |
| D17 | Consulta de seguimiento sin sesión | Se registra si el endpoint es público | 200 · Nota: Endpoint público: cualquier persona con un código puede consultarlo | Cumple |
| D18 | Seguimiento: los datos del envío coinciden entre generar despacho y consultar | El código emitido por cada adaptador es aceptado al consultar | Chilexpress: CHILEX-83E935479 EMITIDO ok; Starken: STK-FA29AE3C9A EMITIDO ok; Estándar: TRK-B950D840 CREADO ok | Cumple |
| D19 | Estado del operador traducido al estado estándar de la tienda | Todos los estados de los eventos tienen traducción | RECEPCION_EN_SUCURSAL→En origen; CLASIFICACION_HUB_CENTRAL→En tránsito; EN_TRANSITO_REGIONAL→En tránsito; EN_DISTRIBUCION→En reparto | Cumple |
| D20 | Código con una barra codificada (%2F) que parte la ruta | 404 controlado sin 500 | 404; tipo text/html · Nota: La respuesta 404 es la página HTML de Django, no el formato JSON de la API | Cumple |

### E. Contratos y validaciones internas

| ID | Escenario | Esperado | Obtenido | Estado |
| --- | --- | --- | --- | --- |
| E01 | Tiempo de espera configurable: valores válidos (0,1; 10; 60) | Aceptados | [0.1, 10.0, 60.0] | Cumple |
| E02 | Tiempo de espera inválido (0, -1, 61, NaN, infinito, True, None, texto) | ValueError en todos | aceptados indebidamente: ninguno | Cumple |
| E03 | Los adaptadores validan el tiempo de espera al crearse | ValueError con 0 y con 61 | ['rechaza', 'rechaza', 'rechaza', 'rechaza', 'rechaza', 'rechaza'] | Cumple |
| E04 | Normalizador de Chilexpress ante respuestas inválidas (10 variantes) | ValueError en todas | aceptadas indebidamente: ninguna | Cumple |
| E05 | Normalizador de Chilexpress con varios servicios | Elige el de menor valor | {'operador': 'Chilexpress', 'monto': 3990, 'moneda': 'CLP', 'plazo_dias': None} | Cumple |
| E06 | Normalizador de Starken ante respuestas inválidas (7 variantes) | ValueError en todas | aceptadas indebidamente: ninguna | Cumple |
| E07 | Normalizador de Starken: plazo válido y plazo inválido | Plazo 2 y plazo nulo | 2 y None | Cumple |
| E08 | Normalizador de seguimiento ante respuestas inválidas | Rechaza (ValueError, TypeError o KeyError) o devuelve vacío | ['rechaza', 'rechaza', 'rechaza', 'rechaza', 'rechaza', 'rechaza', 'rechaza', 'rechaza'] | Cumple |
| E09 | Regla de envío gratis: límites exactos y valores inválidos | 30.000 cumple, 29.999,99 no; negativo, NaN y booleano lanzan ValueError | 30.000→True; 29.999,99→False; aceptados indebidamente: ninguno | Cumple |
| E10 | Tarifas por región de Chilexpress (RM, Valparaíso, Magallanes, región desconocida) | Tarifa base de cada región y tarifa por defecto en la desconocida | {'METROPOLITANA': 3290, 'VALPARAISO': 3990, 'MAGALLANES': 9490, 'MARTE': 5990} · Nota: Una región desconocida recibe una tarifa por defecto en lugar de rechazarse (el serializer la rechaza antes) | Cumple |
| E11 | Selección de adaptador según el código o el proveedor | CHILEX→Chilexpress, STK→Starken, TRK→Estándar, sin código→Chilexpress; un código desconocido no devuelve None | {'CHILEX-1': 'ChilexpressAdapter', 'STK-1': 'StarkenAdapter', 'TRK-12345678': 'StandardLogisticsAdapter', None: 'ChilexpressAdapter', 'ABC12345': 'ChilexpressAdapter', '12345678': 'ChilexpressAdapter'} · Nota: Un código sin prefijo reconocido se asigna a Chilexpress (adaptador por defecto) | Cumple |

### F. Datos de envío en el pedido

| ID | Escenario | Esperado | Obtenido | Estado |
| --- | --- | --- | --- | --- |
| F01 | Pedido con despacho Chilexpress y cotización vigente | 201; costo de envío 4.500 y total 64.500; se guardan método, dirección y cotización | 201; envío 4500.00, total 64500.00, método Chilexpress, cotización guardada 4500 | Cumple |
| F02 | Pedido con Starken usa la tarifa de Starken | 201; costo de envío 6.900 | 201; envío 6900.00 | Cumple |
| F03 | Pedido con despacho sin cotización | 400 y sin reservar stock ni crear pedido | 400; COTIZACION_INVALIDA; pedidos creados 0; reservas 0 | Cumple |
| F04 | Cotización vencida al pagar | 400 COTIZACION_VENCIDA o COTIZACION_INVALIDA, sin reservar stock | 400; COTIZACION_VENCIDA; reservas 0 | Cumple |
| F05 | Cotización manipulada | 400 COTIZACION_INVALIDA, sin reservar stock | 400; COTIZACION_INVALIDA | Cumple |
| F06 | El comprador intenta fijar el costo de envío (costo_envio=1) | 400 sin pedido ni reserva | 400; pedidos 0; reservas 0 | Cumple |
| F07 | La tienda cambia la tarifa entre cotizar y pagar | 400 COTIZACION_CAMBIO, sin reservar stock | 400; COTIZACION_CAMBIO | Cumple |
| F08 | Cotización de Chilexpress usada con método Starken | 400 COTIZACION_CAMBIO | 400; COTIZACION_CAMBIO | Cumple |
| F09 | Retiro en tienda sin dirección ni cotización | 201; envío 0 y datos del local guardados | 201; envío 0.00; retiro {'address': 'Local 123', 'schedule': '9 a 18'} | Cumple |
| F10 | Reintento con la misma clave: no duplica el pedido ni reserva dos veces | 200 con el mismo pedido y una sola reserva | 201→200; pedidos 1; reservas 1 | Cumple |
| F11 | Dirección de despacho sin comuna | 400 sin pedido | 400; pedidos 0 | Cumple |
| F12 | Comuna que no pertenece a la región indicada en la dirección | 400 sin pedido | 400; DESTINO_INVALIDO | Cumple |
