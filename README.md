# 🤝 Proyecto Consultoría: Fundación Gestionar

**Repositorio oficial del equipo OpenMind - ua-consultoria-openmind**

Este proyecto se desarrolla en el marco de la asignatura de consultoria de la Universidad Autónoma de Chile. El objetivo es proveer servicios de consultoría y desarrollo tecnológico para la **[Fundación Gestionar](https://fundaciongestionar.org/)**, trabajando bajo SCRUM.

# Proyecto Consultoria: Fundacion Gestionar

> Repositorio oficial del equipo OpenMind | Asignatura de Consultoria de Software - Universidad Autonoma de Chile

Este proyecto consiste en el diseno, desarrollo e implementacion de una plataforma tecnologica orientada a optimizar la gestion y servicios de la **[Fundacion Gestionar](https://fundaciongestionar.org/)**, trabajando bajo el marco agil de trabajo **SCRUM**.

---

## Equipo de Trabajo (OpenMind)

| Rol | Responsable | Funciones Principales |
| :--- | :--- | :--- |
| **Product Owner (PO)** | Marianela | Definicion y priorizacion del product backlog, gestion de requerimientos y comunicacion directa con los representantes de la fundacion. |
| **Scrum Master (SM)** | Lorenzo Cotta | Facilitacion de ceremonias agiles (Sprint Planning, Daily, Review, Retro), gestion de impedimentos y cumplimiento de SCRUM. |
| **Lider de QA** | Patricio Jaramillo | Diseno de la matriz de pruebas, ejecucion de pruebas de integracion con Postman, aseguramiento de calidad y control de tickets. |
| **Responsable de Git** | Felipe Amaya | Administracion de repositorios, definicion de flujos de trabajo (*GitFlow*), politicas de ramas y revision tecnica de Pull Requests. |
| **Documentacion Tecnica** | Ismael | Redaccion de actas, arquitectura de software, manuales tecnicos y especificaciones funcionales en Confluence. |
| **Frontend Developer** | Francisco Salas | Diseno e implementacion de interfaces de usuario (UI/UX), integracion de servicios y logica del cliente web. |

---

## Stack Tecnologico

### Frontend
- **Framework Principal:** React / Next.js
- **Lenguaje:** TypeScript
- **Estilos:** Tailwind CSS

### Backend & Servicios
- **Lenguaje:** Python 3.11+
- **Framework:** Django & Django REST Framework (DRF)
- **Autenticacion:** Django Rest Auth / Tokens de sesion

### Base de Datos & Persistencia
- **Motor:** PostgreSQL
- **ORM:** Django ORM (con soporte de migraciones versionadas)

### Infraestructura & Despliegue Local
- **Virtualizacion:** Docker & Docker Compose
- **Control de Versiones:** Git / GitHub

### Integraciones Externas
- **Pasarela de Pagos:** Transbank Webpay Plus (API REST)

### Herramientas de Gestion & QA
- **Gestion Agil:** Atlassian Jira & Confluence
- **Validacion de APIs:** Postman
- **Entorno de Desarrollo:** Visual Studio Code

---

## Arquitectura del Directorio

```text
ua-consultoria-openmind/
├── apps/                         # Modulos independientes de Django (Backend)
│   ├── authentication/           # Gestion de usuarios y configuracion de login
│   ├── catalog/                  # Catalogo, productos y gestion de stock
│   ├── cart/                     # Logica de carritos de compra e items
│   └── orders/                   # Procesamiento de pedidos y checkout
├── frontend/                     # Aplicacion cliente en Next.js / React
│   ├── public/                   # Recursos estaticos (imagenes, iconos)
│   └── src/
│       ├── components/           # Componentes UI reutilizables
│       ├── features/             # Modulos de negocio (storefront, admin)
│       └── services/             # Clientes HTTP y llamadas a la API REST
├── docker-compose.yml            # Orquestacion de contenedores (backend, db, frontend)
├── Dockerfile                    # Receta de construccion para el servicio backend
├── requirements.txt              # Dependencias de Python / Django
└── README.md                     # Documentacion general del repositorio

**Clonar el repositorio:**
   ```bash
   git clone https://github.com/Felipeamaya15/ua-consultoria-openmind.git

   ## Flujo de Trabajo en Git (Convenciones)
Para mantener el orden en el código, todos los integrantes deben seguir estas reglas gestionadas por el Responsable de Git:
1. **La rama `main` está protegida.** Nadie puede hacer *commit* directo.
2. Toda nueva funcionalidad o corrección debe trabajarse en una rama separada (ej: `feature/nombre-tarea` o `bugfix/descripcion`).
3. Para integrar código a `main`, se debe abrir un **Pull Request (PR)** y contar con al menos una aprobación de QA u otro desarrollador.
4. Los mensajes de los *commits* deben ser claros, frecuentes y, de ser posible, referenciar el número de la tarea en la herramienta de gestión[cite: 1].