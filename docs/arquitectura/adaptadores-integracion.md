# SCRUM-32 - Adaptadores de integracion

## Objetivo

Definir los adaptadores que separan la logica de negocio de los servicios externos
o capas tecnicas del sistema. Esta decision permite cambiar APIs, bases de datos o
proveedores sin reescribir los casos de uso principales.

## Criterios generales

- Los casos de uso no deben depender directamente de `fetch`, `pymongo`, ORM o SDKs.
- Cada adaptador debe exponer metodos con nombres del dominio.
- Los errores tecnicos deben transformarse a errores controlados por la aplicacion.
- Las credenciales y URLs se leen desde variables de entorno.
- Los adaptadores deben poder reemplazarse por dobles de prueba.

## Adaptadores backend

### PostgreSQL

Ubicacion sugerida: `backend/apps/*/infrastructure/repositories.py`

Responsabilidad:

- Persistir y consultar entidades relacionales.
- Encapsular Django ORM.
- Convertir modelos Django a entidades de dominio.

Contrato minimo:

```python
class UserRepository:
    def create(self, data): ...
    def get_by_id(self, user_id): ...
    def get_by_username(self, username): ...
    def get_by_email(self, email): ...
```

### MongoDB

Ubicacion actual: `backend/apps/core/infrastructure/mongo_client.py`

Responsabilidad:

- Centralizar la conexion a MongoDB.
- Entregar la base configurada por entorno.
- Evitar conexiones directas desde vistas o serializers.

Contrato minimo:

```python
def get_mongo_db(): ...
```

### API REST interna

Ubicacion sugerida: `backend/apps/*/presentation/views.py`

Responsabilidad:

- Adaptar requests HTTP a casos de uso.
- Validar entrada con serializers.
- Responder usando el formato estandar definido en `docs/scrum-34-estandar-api.md`.

## Adaptadores frontend

### Cliente HTTP REST

Ubicacion sugerida: `frontend/src/api/`

Responsabilidad:

- Leer `VITE_API_URL`.
- Construir URLs hacia el backend.
- Centralizar headers, parseo JSON y manejo de errores.
- Exponer funciones por recurso, no llamadas `fetch` dispersas en componentes.

Contrato minimo:

```ts
type ApiResult<T> = {
  exito: boolean;
  mensaje: string;
  data?: T;
  error?: {
    codigo: string;
    detalles?: unknown;
  };
};
```

### Adaptador de autenticacion

Ubicacion sugerida: `frontend/src/auth/`

Responsabilidad:

- Guardar y leer token de sesion.
- Adjuntar `Authorization` a llamadas protegidas.
- Limpiar sesion ante respuestas `401` o `403`.

### Adaptador de plantillas

Ubicacion sugerida: `frontend/src/templates/`

Responsabilidad:

- Enviar y recibir configuraciones de plantilla.
- Normalizar datos de color, contenido y estilos.
- Evitar que componentes visuales conozcan la forma exacta de la API.

## Convenciones de implementacion

- Interfaces o tipos compartidos cerca del adaptador que los consume.
- Una funcion por operacion de API.
- Nombres orientados al dominio: `getTemplate`, `saveTemplateColors`,
  `loginUser`, `getCurrentUser`.
- Sin credenciales hardcodeadas.
- Sin dependencias directas de backend dentro de componentes React.

## Beneficios esperados

- Codigo mas testeable.
- Menos duplicacion de llamadas HTTP.
- Separacion clara entre UI, casos de uso y servicios externos.
- Mejor control de errores y respuestas API.
