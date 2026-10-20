# Contrato de las mejoras de informes y configuración

- GET /api/tienda/informes/?anio=2026[&mes=10]: propietario autenticado. Devuelve envoltorio exito/data; data incluye anios_disponibles (años reales según fecha de creación en America/Santiago más año actual), anio, mes, tienda, fecha_desde, fecha_hasta, moneda, zona_horaria, total_ventas decimal string, total_pedidos, pedidos_pagados, ticket_promedio nullable, meses (12 para anual, uno para mensual), distribucion_estados y mejores_meses (empates completos; vacío sin actividad).
- GET /api/tienda/informes/pdf/?anio=2026[&mes=10]: mismos filtros y permisos; application/pdf y Content-Disposition attachment con informe-ventas-pedidos-AAAA[-MM].pdf. Cache-Control no-store. Año entero 1..año actual, mes opcional 1..12. Repeticiones o filtros desconocidos: 400. Un año sin registros es consultable.
- GET /api/tienda/configuracion/: público, solo nombre y descripción del negocio. PUT: propietario autenticado; nombre obligatorio no vacío, máximo 150; descripción opcional. Persiste Tienda, sin migración.
- /api/landing/configuracion/ y /api/tienda/dashboard/ conservan sus contratos.

El resolver existente es de instalación de una sola tienda: falla cerrado (503) si hay varias; rechaza propietario ajeno, inactivo e identificadores de tienda inconsistentes. No se cambia esta arquitectura.

Las ventas usan Pedido.ESTADOS_PAGADOS y monto_total; incluyen los componentes del total del pedido conforme al dashboard. Se atribuyen a fecha_creacion, no a una fecha efectiva de pago inexistente. Los estados son los actuales: el informe no es un cierre contable inmutable. Los empates mensuales se informan sin inventar ganadores. No se cargan pedidos individuales ni se consulta Mongo para informes.

## Auditoría previa de configuración
Configuración: /emprendedor/configuracion, Settings.tsx, nombre/descripción/correo/teléfono/logo y guardar, todos locales vía AdminContext/adminRepository.
Página principal: /emprendedor/landing, LandingPage.tsx + LandingContentEditor, título/descripción de portada/CTA/imagen/logo, banderas de secciones, productos/categorías (hasta 6), beneficios (hasta 4), contacto/redes/horarios, dirección/Maps y vista pública; GET/PUT /api/landing/configuracion/, catálogo público Mongo.
Duplicados: logo, correo, teléfono con persistencias distintas. Descripción del negocio y portada tienen propósitos diferentes. Nombre del negocio exclusivo de Configuración. Resto del contenido exclusivo de Página principal.
Organización definitiva: una entrada Configuración de la tienda, apartados Información del negocio (nombre y descripción persistidos en Tienda) y Página principal y contacto (formulario existente de Django). Diseño sigue siendo el módulo de plantillas y editor, enlazado desde configuración. Landing antigua redirige. Recuperación explícita de datos locales en campos vacíos, con guardado posterior; nunca se sobrescribe automáticamente el servidor.
Las cuatro plantillas consumen StoreContext y contenido landing: se conserva su presentación, se incorpora nombre/descripción de Tienda y se mantiene logo/contacto de landing como única fuente editable. Colores/editor conservan su almacenamiento y comportamiento existentes.
