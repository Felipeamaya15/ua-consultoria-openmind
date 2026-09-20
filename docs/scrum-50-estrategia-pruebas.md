# SCRUM-50 - Estrategia general de pruebas

## Objetivo

Definir una estrategia de pruebas para validar frontend, backend, integraciones y
flujos principales del proyecto. La estrategia busca reducir regresiones y entregar
criterios claros para revisar Pull Requests.

## Alcance

La estrategia cubre:

- Componentes React y logica frontend.
- Endpoints Django REST Framework.
- Casos de uso y repositorios backend.
- Integracion con PostgreSQL.
- Integracion con MongoDB.
- Contratos de respuesta API definidos en `docs/scrum-34-estandar-api.md`.

## Niveles de prueba

### 1. Pruebas unitarias

Objetivo:

- Validar funciones puras, transformaciones de datos y reglas de negocio.

Frontend:

- Validar helpers de API, formateo y normalizacion de datos.
- Validar componentes que manejen estado local relevante.

Backend:

- Validar entidades, excepciones de dominio y casos de uso.
- Usar repositorios falsos cuando no sea necesario tocar base de datos.

### 2. Pruebas de integracion

Objetivo:

- Confirmar que las capas se comunican correctamente.

Backend:

- Probar endpoints DRF con cliente de pruebas.
- Verificar codigos HTTP y formato JSON estandar.
- Confirmar integracion con PostgreSQL mediante modelos Django.

MongoDB:

- Probar acceso mediante `get_mongo_db`.
- Evitar que vistas consuman MongoDB directamente.

Frontend:

- Probar cliente HTTP contra respuestas simuladas.
- Validar que `VITE_API_URL` se use como base de comunicacion.

### 3. Pruebas end-to-end manuales

Objetivo:

- Validar que los flujos principales funcionan desde la experiencia del usuario.

Flujos minimos:

- Levantar proyecto con Docker Compose.
- Abrir frontend en `http://localhost:5173`.
- Abrir backend/admin en `http://localhost:8000/admin/`.
- Probar conexion frontend-backend cuando exista pantalla o cliente REST.
- Validar formularios principales cuando se implementen.

## Criterios para Pull Requests

Cada PR deberia incluir:

- Descripcion del cambio.
- Ticket SCRUM asociado.
- Archivos principales modificados.
- Comandos ejecutados.
- Resultado de pruebas.
- Capturas o descripcion manual si el cambio afecta UI.

## Comandos base

Frontend:

```bash
cd frontend
npm run build
```

Backend:

```bash
cd backend
python manage.py test
python manage.py check
```

Docker:

```bash
docker compose config
docker compose up --build
```

## Datos de prueba

- Usar datos ficticios y no credenciales reales.
- Evitar subir `.env`.
- No depender de datos productivos.
- Mantener usuarios de prueba con nombres identificables, por ejemplo
  `qa_user`, `demo_admin` o `test_user`.

## Manejo de errores

Las pruebas deben cubrir:

- Respuestas exitosas.
- Errores de validacion.
- Recursos inexistentes.
- Credenciales invalidas.
- Servicios externos no disponibles.

## Criterios de aceptacion

Una funcionalidad se considera lista cuando:

- Compila sin errores.
- Pasa las pruebas existentes.
- No introduce cambios fuera del alcance del ticket.
- Mantiene el formato estandar de respuestas API.
- Tiene validacion manual cuando afecta la UI.
- No incluye secretos ni archivos locales ignorados.

## Mejoras futuras

- Agregar framework de pruebas para React.
- Agregar cobertura automatizada en CI.
- Crear fixtures comunes para usuarios y plantillas.
- Agregar pruebas E2E para flujos criticos cuando exista UI estable.
