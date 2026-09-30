# Ejecución Local del Proyecto:

## 1. Levantar el proyecto
Desde la raíz del repositorio ejecutar:
docker compose up --build

## 2. Acceso al proyecto
Frontend
Abrir en el navegador:
http://localhost:5173

Backend
Disponible en:
http://localhost:8000

## Detener el proyecto
Para detener los servicios ejecutar:
docker compose down

# Importante
Para acceder al frontend utilizar:
http://localhost:5173

Evitar utilizar direcciones IP locales como:
http://192.168.x.x:5173

Esto puede generar problemas con la autenticación en el entorno local.