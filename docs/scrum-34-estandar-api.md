# Scrum 34 — formato estandar JSON para respuestas de la API



## 1. Respuestas exitosas 

### Objeto único 

```json
{
  "exito": true,
  "mensaje": "Usuario obtenido correctamente",
  "data": {
    "id": 12,
    "username": "jsanchez",
    "email": "jsanchez@correo.com"
  }
}
```

### Listado paginado

```json
{
  "exito": true,
  "mensaje": "Listado obtenido correctamente",
  "data": [
    { "id": 12, "username": "jsanchez" },
    { "id": 13, "username": "mpareja" }
  ],
  "paginacion": {
    "pagina_actual": 1,
    "total_paginas": 5,
    "total_elementos": 48,
    "elementos_por_pagina": 10
  }
}
```

## 2. Respuestas de error

```json
{
  "exito": false,
  "mensaje": "Los datos enviados contienen errores de validación",
  "error": {
    "codigo": "ERROR_VALIDACION",
    "detalles": {
      "email": ["Este campo es requerido."]
    }
  }
}
```

Error sin detalle (ej. 404):

```json
{
  "exito": false,
  "mensaje": "El recurso solicitado no fue encontrado",
  "error": {
    "codigo": "RECURSO_NO_ENCONTRADO",
    "detalles": null
  }
}
```

