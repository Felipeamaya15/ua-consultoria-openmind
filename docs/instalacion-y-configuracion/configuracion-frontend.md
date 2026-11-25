# SCRUM-482 — Configuración del frontend

Fecha: 2026-10-30. Fuente: archivos reales de la rama `develop` (commit `fba6a48`). Alcance: React, Vite, TypeScript y Tailwind CSS.

| Campo | Detalle |
| --- | --- |
| Ticket | SCRUM-482 · Documentar configuración del frontend |
| Backlog | BL-408 |
| Componente | Frontend (carpeta `frontend/`) |
| Versión del código | Rama `develop`, commit `fba6a48` |
| Fecha | 30 de octubre de 2026 |
| Estado | Listo para validación |
| Relacionado | `EJECUCION_LOCAL.md` (variables, ejecución y actualización) y los documentos SCRUM-484, SCRUM-485 y SCRUM-487 |

## 1. Propósito y alcance

Este documento describe cómo está configurado el frontend de OpenMind E-commerce: qué tecnologías usa, cómo se organiza, qué variables de entorno necesita, cómo se ejecuta y se compila, y cómo se verifica. Permite que una persona nueva levante y mantenga la parte visual sin depender de quien la programó.

- **Incluye:** configuración de Vite, TypeScript y Tailwind, variables de entorno, ejecución con Docker, rutas, comunicación con la API, pruebas y problemas frecuentes.
- **No incluye:** el backend, las bases de datos y las credenciales externas (documentos SCRUM-484, 485 y 487) ni una instalación de producción.

> **Importante**
>
> La configuración actual del frontend es de **desarrollo**: el contenedor ejecuta el servidor de Vite (`npm run dev -- --host`). Para publicar el sitio hay que compilarlo con `npm run build` y servir la carpeta `dist/` como archivos estáticos.

## 2. Resumen técnico

| Pieza | Tecnología (versión del `package.json`) | Función |
| --- | --- | --- |
| Interfaz | React ^18.3.1 y react-dom ^18.3.1 | Componentes y estado de la aplicación |
| Lenguaje | TypeScript ^5.2.2, modo estricto | Tipado y verificación al compilar |
| Empaquetador | Vite ^5.3.4 con @vitejs/plugin-react ^4.3.1 | Servidor de desarrollo y compilación |
| Estilos | Tailwind CSS ^4.3.3 con @tailwindcss/vite ^4.3.3 | Utilidades CSS integradas como plugin de Vite |
| Rutas | react-router-dom ^7.18.4 | Navegación de la tienda y del panel |
| Inicio de sesión | @react-oauth/google ^0.13.5 | Flujo de Google OAuth |
| Entorno | Node 20 (imagen `node:20-slim`) | Ejecución dentro de Docker |
| Pruebas | `node:test` de Node | Pruebas `.cjs` que cargan el TypeScript real |

En total hay 4 dependencias de ejecución y 9 de desarrollo.

## 3. Estructura de carpetas

| Ruta | Contenido |
| --- | --- |
| `index.html` | Página base: `lang="es"`, título “Mi Tienda”, monta `#root` y carga `src/main.tsx` |
| `package.json` y `package-lock.json` | Dependencias y scripts; el lockfile fija las versiones (usar `npm ci`) |
| `vite.config.ts` | Configuración de Vite |
| `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json` | Configuración de TypeScript |
| `Dockerfile` | Imagen del frontend para desarrollo |
| `public/` | Archivos estáticos (`logo-universidad-autonoma.png`) |
| `scripts/generate-visual-css.cjs` | Genera los alias de `src/styles/visual-config.css` |
| `tests/` | 102 archivos de prueba `.cjs` y su infraestructura |
| `src/main.tsx` | Punto de entrada: Google OAuth, identidad de la tienda y rutas |
| `src/api.ts` | URL base de la API (`API_BASE_URL`) y comprobación de conexión |
| `src/app/router/` | Rutas de la tienda pública |
| `src/features/admin/` | Panel del emprendedor (rutas `/emprendedor`) |
| `src/features/storefront/` | Tienda pública: catálogo, carrito, compra y seguimiento |
| `src/features/` (`auth`, `checkout`, `integrations`, `landing`, `marketing`) | Inicio de sesión, pagos de la compra, integraciones, página de inicio y marketing |
| `src/core/` y `src/shared/` | Código compartido: API, HTTP, tipos, utilidades, componentes y servicios comunes |
| `src/styles/` y `src/assets/` | Hojas de estilo, íconos e imágenes |

