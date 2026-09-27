# SCRUM-43 — Relación de propiedad entre emprendedor y tienda

Estado: diseño definido para el alcance inicial de SCRUM-43.

## Objetivo

Definir cómo se representa que una tienda pertenece al emprendedor
responsable de ella, considerando que cada emprendedor recibe una
instalación independiente de la aplicación.

## Contexto de despliegue

Cada emprendedor elige las tecnologías y el hosting a partir de las
alternativas recomendadas por el equipo.

El equipo prepara y despliega su instalación. La universidad o
municipalidad recibe el proyecto y la documentación necesaria para
repetir el procedimiento con nuevos emprendedores.

La separación entre emprendedores se realiza mediante instalaciones
y almacenamiento independientes. No se plantea una plataforma central
que aloje las tiendas de todos los emprendedores.

## Relación de propiedad

Para el alcance inicial, cada instalación se configura con una tienda
y una cuenta de emprendedor propietaria.

La tienda debe tener exactamente un propietario obligatorio.
Una cuenta de cliente no adquiere propiedad por registrarse o comprar.

Relación prevista por instalación:

Cuenta del emprendedor (1) ─── es propietaria de ─── (1) Tienda

Esta relación describe la configuración de entrega de cada instalación.
La aplicación puede contener otras cuentas, como las de los clientes.

## Modelo actual

En backend/apps/core/models.py:

- Usuario representa una cuenta del modelo de negocio.
- Tienda contiene id_tienda e id_usuario_propietario.
- id_usuario_propietario es una clave foránea obligatoria a Usuario.
- La clave foránea actual permite varias tiendas por usuario.
- La eliminación del propietario usa CASCADE.

Por tanto, el modelo actual representa la propiedad, pero no impone
por sí mismo una única tienda por instalación.

Una relación OneToOne limitaría las tiendas por propietario, pero tampoco
impediría crear varias tiendas con propietarios diferentes dentro de
la misma instalación.

## Identidad del propietario

Existe una diferencia que debe resolverse antes de implementar:

- Tienda apunta a core.Usuario.
- El módulo de autenticación utiliza get_user_model() de Django.
- Actualmente no hay una configuración AUTH_USER_MODEL que unifique
  ambas identidades.

No se debe asumir que dos usuarios son la misma persona porque sus
identificadores numéricos coincidan.

Se propone utilizar la cuenta autenticada de Django como identidad
del propietario, mediante una relación a settings.AUTH_USER_MODEL.
La implementación debe revisar y conciliar los datos y referencias
existentes antes de modificar esta relación.

La relación objetivo será una clave foránea obligatoria desde
Tienda.id_usuario_propietario hacia settings.AUTH_USER_MODEL,
con protección PROTECT frente a eliminaciones.

La configuración inicial deberá garantizar una sola tienda por
instalación y reutilizarla si el procedimiento se ejecuta nuevamente.

## Reglas de negocio propuestas

1. La tienda se crea durante la configuración inicial del despliegue.
2. La configuración inicial asigna una cuenta existente como propietaria.
3. No se habilita la creación pública de tiendas en esta entrega.
4. El procedimiento de configuración comprueba si ya existe una tienda
   y evita duplicarla al ejecutarse nuevamente.
5. El propietario puede administrar su tienda.
6. Los clientes pueden utilizar las funciones de compra, pero no
   administrar la tienda.
7. El propietario no puede cambiarse mediante una edición común
   de los datos de la tienda.
8. Ser personal administrador de Django no convierte automáticamente
   a una cuenta en propietaria.
9. Se propone proteger la relación frente a la eliminación del
   propietario con PROTECT, evitando borrar la tienda en cascada.
10. La desactivación de una cuenta debe revocar su acceso y conservar
    los datos de la tienda.

La transferencia de propiedad y los accesos de soporte institucional
requieren un procedimiento específico fuera del alcance de esta tarea.

## Separación de datos

Cada despliegue debe utilizar su propia configuración y credenciales
de PostgreSQL y MongoDB, con almacenamiento separado y acceso limitado
a esa instalación.

Esto no exige contratar un servidor físico distinto por emprendedor,
pero sí evitar compartir accidentalmente bases de datos, volúmenes
o credenciales entre instalaciones.

PostgreSQL conserva la relación de propiedad. Los documentos de MongoDB
se relacionan con la tienda mediante su identificador.

La definición del identificador interno corresponde a su tarea
específica y debe ser consistente entre ambos almacenamientos.

## Procedimiento que deberá documentarse para cada entrega

1. Preparar el hosting y los servicios elegidos por el emprendedor.
2. Configurar las variables y credenciales propias de la instalación.
3. Ejecutar las migraciones y preparar MongoDB.
4. Crear la cuenta del emprendedor de forma segura.
5. Crear la tienda y asociarla con esa cuenta.
6. Verificar que el propietario puede administrar la tienda.
7. Verificar que una cuenta cliente no puede administrarla.
8. Entregar instrucciones de acceso, operación, respaldo y recuperación,
   sin incluir contraseñas reales en el repositorio.

Estos pasos son requisitos del procedimiento futuro; este documento
no afirma que exista todavía un comando automatizado que los ejecute.

## Criterios de aceptación del diseño

- Se define una instalación independiente por emprendedor.
- Se establece una tienda y una cuenta propietaria por entrega inicial.
- Se identifica el campo que representa la propiedad en el modelo actual.
- Se documenta la diferencia entre el usuario de negocio y el autenticado.
- Se definen las reglas de asignación, acceso y conservación de datos.
- Se describen los pasos que deberán repetirse para nuevos emprendedores.

## Alcance

Este documento establece el diseño para el alcance inicial con la
información disponible. Los cambios de requisitos se incorporarán
mediante nuevas revisiones. La implementación de la asociación
corresponde a una tarea independiente.