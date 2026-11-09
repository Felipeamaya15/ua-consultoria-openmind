// Solo QA local. Contratos: responses.py, store_configuration.py, legal.py,
// recent_orders.py, promotions.py y serializers de catálogo. Todos los datos son ficticios.
const http = require('node:http');
const id = '000000000000000000000001';
const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
const initial = () => ({
  business: { nombre: 'Tienda QA', descripcion: 'Solo pruebas' },
  landing: { id: 1, tienda: 1, titulo: 'Portada QA', descripcion: 'Bienvenidos', texto_boton: 'Ver productos', logo: null, imagen_principal: null, secciones: {}, contenido: {} },
  product: { id, revision: 1, nombre: 'Producto QA', descripcion: 'Descripción de prueba', categoria: 'Pruebas', activo: true, imagenes: [pixel], variantes: [{ sku: 'QA-UNO', precio: 10000, precio_oferta: null, stock: 4, atributos_variante: [] }], seo: {} },
  promotions: [], orderStatus: 'pagado', emailFailed: false, counts: {}, failBusiness: false, failLanding: false, failLegal: false, failPayment: false, failEmails: false, delay: 0,
  emailTemplates: Object.fromEntries(['order_received', 'payment_success', 'order_shipped', 'order_delivered', 'order_cancelled'].map(type => [type, { enabled: true, subject: 'Asunto QA', preheader: 'Vista previa QA', body: 'Hola {{customerName}}' }])),
  ownerEmail: 'owner@example.test', transfers: [], legalPages: legalPages(),
  shipping: { chilexpress: { enabled: false, accountId: '', apiKey: '', status: 'not_configured', tarifas: [] }, starken: { enabled: false, accountId: '', apiKey: '', status: 'not_configured', tarifas: [] }, pickup: { enabled: false, address: '', schedule: '' } },
});
const legalPages = () => Object.fromEntries(['terms', 'privacy', 'refund', 'cookies'].map(type => [type, { title: type, published: 'Contenido legal QA', draft: 'Contenido legal QA', version: 1, lastPublished: null, historial: [] }]));
const labels = { pendiente: 'Pendiente', en_origen: 'En origen', en_reparto: 'En reparto', pagado: 'Pagado', preparando: 'En preparación', enviado: 'Despachado', entregado: 'Entregado', cancelado: 'Cancelado' };
const counts = {};
const order = state => ({ id_pedido: 7, identificador: 'QA-7', nombre_contacto: 'Cliente QA', correo_contacto: 'qa@example.test', monto_total: '10000.00', costo_envio: '0.00', descuento: '0.00', estado: state.orderStatus, estado_etiqueta: labels[state.orderStatus], fecha_creacion: '2026-10-20T12:00:00Z', metodo_pago: 'Transferencia', pago_estado: 'confirmado', moneda: 'CLP', items: [] });
http.createServer(async (req, res) => {
  let path = new URL(req.url, 'http://qa.test').pathname.replace(/^\/openmind/, '');
  if (path.startsWith('/api/') && !path.endsWith('/')) path += '/';
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,POST,PATCH,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  const json = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
  const ok = (data, mensaje = '', extra = {}) => json(200, { exito: true, data, mensaje, ...extra });
  const fail = status => json(status, { exito: false, mensaje: 'No se pudo guardar.', error: { codigo: 'QA_ERROR', detalles: { nombre: ['Revisa el nombre ingresado.'] } } });
  try {
    let state = await pm.state.get('feedback.state') || initial();
    if (path === '/__qa/state') {
      if (req.method === 'POST') { if (req.body?.reset) Object.keys(counts).forEach(key => delete counts[key]); state = req.body?.reset ? initial() : { ...state, ...req.body }; await pm.state.set('feedback.state', state); }
      return ok({ ...state, counts });
    }
    if (path.startsWith('/__qa/error/')) {
      const status = Number(path.split('/').pop());
      if (status === 200) { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end('<html>invalid</html>'); }
      if (status === 408) { setTimeout(() => ok({}), 500); return; }
      return fail(status);
    }
    const key = req.method + ' ' + path;
    counts[key] = (counts[key] || 0) + 1;
    if (req.method !== 'GET' && state.delay) await new Promise(resolve => setTimeout(resolve, state.delay));
    if (req.method !== 'GET' && state.writeStatus) return fail(state.writeStatus);
    if (path === '/api/auth/me/') return ok({ id: 7, username: 'qa', is_staff: false, is_store_owner: true });
    if (path === '/api/pagos/mi-tienda/') return ok({ id_tienda: 1 });
    if (path === '/api/pagos/transferencias/pendientes/') return ok(state.transfers);
    if (/^\/api\/pagos\/transferencias\/\d+\/(aprobar|rechazar)\/$/.test(path)) {
      const pedidoId = Number(path.split('/')[4]), row = state.transfers.find(row => row.id_pedido === pedidoId);
      if (!row) return fail(404);
      state.transfers = state.transfers.filter(row => row.id_pedido !== pedidoId);
      const estado = path.includes('/aprobar/') ? 'pagado' : 'cancelado'; await pm.state.set('feedback.state', state);
      return ok({ id_pedido: pedidoId, estado }, estado === 'pagado' ? 'Transferencia aprobada correctamente.' : 'Transferencia rechazada correctamente.');
    }
    if (path === '/api/entregas/retiro/direcciones/') return ok({ configured: false });
    if (path === '/api/entregas/configuracion/') {
      if (req.method === 'PUT') { state.shipping = req.body; await pm.state.set('feedback.state', state); }
      return ok(state.shipping);
    }
    if (path === '/api/tienda/contactos/exportar/') {
      if (state.failExport) return fail(503);
      res.writeHead(200, { 'Content-Type': 'text/csv;charset=utf-8', 'Content-Disposition': 'attachment; filename="contactos-qa.csv"' });
      return res.end('email,cantidad_pedidos\r\ncliente@example.test,1\r\n');
    }
    if (path === '/api/tienda/contactos/') return ok([{ email: 'cliente@example.test', cantidad_pedidos: 1, ultimo_pedido: '2026-10-20T12:00:00Z', consentimiento: 'autorizado', fecha_consentimiento: '2026-10-20T12:00:00Z' }], '', { paginacion: { pagina: 1, tamano: 20, total: 1, total_paginas: 1 } });
    if (path === '/api/pagos/configuracion/') return ok({ transfer: { enabled: false, fields: {} }, linkify: { enabled: false, fields: {} } });
    if (/\/api\/catalog\/tiendas\/1\/configuracion\/(transbank|paypal|mercadopago)\//.test(path)) {
      if (req.method !== 'GET' && state.failPayment) return fail(503);
      return ok({ activo: false, configurado: false, ambiente: path.includes('transbank') ? 'INTEGRACION' : 'SANDBOX', codigo_comercio: '', client_id: '', public_key: '', api_key_enmascarada: '', client_secret_enmascarado: '', access_token_enmascarado: '' });
    }
    if (path === '/api/tienda/correos/') {
      if (req.method === 'PUT') { if (state.failEmails) return fail(503); state.emailTemplates = req.body.plantillas; await pm.state.set('feedback.state', state); }
      return ok({ plantillas: state.emailTemplates, por_defecto: state.emailTemplates });
    }
    if (path === '/api/auth/emprendedor/perfil/') {
      if (req.method === 'PATCH') { state.ownerEmail = req.body.email; await pm.state.set('feedback.state', state); }
      return ok({ email: state.ownerEmail, first_name: 'QA', last_name: 'Pruebas', phone: '' });
    }
    if (path === '/api/visual-config/plantilla-seleccionada/') return ok({ tienda_id: 1, plantilla_seleccionada: 'minimal' });
    if (path === '/api/tienda/configuracion/') {
      if (req.method === 'PUT') { if (state.failBusiness) return fail(422); state.business = req.body; await pm.state.set('feedback.state', state); }
      return ok(state.business);
    }
    if (path === '/api/landing/configuracion/') {
      if (req.method === 'PUT') {
        if (state.failLanding) return fail(503);
        let input = req.body || {};
        if (typeof input === 'string') {
          const boundary = req.headers['content-type']?.match(/boundary=(?:"([^"]+)"|([^;]+))/)?.slice(1).find(Boolean), fields = {};
          if (boundary) for (const part of input.split('--' + boundary)) {
            const split = part.indexOf('\r\n\r\n'), name = part.slice(0, split).match(/name="([^"]+)"/)?.[1];
            if (split >= 0 && name) fields[name] = part.slice(split + 4).replace(/\r\n$/, '');
          }
          input = fields;
        }
        if (!input.titulo?.trim() || !input.texto_boton?.trim()) return fail(400);
        for (const key of ['titulo', 'descripcion', 'texto_boton']) state.landing[key] = input[key];
        for (const key of ['secciones', 'contenido']) if (input[key] !== undefined) state.landing[key] = typeof input[key] === 'string' ? JSON.parse(input[key]) : input[key];
        await pm.state.set('feedback.state', state);
      }
      return ok(state.landing);
    }
    if (path === '/api/catalog/productos/admin/listado/') return ok([state.product]);
    if (path === '/api/catalog/productos/') return ok([]);
    if (path === '/api/catalog/productos/crear/') {
      const data = req.body;
      state.product = { ...state.product, ...data }; await pm.state.set('feedback.state', state); return ok(state.product);
    }
    if (path === `/api/catalog/productos/${id}/eliminar/`) { state.product.activo = false; await pm.state.set('feedback.state', state); return ok(null); }
    if (path === `/api/catalog/productos/${id}/admin/` || path === `/api/catalog/productos/${id}/actualizar/`) {
      if (req.method !== 'GET') { state.product = { ...state.product, ...req.body, revision: state.product.revision + 1 }; await pm.state.set('feedback.state', state); }
      return ok(state.product);
    }
    if (path.startsWith('/api/promociones/')) {
      const promoId = Number(path.split('/')[3]);
      if (req.method === 'POST') { const row = { id: 1, ...req.body, usedCount: 0 }; state.promotions.push(row); await pm.state.set('feedback.state', state); return ok(row); }
      if (req.method === 'PATCH') { const row = state.promotions.find(row => row.id === promoId); if (!row) return fail(404); Object.assign(row, req.body); await pm.state.set('feedback.state', state); return ok(row); }
      if (req.method === 'DELETE') { state.promotions = state.promotions.filter(row => row.id !== promoId); await pm.state.set('feedback.state', state); return ok(null); }
      return ok(state.promotions);
    }
    if (path === '/api/tienda/pedidos/historial/') return ok([order(state)], '', { paginacion: { pagina: 1, tamano: 20, total: 1, total_paginas: 1 } });
    if (path === '/api/tienda/pedidos/7/detalle/') return ok(order(state));
    if (path === '/api/tienda/pedidos/7/estado/') {
      state.orderStatus = req.body.estado; await pm.state.set('feedback.state', state);
      return ok({ ...order(state), correo: { enviado: !state.emailFailed, codigo: state.emailFailed ? 'error_de_envio' : 'enviado' } });
    }
    if (path.startsWith('/api/legal/')) {
      if (state.failLegal) return fail(503);
      if (req.method !== 'GET') {
        const type = req.body.tipo, item = state.legalPages[type];
        if (!item) return fail(400);
        if (path.endsWith('/publicar/')) {
          if (typeof req.body.content !== 'string' || !req.body.content.trim()) return fail(400);
          item.published = req.body.content; item.draft = req.body.content; item.version += 1;
          item.lastPublished = new Date().toISOString();
          item.historial.push({ version: item.version, content: item.published, fecha_vigencia: item.lastPublished });
        } else item.draft = req.body.accion === 'restore' ? 'Contenido legal QA' : req.body.draft;
        await pm.state.set('feedback.state', state); return ok(state.legalPages);
      }
      if (path.includes('/configuracion/')) return ok(state.legalPages);
      const published = Object.fromEntries(Object.entries(state.legalPages).map(([type, { draft, historial, ...page }]) => [type, page]));
      const type = path.split('/').filter(Boolean).at(-1);
      return ok(published[type] || published);
    }
    if (path === '/api/categorias/' || path === '/api/catalog/categorias/') return ok([]);
    return json(501, { exito: false, mensaje: 'Ruta fuera del contrato de esta prueba.' });
  } catch { json(500, { exito: false, mensaje: 'Falló el entorno de prueba.' }); }
}).listen(process.env.PORT);
