# SCRUM-138 — Identificación de la tienda en las solicitudes

Cada despliegue utiliza su propia base de datos y una única tienda configurada
por el procedimiento de SCRUM-137. No se seleccionan tiendas entre instalaciones.

## Resolución central

`apps.core.infrastructure.tenant.resolver_tienda(request)` consulta la única
`Tienda` de PostgreSQL. No crea tiendas, no elige la primera y no utiliza una
variable de entorno como identificador. Cero tiendas produce HTTP 503 con
`TIENDA_NO_CONFIGURADA`; varias producen HTTP 503 con
`CONFIGURACION_TIENDA_INVALIDA` en las APIs. La configuración inicial de
`TiendaAdmin` sigue disponible sin tienda.

Las consultas públicas admiten visitantes anónimos y compradores autenticados.
Los usos privados llaman `resolver_tienda(request, exigir_propietario=True)`:
la cuenta debe estar autenticada y debe pasar la consulta `del_propietario()`
de SCRUM-137. Ser staff o superusuario no sustituye la propiedad para administrar
productos o variantes.

`resolver_tienda_id(request)` devuelve exactamente `str(tienda.pk)` para MongoDB.
El módulo alternativo `catalog/application/infrastructure/tenant.py` reexporta
estas funciones; no contiene otra implementación.

Los valores `tienda_id` e `id_tienda` enviados en query/formulario/JSON y las
cabeceras `X-Tienda-ID` y `Tienda-ID` se contrastan con la tienda ya resuelta.
Si difieren, se rechaza la solicitud. Ningún campo enviado por el cliente sirve
para elegir la tienda; los parámetros desconocidos tampoco alteran la resolución.

## Caminos existentes protegidos

- Las tres consultas públicas del catálogo usan el ID resuelto para listar,
  consultar por slug y consultar atributos.
- Productos y plantillas de atributos MongoDB requieren el ID de tienda como
  primer argumento de sus métodos. Las operaciones por `_id`, SKU y categoría
  incluyen `tienda_id`; las creaciones lo asignan desde ese argumento confiable
  y las actualizaciones no pueden cambiarlo. El llamador backend debe obtenerlo
  del resolver, nunca directamente del cuerpo de una solicitud.
- Las lecturas SQL de variantes filtran también el producto por tienda. Sus
  altas y modificaciones exigen propietario activo usando autenticación DRF.
- La compra conserva su identidad de comprador y flujo existentes; únicamente
  comprueba la pertenencia de las variantes durante la validación y nuevamente
  al bloquear/descontar dentro de la transacción.
- Productos y variantes en Django Admin filtran registros y opciones de claves
  foráneas por la tienda del propietario. No se modifica la configuración inicial
  ni el modelo de propiedad de SCRUM-137.

`TiendaAdmin` conserva los permisos de aprovisionamiento de SCRUM-137: el
superusuario de la instalación puede gestionar el registro Tienda sin pasar
por el nuevo resolver. Esta excepción no concede acceso a productos/variantes
de una tienda ajena. No es un panel de administración entre instalaciones.

Las escrituras de variantes usan la autenticación DRF existente (sesión/Basic).
Se verificó la sesión Django del propietario. La configuración actual no habilita
`TokenAuthentication`; el flujo de tokens del módulo de login no se cambia aquí.

Las validaciones de stock de SCRUM-236 y el descuento atómico con `$elemMatch`
se conservan. El aislamiento se aplica en estos caminos, no mediante un
middleware global: las consultas ORM/PyMongo directas y los futuros servicios
deben utilizar explícitamente el contexto de tienda.

## Datos y despliegue

PostgreSQL conserva una PK entera; MongoDB almacena su representación decimal
como texto, por ejemplo `37` y `"37"`. `_id` identifica el documento MongoDB y
es distinto de `tienda_id`. No se supone que la tienda tiene PK 1.

No se necesita otra migración de esquema. La instancia debe tener aplicadas
las migraciones de SCRUM-137 y haber ejecutado su configuración inicial.
No se convierten automáticamente documentos con identificadores antiguos como
`empresa_123`: cualquier conversión necesita asociación comprobada y respaldo.
Durante el diagnóstico local había cero tiendas y ambas colecciones vacías;
no se modificaron esos datos.

## Verificación

Pruebas: `apps.core.test_tenant`, `apps.core.test_tenant_sql`,
`apps.catalog.test_tenant`, `apps.core.test_stock`, `apps.catalog.test_stock`
y regresión de `apps.core.tests` (SCRUM-137).

Se ejecutan contra PostgreSQL y colecciones MongoDB temporales. Por la ausencia
previa de una migración de `authentication.UserProfile`, se inicializa `auth`
primero exclusivamente en la base temporal PostgreSQL antes de preparar el
resto del esquema de prueba. No se aplica este procedimiento sobre la base de
la instancia. También se ejecutan `manage.py check`,
`manage.py makemigrations --check --dry-run` y `git diff --check`.
