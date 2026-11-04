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
