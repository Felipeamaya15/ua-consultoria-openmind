# Registro de pruebas de regresión

- Rama: Develop | Fecha: 2026-10-30

| area | Tests ejecutados | Resultado |
| --- | --- | --- |
| Autenticación | 27 | CUMPLE |
| Productos / catálogo | 64 | CUMPLE |
| Carrito | 20 | CUMPLE |
| Checkout / pedidos | 69 | CUMPLE |
| Promociones | 14 | CUMPLE |
| Pagos | 50 | CUMPLE |
| Enví­os / integraciones | 94 | CUMPLE |
| Correos de pedido | 65 | CUMPLE |
| Regresiones históricas | 42 | CUMPLE |

## Detalle de NO CUMPLE
Sin regresiones detectadas.

Se ejecutaron 445 pruebas automatizadas en 9 áreas (autenticación, productos, carrito, checkout/pedidos, promociones, pagos, envíos/integraciones, correos y regresiones históricas).

## Verificación manual (Postman / navegador)

-  base previa: QA final SCRUM-455/456
- Método: Postman local (http://localhost:8000) y navegador (http://localhost:5173), datos de prueba, sin cobros reales. Evidencia en `docs/pruebas-regresion-final/`.

| # | Área | Caso | Esperado | Resultado | Evidencia |
| --- | --- | --- | --- | --- | --- |
| M1 | Autenticación | Login con credenciales válidas | 200 con token | CUMPLE | M1.png |
| M2 | Autenticación | Login con clave errónea | Rechazo controlado, sin token | CUMPLE | M2.png |
| M3 | Carrito | Agregar producto, cambiar cantidad y consultar | Totales correctos | CUMPLE | M3.png |
| M4 | Checkout / pedidos | Pedido con 2 productos (como invitado) | Pedido creado con ambas líneas | CUMPLE | M4.png, M4b.png |
| M5 | Checkout / pedidos | Seguimiento del pedido (como invitado) | Estado correcto | CUMPLE | M5.png |
| M6 | Promociones | Código válido y código inexistente | Descuento aplicado / rechazo con mensaje | CUMPLE | M6a.png, M6b.png |
| M7 | Pagos | Métodos de pago en el checkout | Solo los habilitados | CUMPLE | M7.png, M7a.png |
| M8 | Envíos | Cotización con comuna válida | Tarifa y operadores de la tienda | CUMPLE | M8.png |
| M9 | Envíos | Cotización con comuna inválida | Error controlado, sin tarifa | CUMPLE | M9.png |

## Detalle de NO CUMPLE
Sin regresiones detectadas.

Resultado: CUMPLE en las 9 áreas automatizadas (445 pruebas) y en los 9 casos manuales.


## Hallazgos adicionales (fuera de los casos M1–M9)
- Atributos de producto: no se pueden eliminar; las opciones se pierden o vuelven a "Opción 1" al guardar.
- Catálogo: el stock exacto se muestra al público solo en productos con más de una variante.
- Linkify: sin botón de guardar propio; ademas exige credenciales para desactivarlo.
- Observación M7: Mercado Pago y PayPal no aparecen en el checkout aunque se activen; el backend los bloquea a propósito(quedaron sin completar por motivos que quedaron escritos)