## 4. Archivos de configuración

### 4.1 package.json: scripts

| Script | Comando | Para qué sirve |
| --- | --- | --- |
| `dev` | `vite --host` | Servidor de desarrollo con recarga en caliente |
| `typecheck` | `tsc --project tsconfig.app.json --noEmit` y lo mismo con `tsconfig.node.json` | Revisa los tipos sin generar archivos |
| `build` | `npm run typecheck && vite build` | Revisa los tipos y compila a `dist/` |
| `preview` | `vite preview` | Sirve `dist/` localmente para probar la compilación |
| `test:reports`, `test:analytics`, `test:dashboard`, `test:visual`, `test:editor-ux` | `node tests/...` | Grupos de pruebas (sección 11) |

### 4.2 vite.config.ts

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: 5173,
    watch: {
      usePolling: true, // necesario para el hot-reload dentro de Docker
    },
  },
});
```

- **Plugins:** React (compilación de JSX) y Tailwind 4 como plugin de Vite; no hay `tailwind.config` ni PostCSS.
- **`host: true`:** el servidor escucha en todas las interfaces, necesario para que Docker publique el puerto.
- **`usePolling`:** revisa los archivos periódicamente porque Docker no siempre notifica los cambios.

### 4.3 TypeScript

| Archivo | Alcance | Opciones relevantes |
| --- | --- | --- |
| `tsconfig.json` | Raíz: referencia a los otros dos | `strict`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch` |
| `tsconfig.app.json` | Carpeta `src` (excluye los archivos `*.BACKUP.ts` y `*.BACKUP.tsx`) | Destino ES2020, `moduleResolution: bundler`, `jsx: react-jsx`, tipos `vite/client` |
| `tsconfig.node.json` | Solo `vite.config.ts` | Destino ES2022 y tipos de Node |

Como `noUnusedLocals` y `noUnusedParameters` están activos, una variable o parámetro sin usar **hace fallar** `npm run build`.

### 4.4 Docker

```dockerfile
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm install --verbose
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host"]
```

| Parámetro del servicio `frontend` | Valor |
| --- | --- |
| Contenedor | `react_frontend` (reinicio `always`) |
| Variables | `VITE_API_URL` y `VITE_GOOGLE_CLIENT_ID`, tomadas del `.env` de la raíz |
| Volúmenes | `./frontend:/app` (código en vivo) y `frontend_node_modules:/app/node_modules` (dependencias en un volumen aparte) |
| Puerto | `5173:5173` |
| Depende de | `backend` |

Como `node_modules` vive en un volumen propio, **instalar una dependencia nueva exige** `docker compose exec frontend npm install`.

### 4.5 index.html y main.tsx

`main.tsx` monta la aplicación con esta jerarquía: `React.StrictMode` → `GoogleOAuthProvider` (con `VITE_GOOGLE_CLIENT_ID`) → `StoreIdentityProvider` → `RouterProvider`, y carga `styles/storefront.css`.

## 5. Variables de entorno

| Variable | Para qué se usa | Valor en desarrollo | Dónde se define |
| --- | --- | --- | --- |
| `VITE_API_URL` | URL base de la API: todos los servicios llaman a `<URL>/api/...` | `http://localhost:8000` | `.env` de la raíz → `docker-compose.yml` (servicio `frontend`) |
| `VITE_GOOGLE_CLIENT_ID` | ID público de cliente OAuth de Google para el inicio de sesión | El de `.env.example` (no es un secreto) | Igual que la anterior |

**Cómo funcionan.** Vite solo expone al navegador las variables que empiezan con `VITE_` y reemplaza su valor al compilar. Por eso: (1) cualquiera puede leerlas en el sitio publicado, así que **nunca deben contener secretos**; (2) cambiarlas exige reiniciar el servidor de desarrollo o volver a compilar.

