# Scrum 36 — Modelo de datos documental (MongoDB) para catálogo de productos

## Patrones de diseño aplicados

- **Attribute Pattern**: los atributos variables (talla, color, voltaje...) se guardan como arreglo `{clave, etiqueta, valor}` en lugar de campos fijos, para no depender del rubro.
- **Subdocument Pattern**: las variantes (SKUs) viven embebidas dentro del producto padre, porque siempre se consultan junto a él y la cantidad no crece sin límite.


## Colección ejemplo `productos`

```json
{
  "_id": "64d2f8e1a1b2c3d4e5f6a7b8",
  "tienda_id": "empresa_123",
  "nombre": "Polera Manga Corta",
  "slug": "polera-manga-corta",
  "descripcion": "Polera básica para uso diario.",
  "categoria": "Vestuario",
  "imagenes": [
    "https://midominio.com/imagenes/polera1.jpg"
  ],
  "atributos_generales": [
    { "clave": "marca", "etiqueta": "Marca", "valor": "UrbanStyle" },
    { "clave": "material", "etiqueta": "Material", "valor": "100% Algodón" },
    { "clave": "corte", "etiqueta": "Corte / Calce", "valor": "Regular Fit" }
  ],
  "variantes": [
    {
      "sku": "POL-NEGRA-M",
      "stock": 10,
      "precio": 19990,
      "precio_oferta": 14990,
      "atributos_variante": [
        { "clave": "talla", "etiqueta": "Talla", "valor": "M" },
        { "clave": "color", "etiqueta": "Color", "valor": "Negro" }
      ]
    }
  ],
  "seo": {
    "meta_titulo": "Polera Manga Corta | UrbanStyle",
    "meta_descripcion": "Compra nuestra polera manga corta básica 100% algodón."
  },
  "activo": true,
  "fecha_creacion": "2026-09-15T13:00:00Z"
}
```

## Colección `plantillas_atributos`

Define, por tienda y rubro, qué atributos debe pedir el panel de administración al crear un producto.

```json
{
  "_id": "...",
  "tienda_id": "empresa_123",
  "categoria": "Vestuario",
  "atributos": [
    { "clave": "talla", "etiqueta": "Talla", "tipo": "select", "opciones": ["S","M","L","XL"], "nivel_variante": true },
    { "clave": "color", "etiqueta": "Color", "tipo": "select", "opciones": ["Rojo","Negro","Azul"], "nivel_variante": true },
    { "clave": "material", "etiqueta": "Material", "tipo": "texto", "nivel_variante": false }
  ]
}
```

`nivel_variante: true` → el atributo genera combinaciones de (talla/color, etc).
`nivel_variante: false` → el atributo es una caracteristica descriptiva del producto padre (marca, material).
