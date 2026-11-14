# Proyecto E-commerce

> **Repositorio oficial del equipo OpenMind** | Asignatura de Consultoría de Software - Universidad Autónoma de Chile

Este proyecto consiste en el diseño, desarrollo e implementación de una plataforma tecnológica de **e-commerce** orientada a optimizar la gestión, personalización y operación comercial de **3 emprendedores independientes**, quienes son nuestros clientes actuales, trabajando bajo el marco ágil **SCRUM**.

---

## Equipo de Trabajo (OpenMind)

| Rol | Responsable | Funciones Principales |
| :--- | :--- | :--- |
| **Product Owner (PO)** | Marianela | Definicion y priorizacion del product backlog, gestion de requerimientos y comunicacion directa con el cliente. |
| **Scrum Master (SM)** | Lorenzo Cotta | Facilitacion de ceremonias agiles (Sprint Planning, Daily, Review, Retro), gestion de impedimentos y cumplimiento de SCRUM. |
| **Lider de QA** | Patricio Jaramillo | Diseno de la matriz de pruebas, ejecucion de pruebas de integracion con Postman, aseguramiento de calidad y control de tickets. |
| **Responsable de Git** | Felipe Amaya | Administracion de repositorios, definicion de flujos de trabajo (*GitFlow*), politicas de ramas y revision tecnica de Pull Requests. |
| **Documentacion Tecnica** | Ismael | Redaccion de actas, arquitectura de software, manuales tecnicos y especificaciones funcionales en Confluence. |
| **Frontend Developer** | Francisco Salas | Diseno e implementacion de interfaces de usuario (UI/UX), integracion de servicios y logica del cliente web. |

---

## Stack Tecnológico

### Frontend
- **Framework y Enrutamiento:** React 18, Vite 5 y React Router DOM 7
- **Lenguaje:** TypeScript 5
- **Estilos:** Tailwind CSS 4 y `magic.css`
- **Autenticación Cliente:** `@react-oauth/google` (Google Identity Services)

### Backend & Servicios
- **Lenguaje:** Python 3.11
- **Framework:** Django 5 & Django REST Framework (DRF) con `django-cors-headers`
- **Seguridad y Autenticación:** Hashing con `argon2-cffi`, cifrado con `cryptography`, `google-auth` y autenticación por tokens / cookies
- **Procesamiento Multimedia y Documentos:** `Pillow` y `pillow-heif` (imágenes y HEIC/HEIF), `av` / PyAV (compresión de video MP4/WebM), `reportlab` y `pypdf` (PDF), `openpyxl` (exportación a Excel)

### Base de Datos & Persistencia
- **Relacional:** PostgreSQL 15 con Django ORM y `psycopg2-binary` (tiendas, usuarios, pedidos, pagos, envíos y configuraciones)
- **NoSQL:** MongoDB con `pymongo` (catálogo de productos, variantes y atributos)

### Infraestructura & Entorno Local
- **Virtualización:** Docker & Docker Compose (`db`, `mongodb`, `backend`, `expirador_pedidos`, `frontend` y `mailpit`)
- **Correo de Pruebas Local:** Mailpit (captura SMTP y visor web en el puerto `8025`)
- **Control de Versiones:** Git / GitHub

### Integraciones Externas
- **Pasarelas y Medios de Pago:** Transbank Webpay Plus, PayPal (con tipo de cambio del Banco Central de Chile), Mercado Pago, TUU, Linkify y transferencia bancaria
- **Envíos y Logística:** Chilexpress, Starken, tarifas configurables y retiro en tienda (con geocodificación opcional)
- **Comunicaciones y Analítica:** Google OAuth / Gmail API, Google Analytics y Meta Pixel

### Gestión & QA
- **Gestión Ágil:** Atlassian Jira & Confluence
- **Pruebas y Calidad:** `node --test` y `tsc` en frontend, `Django TestCase` en backend, y validación de APIs con Postman
- **Entorno de Desarrollo:** Visual Studio Code

> **Instalación:** requisitos en [`docs/requisitos-instalacion.md`](docs/requisitos-instalacion.md) y procedimiento en [`EJECUCION_LOCAL.md`](EJECUCION_LOCAL.md).
> **Documentacion tecnica:** punto de entrada en [`docs/DOCUMENTACION_TECNICA.md`](docs/DOCUMENTACION_TECNICA.md).

---

## Arquitectura del Directorio

```text
ua-consultoria-openmind/
├── backend/apps/                 # Modulos independientes de Django (Backend)
│   ├── authentication/           # Gestion de usuarios y configuracion de login
│   ├── catalog/                  # Catalogo, productos y gestion de stock
│   ├── core/                     # Tienda, pedidos, checkout, promociones y pagos
│   ├── shipping/                 # Cotizacion y seguimiento de envios
│   ├── landing/                  # Pagina de inicio de la tienda
│   └── visual_config/            # Configuracion visual y plantillas
├── frontend/                     # Aplicacion cliente en Vite / React
│   ├── public/                   # Recursos estaticos (imagenes, iconos)
│   └── src/
│       ├── components/           # Componentes UI reutilizables
│       ├── features/             # Modulos de negocio (storefront, admin)
│       └── services/             # Clientes HTTP y llamadas a la API REST
├── docker-compose.yml            # Orquestacion de contenedores (backend, db, frontend)
├── docs/                         # Documentacion tecnica y evidencias de QA
├── EJECUCION_LOCAL.md            # Instalacion, ejecucion y actualizacion
└── README.md                     # Documentacion general del repositorio
```

**Clonar el repositorio:**
```bash
git clone https://github.com/Felipeamaya15/ua-consultoria-openmind.git
```

## Flujo de Trabajo en Git (Convenciones)
Para mantener el orden en el código, todos los integrantes deben seguir estas reglas gestionadas por el Responsable de Git:
1. **La rama `main` está protegida.** Nadie puede hacer *commit* directo.
2. Toda nueva funcionalidad o corrección debe trabajarse en una rama separada (ej: `feature/nombre-tarea` o `bugfix/descripcion`).
3. Para integrar código a `main`, se debe abrir un **Pull Request (PR)** y contar con al menos una aprobación de QA u otro desarrollador.
4. Los mensajes de los *commits* deben ser claros, frecuentes y, de ser posible, referenciar el número de la tarea en la herramienta de gestión.