> **Atención**
>
> Si `VITE_API_URL` queda **vacía**, el comportamiento depende del archivo: `src/api.ts` usa `??` y respeta el valor vacío, mientras que más de diez servicios usan `||` y caen en `http://localhost:8000`. Hasta unificarlo, definirla siempre con la URL completa y sin barra final (por ejemplo `https://tienda.cl`). Si no está definida en absoluto, todos usan `http://localhost:8000`.

## 6. Comandos

Los comandos se ejecutan desde la raíz del proyecto, en PowerShell.

| Acción | Comando |
| --- | --- |
| Levantar todos los servicios | `docker compose up -d --build` |
| Ver los registros del frontend | `docker compose logs --tail=60 frontend` |
| Compilar para producción | `docker compose exec frontend npm run build` |
| Revisar los tipos | `docker compose exec frontend npm run typecheck` |
| Instalar dependencias nuevas | `docker compose exec frontend npm install` |
| Regenerar el CSS visual | `docker compose exec frontend node scripts/generate-visual-css.cjs` |
| Ejecutar una prueba | `docker compose exec frontend node tests/api-request.cjs` |
| Recrear el frontend tras cambiar el `.env` | `docker compose up -d --force-recreate frontend` |

Sin Docker (Node 20 o superior): desde `frontend/`, `npm ci` y luego `npm run dev`.

## 7. Estilos y diseño visual

- **`styles/storefront.css`:** importa las tipografías de Google Fonts (Plus Jakarta Sans y DM Serif Display), `@import 'tailwindcss'` y `visual-config.css`, y define el tema con variables `--color-*` mediante `@theme inline`.
- **`styles/visual-config.css`:** alias responsivos para escritorio, tableta (hasta 1023 px) y móvil, generados desde el contrato visual. El atributo `data-storefront-visual` aplica la configuración.
- **Regenerarlo:** `node scripts/generate-visual-css.cjs` desde `frontend/`. El script reconstruye los alias y conserva el CSS de los consumidores; la parte generada no se edita a mano.

## 8. Rutas de la aplicación

#### Tienda pública (`src/app/router/index.tsx`)

| Ruta | Pantalla |
| --- | --- |
| `/` y `/landing` | Página de inicio |
| `/plantilla/1` a `/plantilla/4` | Las plantillas visuales de la tienda |
| `catalogo`, `producto/:id` | Catálogo y detalle de producto |
| `carrito`, `compra`, `pedido-confirmado` | Carrito, proceso de compra y confirmación |
| `seguimiento` | Seguimiento del pedido |
| `ingresar`, `perfil`, `mis-pedidos`, `mis-pedidos/:id`, `preferencias-comerciales` | Cuenta del comprador |
| `legal/:type` | Páginas legales |

#### Panel del emprendedor (`src/features/admin/config/navigation.ts`)

| Ruta (`/emprendedor/...`) | Función |
| --- | --- |
| `/` (panel), `productos`, `pedidos`, `ventas` | Resumen, catálogo, pedidos e informes de ventas |
| `landing`, `diseno`, `promociones`, `marketing` | Página de inicio, diseño visual, promociones y marketing |
| `pagos`, `entregas`, `autenticacion` | Medios de pago, retiro y despacho, y métodos de ingreso |
| `contactos`, `correos`, `seo` | Contactos comerciales, plantillas de correo, SEO y analítica |

## 9. Comunicación con la API

- **URL base:** `API_BASE_URL` (`src/api.ts`), construida desde `VITE_API_URL`.
- **Autenticación:** cabecera `Authorization: Token <token>`. El token se guarda en el navegador (`localStorage` o `sessionStorage`, clave `token`).
- **Respuestas:** la API devuelve un sobre con `exito`, `data`, `mensaje` y `error`; los servicios rechazan las respuestas que no lo cumplen.

| Familia de rutas | Uso |
| --- | --- |
| `/api/auth/` | Sesión, configuración de autenticación y de pagos |
| `/api/catalog/` | Productos y configuración de Transbank, PayPal y Mercado Pago |
| `/api/pagos/` | Pagos, Linkify y transferencias |
| `/api/tienda/` | Panel, ventas, correos y contactos |
| `/api/promociones/` | Promociones y cupones |

## 10. Recursos externos que carga el navegador

