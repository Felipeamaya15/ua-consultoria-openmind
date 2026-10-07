# SCRUM-137 — Asociación entre cuenta autenticada y tienda

La aplicación se entrega como una instancia independiente por emprendedor.
Esta relación existe únicamente dentro de la base de datos de esa instalación;
no hay un registro central, selector de tenants ni acceso entre despliegues.

## Relación y uso

`Tienda.id_usuario_propietario` referencia `settings.AUTH_USER_MODEL`
(`auth.User` en la configuración actual). Es obligatorio y usa `PROTECT`:
borrar al propietario no puede eliminar su tienda ni sus productos en cascada.
`core.Usuario` se conserva para las relaciones existentes de pedidos y carritos.

La asignación inicial continúa en Django Admin, con una cuenta superusuaria
de la propia instalación. Se elige una cuenta activa de autenticación; la
cuenta que configura la instalación no adquiere automáticamente la propiedad.
Admin permite agregar la primera tienda, pero deniega el alta por GET y POST
cuando ya existe una. El guardado utiliza el mismo servicio de configuración
y vuelve a comprobar la existencia, incluso si el formulario estaba abierto
antes de que otra configuración terminara.
El propietario no se puede sustituir desde el formulario de edición común.
El acceso a Django Admin sigue requiriendo `is_staff` y los permisos de Django.

Desde el procedimiento privado de configuración, con la cuenta del emprendedor
ya creada (esta función no es un endpoint público):

```python
from apps.core.models import Tienda
from apps.core.services import configurar_tienda

# Configuración idempotente: devuelve la existente o crea la primera.
tienda, creada = configurar_tienda(
    emprendedor,
    nombre="Mi tienda",
)

# Recuperación de la relación de propiedad:
tienda = Tienda.objects.del_propietario(emprendedor).get()
```

`del_propietario()` devuelve un queryset vacío para usuarios anónimos,
inactivos, no guardados o pertenecientes al modelo legacy. No concede acceso
por tener `is_staff`. También existe la relación inversa `tiendas_propias`;
para consultas de acceso debe utilizarse `del_propietario()`, que comprueba
la actividad de la cuenta.

La regla de configuración está centralizada en `apps/core/services.py`:
`configurar_tienda()` devuelve `(tienda, creada)`. Si existe una tienda, devuelve
esa misma fila y `False`, sin cambiar su nombre, descripción ni propietario,
aunque se proporcionen otros valores. En una instalación vacía, valida la cuenta
activa y guardada, crea la tienda y devuelve `True`.

El procedimiento usa una transacción y un bloqueo de la tabla `tienda` en
PostgreSQL, el motor del proyecto. Esto serializa configuraciones simultáneas
incluso cuando la tabla está vacía. Admin comprueba además la existencia antes
de permitir el alta y rechaza el guardado si el servicio devuelve una existente.
La edición de la tienda sigue disponible con los permisos existentes.

Se conserva la ForeignKey, sin nuevas restricciones de esquema ni migraciones
adicionales. La regla se aplica en el procedimiento de configuración y en Admin;
el código de configuración debe usar este servicio, no `objects.create()`,
`bulk_create()` ni inserciones SQL directas, que pueden saltarse esa regla.
Si existen varias tiendas de datos anteriores, el servicio falla con
`MultipleObjectsReturned`, sin borrar, fusionar ni elegir una arbitrariamente.

Tras configurar una única tienda, el propietario activo puede recuperarla con
`del_propietario(emprendedor).get()`. La ausencia de tienda o una cuenta sin
propiedad siguen produciendo `DoesNotExist`; la consulta no asigna propiedad.
No se implementa resolución de tenant durante solicitudes.

## Migración de datos existentes

`0004_tienda_propietario_auth` retira temporalmente la restricción antigua,
concilia los propietarios y crea la FK al usuario de autenticación, dentro
de una migración atómica. No borra usuarios, tiendas, productos ni contraseñas.

La correspondencia exige el mismo correo, sin distinguir mayúsculas, único
en ambas tablas. No se presupone que IDs iguales identifiquen a una misma
persona. Antes de aplicar la migración se debe revisar que esos correos
correspondan efectivamente a las cuentas propietarias. La migración no crea
cuentas ni copia credenciales para resolver una falta de correspondencia.

Un correo vacío, ausente o ambiguo detiene la migración sin aplicar cambios.
En ese caso deben conciliarse las identidades existentes antes de reintentar.
La reversión exige la misma correspondencia inequívoca; si se crearon nuevas
cuentas sin contraparte legacy o cambiaron sus correos, se detiene en lugar
de inventar propietarios.

Aplicación sobre una instalación cuya correspondencia ya se haya revisado:

```sh
docker compose exec backend python manage.py migrate core
```

## Verificación

- `python manage.py check`.
- `python manage.py makemigrations core --check --dry-run`.
- `python manage.py test apps.core.tests`.

Las pruebas comprueban cuenta autenticada, separación por propietario,
usuarios inactivos y anónimos, propietario obligatorio, protección de borrado,
asignación y edición en Admin, migración con IDs cruzados, conservación de
datos, correos ambiguos, reversión y base vacía.
También comprueban primera configuración, repetición idempotente, conservación
del propietario al reutilizar, rechazo de una segunda alta por Admin (incluido
un formulario previamente abierto), edición de la existente y configuraciones
simultáneas sobre PostgreSQL.

Limitación previa del proyecto: `authentication.UserProfile` carece de una
migración registrada. Al preparar una base PostgreSQL vacía, la sincronización
de esa tabla puede intentar referenciar `auth_user` antes de crearlo. Para la
verificación de esta tarea se inicializó `auth` primero, exclusivamente en una
base temporal de pruebas, sin cambiar las migraciones de autenticación.

Los resolvers de tenant, `TIENDA_ID_DEFAULT`, las APIs de catálogo y la
implementación de login/registro permanecen fuera del alcance de SCRUM-137.
