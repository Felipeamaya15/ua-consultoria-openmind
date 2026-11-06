# Sprint 8 — Difusión manual y validación final

Base `135a136`, rama `feature/sprint8-marketing-secciones`, árbol limpio al comenzar el 5 de noviembre de 2026.

## PostgreSQL: diagnóstico y reparación

Se reprodujo `could not translate host name "db" to address`. PostgreSQL estaba **running**, sus registros indicaban «ready to accept connections» y conservaba el directorio existente. `docker inspect` mostró `HostConfig.NetworkMode=ua-consultoria-openmind_default`, pero `NetworkSettings.Networks` estaba vacío. El backend sí pertenecía a esa red. No era un problema de contraseña ni bastaba con esperar el inicio de PostgreSQL.

Se reconectó el contenedor existente con `docker network connect --alias db ua-consultoria-openmind_default postgres_consultoria`. Después resolvió DNS y una consulta PostgreSQL `SELECT 1` respondió correctamente desde Django. No se eliminaron contenedores, volúmenes ni datos. La evidencia no permite determinar qué acción previa desconectó el contenedor.

Compose incorpora `pg_isready` y espera `service_healthy` antes de iniciar backend. Esta protección evita la carrera de inicio, aunque no sustituye una reparación de red si alguien desconecta un contenedor existente. Para futuros arranques se usa `docker compose up -d`; no se necesita reconstruir ni reinicializar la base.

## Contrato de Difusión

Se reutilizan endpoints existentes de catálogo, promociones, Landing pública, recursos publicados y perfiles sociales del propietario. No hay un nuevo modelo ni endpoint de publicación automática. La selección contiene referencias de origen y las vuelve a consultar antes de preparar/exportar: no crea productos, servicios ni archivos duplicados.

Los enlaces de secciones apuntan a anclas estables de una sección actualmente visible. Biblioteca solo admite recursos que el endpoint público ya autoriza; un archivo privado no obtiene un enlace público por seleccionarlo en Difusión. Los perfiles registrados no son cuentas OAuth autorizadas.

Preparar material abre el generador existente de Publicaciones, sin crear otro editor. Las acciones de copia, descarga y compartir manualmente describen lo que efectivamente hicieron; ninguna afirma que el contenido se publicó en una red.

## Resultados de validación — 6 de noviembre de 2026

| Verificación | Resultado |
|---|---|
| Django System Check | Sin problemas |
| Pruebas backend apps.landing | 128 de 128 aprobadas |
| Pruebas frontend Difusión (sharing.cjs) | 7 de 7 aprobadas |
| Pruebas frontend navegación Marketing | 4 de 4 aprobadas |
| TypeScript | Sin errores |
| Compilación Vite | Correcta, 306 módulos transformados |
| Docker Compose | Configuración válida |
| Servicios Docker | PostgreSQL, MongoDB, backend y frontend en ejecución; PostgreSQL saludable |

### Alcance de la validación

Se verificaron las funcionalidades mediante pruebas automatizadas, comprobación de tipos y compilación de producción.

Esta evidencia no sustituye las pruebas manuales completas de las 17 historias de usuario, las pruebas de aceptación del cliente ni la validación del despliegue en producción.

La difusión implementada es manual. No incluye publicación automática en redes sociales ni integración OAuth.
