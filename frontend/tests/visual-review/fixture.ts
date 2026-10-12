/** Isolated visual QA entry, never imported by the application. No backend writes. */
const image = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="700"><rect width="900" height="700" fill="#c7d2fe"/><circle cx="450" cy="330" r="170" fill="#818cf8"/><text x="450" y="580" text-anchor="middle" font-size="40" fill="#312e81">Producto de prueba</text></svg>');
const originalFetch = window.fetch.bind(window);
if (new URLSearchParams(location.search).get('cart-preview') === '1') localStorage.setItem('ua-visual-review-cart', '1');
const customerPage = /\/(perfil|mis-pedidos)(\/|$)/.test(location.pathname);
const productControls = new URLSearchParams(location.search).get('product-controls') === '1';
window.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (!url.includes('/api/')) return originalFetch(input, init);
  const path = new URL(url, location.origin).pathname;
  const json = (data: unknown) => new Response(JSON.stringify({ exito: true, data }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  const qaOrder = { id_pedido: 7001, identificador: 'QA-7001', tienda_id: 987654, estado: 'pendiente', estado_etiqueta: 'Pendiente', monto_total: '12990', descuento: '0', costo_envio: '0', fecha_creacion: '2026-10-10T12:00:00Z', nombre_contacto: 'Cliente de prueba', medio_pago: 'Transferencia', entrega: { metodo: 'Retiro' }, cantidad_productos: 1, items: [{ id_item_pedido: 1, producto_id: 1, nombre: 'Producto de prueba 1', cantidad: 1, precio_unitario: '12990', subtotal: '12990', sku: 'QA-1' }] };
  if (path === '/api/checkout/pedidos/') return json(qaOrder);
  if (path === '/api/pagos/activos/') return json({ transfer: { enabled: true, fields: { bank_name: 'Banco de ejemplo', account_type: 'Cuenta de prueba', account_number: 'QA-NO-REAL', holder_rut: 'NO-REAL', holder_name: 'Titular de ejemplo', confirmation_email: 'qa@example.test' } } });
  if (path === '/api/pedidos/seguimiento/') return json(qaOrder);
  if (path === '/api/mi-cuenta/pedidos/') return json([qaOrder]);
  if (path === '/api/mi-cuenta/pedidos/7001/') return json(qaOrder);
  if (path.startsWith('/api/catalog/carrito/') && init?.method === 'DELETE') { localStorage.removeItem('ua-visual-review-cart'); return json([]); }
  if (path.includes('plantilla-seleccionada')) return json({ tienda_id: 987654, plantilla_seleccionada: 1 });
  if (path === '/api/auth/login/') return json({ token: 'visual-review-synthetic-token', user: { email: 'emprendedor@gmail.com', is_store_owner: true } });
  if (path.includes('emprendedor/perfil') || path === '/api/auth/me/') return json({ first_name: 'Revisión', last_name: 'Visual', email: 'qa@example.test', is_store_owner: !customerPage });
  if (path === '/api/auth/perfil/') return json({ first_name: 'Revisión', last_name: 'Visual', email: 'qa@example.test', phone: '' });
  if (path === '/api/catalog/carrito/items/' && init?.method === 'POST') {
    const request = JSON.parse(String(init.body));
    const item = {id_item_carrito:1,producto_id:1,slug:'prueba-1',nombre_producto:'Producto de prueba 1',precio_unitario:12990,cantidad:request.cantidad,sku:request.sku,imagen:image,stock_disponible:8,atributos:{talla:request.sku?.split('-').at(-1)}};
    localStorage.setItem('ua-visual-review-product-cart',JSON.stringify(item)); return json(item);
  }
  if (path === '/api/catalog/carrito/items/') { const item=localStorage.getItem('ua-visual-review-product-cart'); return json(item ? [JSON.parse(item)] : localStorage.getItem('ua-visual-review-cart') === '1' ? [{ id_item_carrito: 1, slug: 'prueba-1', nombre_producto: 'Producto de prueba 1', precio_unitario: 12990, cantidad: 1, sku: 'QA-1', imagen: image, stock_disponible: 8, atributos: {} }] : []); }
  if (path === '/api/entregas/alternativas/') return json({ pickup: { enabled: true, address: 'Dirección de prueba', schedule: 'Lunes a viernes' }, chilexpress: { enabled: false, accountId: '', apiKey: '', status: 'not_configured' }, starken: { enabled: false, accountId: '', apiKey: '', status: 'not_configured' } });
  if (path === '/api/catalog/productos/') return json(Array.from({ length: 6 }, (_, index) => ({ id: String(index + 1), slug: 'prueba-' + (index + 1), nombre: 'Producto de prueba ' + (index + 1), categoria: index % 2 ? 'Accesorios' : 'Ropa', imagen: image, precio: 12990 + index * 1000, precio_oferta: null, disponible: true })));
  const detail = path.match(/^\/api\/catalog\/productos\/prueba-(\d+)\/$/);
  if (/^\/api\/catalog\/productos\/prueba-\d+\/atributos\/$/.test(path)) return json({ atributos_generales: [{ clave: 'material', etiqueta: 'Material', valor: 'Material de prueba' }], atributos_variante: [] });
  if (detail) { const number = Number(detail[1]); return json({ id: String(number), slug: 'prueba-' + number, nombre: 'Producto de prueba ' + number, descripcion: 'Descripción de prueba', categoria: number % 2 ? 'Ropa' : 'Accesorios', imagenes: productControls ? [image,image,image] : [image], variantes: productControls ? ['M','L'].map(talla => ({sku: 'QA-'+number+'-'+talla,precio:12990,precio_oferta:null,stock:8,atributos_variante:[{clave:'talla',etiqueta:'Talla',valor:talla}]})) : [{ sku: 'QA-' + number, precio: 12990 + (number - 1) * 1000, precio_oferta: null, stock: 8, atributos_variante: [] }] }); }
  if (path === '/api/landing/configuracion/') return json({ id: 1, tienda: 987654, titulo: 'Tu próxima historia', descripcion: 'Datos sintéticos para revisar selección, diseño y persistencia local.', texto_boton: 'Ver productos', imagen_principal: image, logo: image, secciones: {}, contenido: { productos_destacados: ['1','2','3','4','5','6'], categorias: ['Ropa','Accesorios'], beneficios: [{ titulo: 'Envío disponible', descripcion: 'Contenido de prueba', icono: 'truck' }], contacto: { telefono: '+56 9 0000 0000', correo: 'qa@example.test', horario: '', whatsapp: '', instagram: '', facebook: '', sitio_web: '' }, ubicacion: { direccion: 'Dirección de prueba', comuna: 'Comuna', ciudad: 'Ciudad', region: 'Región', enlace_maps: '' } } });
  return json([]);
};
// Dedicated QA origin/entry; this token is only accepted by the fixture above.
localStorage.setItem('token', 'visual-review-synthetic-token');
// Explicit QA-only scenario: emulate old raw data before the real resolver reads it.
if (new URLSearchParams(location.search).get('legacy-branding') === '1') {
  const { readStoredStoreConfig, saveStoredStoreConfig } = await import('../../src/features/storefront/visual/storage');
  const identity = { apiBaseUrl: 'http://visual-review.example.test', storeId: '987654' };
  const current = readStoredStoreConfig(identity);
  const unsafe = { footer: { brandingVisible: false, showTitles: false }, topBar: { visible: false, height: 0 }, responsive: { mobile: { footer: { brandingVisible: false } } } };
  saveStoredStoreConfig({ ...current, visualConfig: unsafe, themeEditor: Object.fromEntries(['editorial','minimal','visual','catalog'].map(template => [template, { visualConfig: unsafe, images: { 'image-0': { src: image, scale: 0, radius: 100, x: 0, y: 0 } } }])) }, identity);
}
await import('/src/main.tsx');
