# SCRUM-44 — Identificación interna de la tienda

Estado: diseño definido para el alcance inicial.

## Objetivo

Definir el identificador que asocia los datos de la aplicación con
la tienda de cada instalación, sin administración ni selección
entre múltiples tiendas.

## Contexto

Cada emprendedor recibe una instalación independiente, configurada
con una sola tienda y almacenamiento separado.

El identificador permite relacionar los datos dentro de esa instalación.
No identifica globalmente a todos los emprendedores del proyecto.

## Identificador elegido

Se utilizará Tienda.id_tienda, definido actualmente como
BigAutoField y clave primaria en PostgreSQL.

Sus características son:

- Es generado por PostgreSQL al crear la tienda.
- Es obligatorio y único dentro de la tabla tienda de esa instalación.
- Permanece estable durante la vida de la tienda.
- No depende del nombre, dominio, hosting ni propietario.
- No debe modificarse al cambiar esos datos.
- No debe suponerse que siempre tendrá el valor 1.

Dos instalaciones independientes pueden tener el mismo id_tienda.
Esto es válido porque sus bases de datos están separadas.

## Representación en PostgreSQL

La tabla tienda conserva el identificador principal.

Las entidades relacionadas directamente con una tienda deben utilizar
una clave foránea a Tienda, como ya ocurre con Producto.id_tienda.

El identificador del propietario es distinto del identificador de
la tienda y no debe utilizarse como sustituto.

## Representación en MongoDB

Los documentos asociados a la tienda utilizarán el campo tienda_id
como cadena con la representación decimal de Tienda.id_tienda.

Ejemplo:

- PostgreSQL: Tienda.id_tienda = 7
- MongoDB: "tienda_id": "7"

La conversión será realizada por el backend mediante str(tienda.pk).
No se utilizarán espacios, prefijos ni ceros adicionales.

Esta decisión conserva el tipo texto que reciben actualmente los
métodos de consulta por tienda de los repositorios MongoDB.

El campo _id de MongoDB continúa identificando cada documento.
No reemplaza a tienda_id.

PostgreSQL es la fuente de verdad para la existencia de la tienda.
MongoDB no tiene una clave foránea automática hacia PostgreSQL;
la aplicación debe validar esta asociación.

## Obtención de la tienda de la instalación

El backend resolverá la tienda a partir de la tabla Tienda:

1. Si existe exactamente una tienda, utilizará su id_tienda.
2. Si no existe ninguna, informará que la instalación está pendiente
   de configuración y bloqueará las operaciones que requieren tienda.
3. Si existe más de una, informará una configuración inválida y
   bloqueará esas operaciones hasta corregirla.

No se seleccionará silenciosamente la primera tienda encontrada.
No se creará una tienda automáticamente durante una solicitud.

Esta resolución será centralizada para que los módulos apliquen
la misma regla.

## Asociación y consultas

Al crear datos, el backend asignará el identificador obtenido de
la instalación. El cliente no podrá elegir otra tienda mediante
el cuerpo, los parámetros o las cabeceras de una solicitud.

Si una solicitud incluye un identificador de tienda diferente al
resuelto por el backend, deberá rechazarse.

Las consultas y modificaciones de documentos MongoDB asociados
a tienda incluirán tienda_id. Cuando se acceda a un documento
concreto, se comprobarán tanto su identificador como el de tienda.

Conocer el identificador de la tienda no concede permisos.
La autenticación y la autorización del propietario se comprobarán
por separado en las operaciones privadas.

## Configuración inicial y conservación

La configuración inicial deberá:

1. Crear la tienda si todavía no existe.
2. Reutilizar la tienda existente si el proceso se ejecuta nuevamente.
3. Detenerse si encuentra varias tiendas.
4. Obtener el identificador generado por PostgreSQL.
5. Utilizar su representación decimal en los documentos MongoDB.

Los respaldos y restauraciones deben conservar los identificadores
y la correspondencia entre PostgreSQL y MongoDB.

Cambiar de hosting no debe generar una identidad nueva para la
misma tienda.

Una instalación para otro emprendedor se inicializa con datos propios;
no se copian los datos comerciales de una tienda anterior.

## Compatibilidad con los datos existentes

El modelo PostgreSQL ya dispone de id_tienda; este diseño no requiere
sustituirlo por UUID ni por el nombre o dominio de la tienda.

La documentación MongoDB existente contiene ejemplos como empresa_123.
Esos valores no representan el formato canónico definido aquí.

Antes de implementar, se deberán revisar los documentos existentes.
Si contienen identificadores anteriores, se preparará una conversión
con correspondencia verificada y respaldo.

No se reasignarán documentos de forma indiscriminada ni se eliminarán
registros cuya asociación no pueda comprobarse.

Los repositorios actuales incluyen consultas por tienda, pero también
operaciones por documento o SKU sin filtro de tienda. La implementación
deberá adaptar esas operaciones al contrato definido en este diseño.

## Criterios de aceptación

- Se utiliza Tienda.id_tienda como identificador interno.
- MongoDB utiliza el mismo valor convertido a cadena decimal.
- El identificador permanece estable al cambiar nombre, dominio,
  hosting o propietario.
- El backend obtiene la única tienda de la instalación.
- Cero tiendas o varias tiendas producen un error de configuración.
- No existe un selector de tiendas ni se confía en una selección
  enviada por el cliente.
- Los datos asociados a tienda se consultan y modifican comprobando
  su pertenencia.
- Se distingue identificación de autorización.
- Se contempla la conservación y conciliación de datos existentes.

## Alcance

Esta tarea define el diseño. La resolución de la tienda en solicitudes,
los cambios en repositorios y cualquier conversión de datos se
implementarán en las tareas de backend correspondientes.

Las decisiones se basan en el modelo actual y en una instalación
independiente por emprendedor. Los cambios futuros de requisitos
se incorporarán mediante revisiones del documento.