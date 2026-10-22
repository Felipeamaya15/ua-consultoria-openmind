El contrato existente `GET/PUT /api/landing/configuracion/` se amplía de manera
aditiva. No hay cambios de modelo ni migraciones.

- `contenido.bloques` es opcional: su ausencia conserva los ejemplos anteriores;
  `[]` representa una lista administrada vacía. Hasta 20 bloques ordenados.
- Cada bloque: `id` UUID estable, `tipo` (`historia`, `imagen_texto`, `texto`,
  `galeria`, `cita`), `visible`, `titulo` (255), `subtitulo` (500), `texto` (10000),
  `imagenes`: lista de `{id: UUID, src, alt: texto hasta 250}`.
- Historia e imagen/texto admiten una imagen; galería hasta ocho; texto/cita cero.
  JPG/PNG/WebP válidos, máximo 2 MB por archivo, 10 MB de imágenes por guardado.
  Un `src` nuevo puede ser un data URI. El servidor verifica los bytes y guarda
  un archivo bajo `/media/landing/blocks/{tienda}/{bloque}/...`; el JSON conserva
  la URL. No elimina originales. También admite URL HTTP/HTTPS.
- Los clientes anteriores pueden omitir las nuevas claves sin borrarlas. Los
  campos previos mantienen sus contratos y validación contra el catálogo propio.

`PATCH /api/landing/apariencia/` publica únicamente la apariencia de bloques:

```json
{
  "plantilla": "editorial",
  "bloques": {
    "7829d4a2-7d80-4e71-b8b2-66b415c48a7b": {
      "base": {"titleSize": 48, "layout": "right", "padding": 32},
      "mobile": {"titleSize": 28}
    }
  }
}
```

Responde `{exito:true,data:{tienda:...},mensaje:...}`. Guarda en
`contenido.apariencia_bloques[plantilla]`. `GET configuracion` devuelve esos
estilos también a los visitantes. La edición de contenido no puede reemplazar
esta clave; PATCH no modifica textos, imágenes ni otra plantilla. `{bloques:{}}`
restablece los estilos de esa plantilla. Variantes independientes `base`,
`desktop`, `tablet`, `mobile`; las claves/valores aceptados están definidos en
`block_appearance.py` y coinciden con `blockAppearance.ts` del frontend.

Ambas escrituras resuelven y autorizan al propietario de la tienda de la
instalación; no aceptan un identificador para elegir otra tienda. Respuestas
400 para contenido/estilos inválidos, 401/403 sin autorización, 503 si la
instalación es ambigua. La tienda debe tener contenido guardado antes de PATCH.
Las actualizaciones bloquean la fila dentro de una transacción para conservar
contenido y apariencia cuando se editan desde las dos interfaces.

Pruebas: `python scripts/test_landing_blocks.py` utiliza SQLite en memoria y
archivos temporales, sin ejecutar migraciones de producción. La simulación
Postman local en `frontend/tests/editor-redesign.sim.yaml` permite ejecutar
el frontend real con datos ficticios mediante `landing-blocks-browser.cjs`.
