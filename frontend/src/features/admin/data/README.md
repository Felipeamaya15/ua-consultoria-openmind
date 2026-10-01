# Listados territoriales para el editor de landing

Los JSON son datos oficiales de referencia incluidos en el frontend: no dependen
de un servicio externo durante la carga del formulario y no son contenido demo.

- `chileTerritory.json`: 16 regiones, 56 provincias y 346 comunas. Extraído de
  [SUBDERE, Códigos Únicos Territoriales](https://www.subdere.gov.cl/documentacion/c%C3%B3digos-%C3%BAnicos-territoriales-actualizados-al-06-de-septiembre-2018),
  archivo [CUT_2018_v04.xls](https://www.subdere.gov.cl/sites/default/files/documentos/CUT_2018_v04.xls),
  que incluye la región de Ñuble.
- `chileLocalities.json`: ciudades y pueblos por región y comuna, extraídos de los
  campos `URBANO` y `NOM_COMUNA` de los datos abiertos del Instituto Nacional de
  Estadísticas, Censo 2017:
  [ciudades](https://www.ine.gob.cl/docs/default-source/geodatos-abiertos/cartografia/censo-2017/ciudades-pueblos-aldeas-y-caser%C3%ADos/shp/ciudades_2017.zip)
  y [pueblos](https://www.ine.gob.cl/docs/default-source/geodatos-abiertos/cartografia/censo-2017/ciudades-pueblos-aldeas-y-caser%C3%ADos/shp/pueblos_2017.zip).
  Los nombres de comuna se asocian al CUT vigente del listado anterior, incluyendo
  las comunas que pasaron a Ñuble. Se conserva una opción de localidad manual
  para asentamientos rurales, nombres posteriores y localidades ausentes.

Consulta de las fuentes: 30 de septiembre de 2026. La provincia funciona como
filtro; se reconstruye a partir de la comuna y no añade un campo al backend.
Región, comuna, ciudad/localidad y dirección se guardan en los campos existentes.
