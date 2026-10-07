# Frontend de la plantilla 1

Inicio editorial adaptado de los archivos locales de ecommerce_figma. Solo frontend con datos de demostración; no modifica ni consulta el backend.

- `features/storefront/components/store/EditorialLayout.tsx`: encabezado sticky y pie compartidos mediante Outlet.
- `pages/EditorialHome.tsx`: portada, beneficios, destacados y categorías de la plantilla 1.
- `components/store/ProductCard.tsx`: tarjeta reutilizable con selección de la primera variante disponible.
- `context/CartContext.tsx`: carrito compartido durante la navegación, límites de stock y subtotal. Se reinicia al recargar.
- `data/mockData.ts`: datos e imágenes de ejemplo del diseño.
- `styles/storefront.css`: tipografías, colores y estilos de la referencia.

Catálogo, carrito y detalle incluyen pantallas de apoyo para comprobar enlaces y estado compartido; no representan todavía su diseño final. Ingreso, seguimiento y páginas legales quedan identificados como próximos. No hay autenticación, checkout ni pagos reales en esta entrega.

No se incluye el selector inicial de roles ni las flechas flotantes de presentación. La ruta inicial abre directamente la tienda del cliente. Las siguientes plantillas reutilizarán datos, tarjetas y carrito y podrán aportar su propio layout.

Las imágenes de ejemplo utilizan las URLs Unsplash originales y las fuentes Google Fonts, por lo que requieren internet.

Verificación: `docker compose exec -T frontend npm run build`. Inicio habitual: `docker compose up -d --build`. Si ya existe el volumen de node_modules, ejecutar `docker compose exec -T frontend npm ci` tras cambiar dependencias.
