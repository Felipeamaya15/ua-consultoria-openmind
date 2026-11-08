# Biblioteca multimedia — primera versión

## Arquitectura y contrato previsto

Se reutilizan Django/PostgreSQL, el resolutor de tienda y `process_upload` para
JPG, PNG, WebP y HEIC/HEIF (máximo 2 MB, 25 millones de píxeles). No se modifican
el JSON de landing ni los bloques de Secciones. Cada recurso tiene UUID estable;
un archivo inmutable se comparte por hash dentro de la tienda. Las futuras
secciones podrán referenciar el UUID en vez de copiar archivos o URLs.

API privada, solo propietario activo de la instalación:

- `GET /api/landing/biblioteca/?pagina=1`: lista paginada (24 recursos), total.
- `POST /api/landing/biblioteca/`: crea con `titulo`, `descripcion`, `tipo`,
  `activo` y exactamente una fuente: `url` o `imagen` multipart.
- `PATCH /api/landing/biblioteca/<uuid>/`: edición parcial; cambiar tipo/fuente
  requiere una fuente nueva coherente. Campos desconocidos se rechazan.
- `DELETE /api/landing/biblioteca/<uuid>/`: baja lógica y desactivación.
- `GET /api/landing/biblioteca/<uuid>/imagen/`: imagen local autenticada; no
  se exponen archivos de biblioteca mediante `/media/`.

Tipos: `imagen`, `youtube`, `instagram`, `facebook`, `enlace`. Las URL son HTTPS,
sin credenciales, puertos alternativos, hosts locales ni HTML. No se descargan
URL desde Django: no hay scraping, SSRF ni llamadas oEmbed con credenciales.
Los proveedores admiten únicamente rutas de contenido, no perfiles ni URLs de
login. Los enlaces externos nunca se cargan en iframes arbitrarios.

La respuesta incluye identificador, metadatos, tipo, URL canónica, estado,
metadatos del archivo y fechas. No acepta tienda ni identificadores de archivos
ajenos del cliente. Se conserva una tienda por instalación; varias tiendas
producen 503 y no seleccionan información por parámetros del cliente.

Las imágenes se conservan al eliminar recursos para no invalidar futuras
referencias; el almacenamiento deduplica por tienda/hash. La limpieza física
requerirá una política explícita que compruebe referencias. Se limita a 100 MB
de archivos por tienda y 200 recursos vigentes; las imágenes archivadas cuentan
en la cuota. No se publican automáticamente recursos en las cuatro plantillas.

Las vistas previas de proveedores se cargan a petición y siempre conservan un
enlace externo. Disponibilidad, privacidad y permiso de incrustación los decide
el proveedor. No se solicita OAuth ni se garantiza que una publicación exista
o sea pública solo por registrar su URL.

Fuentes oficiales consultadas:
- [YouTube: reproductores insertados](https://developers.google.com/youtube/player_parameters).
- [YouTube: privacidad mejorada](https://support.google.com/youtube/answer/171780?hl=es).
- [Meta: publicaciones insertadas](https://developers.facebook.com/docs/plugins/embedded-posts/).
- [Instagram: contenido insertado](https://help.instagram.com/513918941996087).
La consulta automatizada a documentación Meta devolvió 429; las restricciones
reales de cada publicación siguen siendo externas y se mantiene el enlace.

## Viabilidad de videos propios de hasta 30 segundos

No se habilita su subida. Actualmente solo hay procesamiento de imágenes,
almacenamiento local y servicio de imágenes con extensiones acotadas. No hay
FFmpeg/ffprobe en el Dockerfile ni trabajos de transcodificación, miniaturas,
escaneo multimedia, cuotas de video o almacenamiento/CDN de streaming.

Para habilitarlo deben verificarse duración real en servidor (no confiar en
metadatos del navegador), tamaño y resolución máximos, codec permitido, límites
de CPU/memoria/tiempo del analizador, archivos malformados, rotación/metadata,
transcodificación asincrónica, cuotas y borrado con referencias, entrega con
Range y coste de almacenamiento/transferencia. Propuesta a validar: 30 s,
20 MB de entrada, salida MP4 H.264/AAC hasta 720p, sin autoplay. Esto no es un
límite de producción aprobado ni implementado.