| Servicio | Para qué | Si no hay acceso |
| --- | --- | --- |
| Google Fonts (`fonts.googleapis.com`) | Tipografías de la tienda | El sitio funciona con otra tipografía |
| Unsplash (`images.unsplash.com`) | Imágenes de ejemplo de las plantillas y del diseño predeterminado | Las imágenes de ejemplo no se muestran |
| Google OAuth | Inicio de sesión con Google | El inicio con Google no está disponible |
| Google Analytics y Meta Pixel | Medición, solo si se configuró el identificador y el comprador aceptó cookies (según las revisiones de QA) | No se registra la medición |

## 11. Pruebas

- Hay **102 archivos** `.cjs` en `tests/`. Cada uno usa `node:test` y un cargador (`source-loader.cjs`) que transpila el TypeScript real de `src/`, sin necesidad de un navegador.
- **Ejecutar uno:** `node tests/api-request.cjs`. Los grupos tienen script: `npm run test:dashboard`, `test:analytics`, `test:reports`, `test:visual` y `test:editor-ux`.
- Las pruebas cuyo nombre termina en `-browser` o `-visual` necesitan un navegador y la aplicación en ejecución.

## 12. Verificación realizada

Ejecutada el 30 de octubre de 2026 sobre el commit `fba6a48`, con Node 22 y sin Docker.

| Comprobación | Resultado |
| --- | --- |
| `npm ci` | Correcto, en 5 s |
| `npm run build` con `VITE_API_URL=https://tienda.cl` | Correcto en 27 s: 279 módulos transformados y `dist/` de 1,6 MB con 36 archivos. El JS principal pesa 676 KB y el CSS 348 KB |
| URL de la API incrustada al compilar | Aparece en 6 archivos JS de `dist/assets` |
| Servidor de desarrollo (`vite --host`) | Responde HTTP 200 con el título “Mi Tienda” y publica una dirección de red |
| Pruebas (`node tests/*.cjs`, 8 en paralelo) | 71 de 101 archivos pasan completos. En los archivos que informan resumen se contaron 203 casos: 201 pasan y 2 fallan. 22 de los 30 archivos con error son pruebas de navegador o visuales; 5 superan los 60 s; 3 requieren revisión en el entorno del equipo (`editor-incremental`, `store-identity-baseline` y `recent-orders`) |

> **Cómo leer estos resultados**
>
> Los errores provienen en su mayoría de pruebas que necesitan un navegador instalado, que el entorno de revisión no tiene. Conviene repetir la ejecución en el entorno del equipo y registrar el resultado en el ticket.

## 13. Problemas frecuentes

| Síntoma | Causa probable | Qué hacer |
| --- | --- | --- |
| La tienda no carga datos o muestra error de red | `VITE_API_URL` incorrecta o backend apagado | Revisar el valor en `.env`, recrear el frontend y mirar `docker compose logs backend` |
| Error CORS en el navegador | El origen no está permitido en el backend | Abrir `http://localhost:5173` y revisar `DJANGO_CORS_ALLOWED_ORIGINS` |
| Cambié `.env` y no se nota | Las variables `VITE_*` se fijan al iniciar o compilar | `docker compose up -d --force-recreate frontend` |
| Falla `npm run build` por una variable sin usar | `noUnusedLocals` y `noUnusedParameters` | Eliminar la variable o el parámetro sin uso |
| Falta una dependencia tras actualizar | `node_modules` está en un volumen aparte | `docker compose exec frontend npm install` |
| El botón de Google no funciona | `VITE_GOOGLE_CLIENT_ID` vacío o dominio no autorizado en Google | Definir el ID y autorizar el origen en la consola de Google |
| El puerto 5173 está ocupado | Otro proceso lo usa | Liberar el puerto o detener el otro servicio |

## 14. Referencias

- `EJECUCION_LOCAL.md`: variables de entorno (SCRUM-486), cómo levantar (SCRUM-488) y actualizar (SCRUM-489).
- `docs/frontend-plantilla-1.md`: detalle del frontend de la plantilla 1.
- `frontend/package.json`, `vite.config.ts`, `tsconfig*.json`, `Dockerfile` y `docker-compose.yml`.
