# Consulta histórica de ventas y de pedidos (SCRUM-374 y SCRUM-375)

Dos consultas de solo lectura para el propietario de la tienda.


## Zona horaria

Los días y los meses se calculan en hora de Chile (`America/Santiago`), igual que el dashboard.

## Parámetros comunes

| Parámetro | Valores | Por defecto |
|---|---|---|
| `fecha_desde`, `fecha_hasta` | `AAAA-MM-DD` | sin límite |
| `pagina` | entero mayor o igual a 1 | 1 |
| `tamano` | entero entre 1 y 100 | 20 |

## Historial de ventas

`GET /api/tienda/ventas/historial/`

Cuenta como venta un pedido con pago confirmado: `pagado`, `preparando`, `en_origen`, `enviado`,
`en_reparto` o `entregado`. Los pedidos pendientes y cancelados no cuentan.

Parámetro adicional: `agrupacion` (`dia` o `mes`, por defecto `mes`). Agrupar por día exige
`fecha_desde` y `fecha_hasta`, con un máximo de 366 días.


- `data.resumen`: `cantidad_ventas`, `total_vendido` y `ticket_promedio` de todo el rango.
- `data.agrupacion`: la agrupación aplicada.
- `data.serie`: una fila por período con `periodo` (`AAAA-MM-DD` o `AAAA-MM`), `cantidad_ventas` y
  `total_vendido`.
- `data.ventas`: listado de ventas, la más reciente primero, paginado.
- `paginacion`: `pagina`, `tamano`, `total` y `total_paginas`.

## Historial de pedidos

`GET /api/tienda/pedidos/historial/`

Incluye pedidos de cualquier estado. Parámetros adicionales: `estado` (uno de los estados del
pedido), `q` (búsqueda por número de orden o nombre, hasta 100 caracteres) y `orden`
(`fecha_desc`, `fecha_asc`, `monto_desc` o `monto_asc`; por defecto `fecha_desc`).
