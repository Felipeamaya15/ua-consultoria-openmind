# SCRUM-510 Configuración de métodos de pago

La mejora se limita al frontend del panel administrativo, según la aclaración de la product owner. Facilita completar los formularios de pago y los datos bancarios sin cambiar las integraciones existentes.

## Cambios

- Transbank y PayPal muestran ayudas permanentes: finalidad de cada credencial, dónde obtenerla, diferencia entre pruebas y producción y cómo conservar una clave ya guardada.
- Transferencia bancaria se organiza en cuenta de destino, datos del titular e instrucciones opcionales. Usa selectores de banco y tipo de cuenta, etiquetas, ejemplos y errores junto a cada campo.
- El catálogo de bancos se mantiene en `frontend/src/features/admin/services/transferValidation.ts`. Incluye alias para reconocer nombres anteriores; Banco Security, disuelto según la CMF, no se ofrece como nueva selección. Un nombre histórico desconocido sigue siendo visible y se conserva al guardar otros medios.
- CuentaRUT se ofrece solo para BancoEstado y exige que el número corresponda al RUT sin puntos ni dígito verificador. Cambiar a otro banco limpia esta selección incompatible. Los tipos generales son corriente, vista y ahorro; no se inventan restricciones comerciales por banco. El usuario debe escoger el tipo indicado en su cartola.
- Se validan campos obligatorios, RUT con módulo 11, correo, nombre o razón social, número de cuenta numérico de hasta 24 dígitos y longitud de instrucciones. Se conservan los ceros iniciales.
- El guardado individual y el general bloquean información inválida antes de enviarla. Transbank y PayPal tampoco admiten pares de credenciales parciales desde el formulario.
- Las transferencias históricas sin editar se conservan al guardar otros medios. También pueden desactivarse sin reemplazar sus datos. Para editar sus datos o reactivarlas, se deben completar las selecciones y formatos actuales.
- Se mantiene el JSON y los endpoints existentes; no hay cambios de backend, modelos, migraciones, checkout ni pasarelas. Las validaciones nuevas son del formulario del panel, no una ampliación de la validación de la API.

## Evidencia

Las capturas corresponden a la pantalla real `/emprendedor/pagos`, con datos ficticios. Las tarjetas se capturan completas ocultando únicamente la cabecera sticky durante la captura para que no tape campos.

| Evidencia | Archivo |
| --- | --- |
| Transbank en computador | [01-transbank-desktop.png](SCRUM-510-evidencia/01-transbank-desktop.png) |
| PayPal en computador | [02-paypal-desktop.png](SCRUM-510-evidencia/02-paypal-desktop.png) |
| Validaciones por campo | [03-validaciones-obligatorios.png](SCRUM-510-evidencia/03-validaciones-obligatorios.png) |
| Transferencia guardada | [04-transferencia-guardada.png](SCRUM-510-evidencia/04-transferencia-guardada.png) |
| Datos editados y recuperados | [05-transferencia-editada.png](SCRUM-510-evidencia/05-transferencia-editada.png) |
| Transferencia en móvil | [06-transferencia-movil.png](SCRUM-510-evidencia/06-transferencia-movil.png) |
| Transbank en móvil | [07-transbank-movil.png](SCRUM-510-evidencia/07-transbank-movil.png) |
| PayPal en móvil | [08-paypal-movil.png](SCRUM-510-evidencia/08-paypal-movil.png) |
| Resultados automatizados | [resultados.json](SCRUM-510-evidencia/resultados.json) |

## Validación ejecutada

- `npm run build`: TypeScript y compilación de producción correctos. Vite informa la advertencia de tamaño del bundle principal.
- `node --test tests/transfer-validation.cjs tests/linkify-validation.cjs tests/manual-transfer-rejection.cjs tests/sprint7-payment-security.cjs tests/order-summary-and-errors.cjs`: 8 pruebas aprobadas.
- `node tests/payment-configuration-ui.cjs`: 9 comprobaciones aprobadas en Chrome headless, sin errores de JavaScript.
- UI comprobada a 1440, 390 y 320 px, sin desbordamiento horizontal. Las capturas móviles usan 390 px.

La prueba UI usa las vistas de Django existentes y una base SQLite en memoria. Comprueba guardado, edición, lectura tras recargar, conservación de ceros iniciales, credenciales guardadas y datos históricos. Solo se simula la identidad visual de la tienda, que normalmente depende de MongoDB, y un rechazo de guardado para comprobar el mensaje de error. No se ejecutan cobros reales ni se verifica la existencia o titularidad bancaria.

## Reproducción

Requisitos: dependencias habituales del backend y frontend, Chrome y Playwright para las pruebas UI. El servidor auxiliar está en `frontend/tests`: no forma parte del backend desplegado y no usa las bases comerciales. Reiniciarlo elimina toda su información temporal.

Desde la raíz, iniciar la API efímera en una terminal:

```powershell
.\.venv\Scripts\python.exe frontend/tests/payment-configuration-api.py
```

En otra terminal, iniciar Vite:

```powershell
cd frontend
$env:VITE_API_URL = 'http://127.0.0.1:8006'
npm run dev -- --host 127.0.0.1 --port 5176 --strictPort
```

En una tercera terminal, con Playwright instalado y resoluble por Node:

```powershell
cd frontend
node tests/payment-configuration-ui.cjs
```

Playwright puede instalarse en un directorio temporal de QA y exponerse con `NODE_PATH`, sin modificar las dependencias del producto. Los puertos pueden configurarse con `PAYMENTS_QA_PORT` para la API y `PAYMENTS_API_URL` / `PAYMENTS_UI_URL` para la prueba. `VITE_API_URL` debe coincidir con la API temporal. Detener ambos servidores al terminar.

## Fuentes del contenido de ayuda y catálogo

- [CMF, bancos fiscalizados](https://www.cmfchile.cl/portal/principal/623/w4-propertyvalue-29280.html).
- [BancoEstado, cómo identificar CuentaRUT para transferencias](https://investor.bancoestado.cl/content/bancoestado-public/cl/es/home/home/centro-de-ayuda/productos/cuentas/cuentarut/-como-se-identifica-mi-cuentarut-para-transferir-desde-otros-ban.html).
- [Transbank Developers, cómo empezar](https://transbankdevelopers.com/documentacion/como_empezar).
- [PayPal Developer, inicio y credenciales REST](https://developer.paypal.com/api/get-started/).
