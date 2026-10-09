const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict'), ts = require('typescript');
const root = path.resolve(__dirname, '..');
function load(file, globals) {
  const module = {exports: {}};
  const source = fs.readFileSync(path.join(root, file), 'utf8').replace('import.meta.env.VITE_API_URL', 'undefined');
  vm.runInNewContext(ts.transpileModule(source, {compilerOptions: {target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX}}).outputText, {module, exports: module.exports, Error, sessionStorage: {getItem: () => null}, ...globals});
  return module.exports;
}
(async () => {
  let calls = [], reply, token = 'buyer-token';
  const real = {id_pedido: 42, fecha_creacion: '2026-10-02T12:00:00Z', estado: 'enviado', estado_etiqueta: 'Enviado', monto_total: '40.00', cantidad_productos: 2,
    items: [{id_item_pedido: 1, producto_id: 2, nombre: 'Producto real', cantidad: 2, precio_unitario: '20.00', subtotal: '40.00'}]};
  const {authService} = load('src/features/auth/services/authService.ts', {localStorage: {getItem: () => token, removeItem: () => {token = null;}}, fetch: async (url, options) => {calls.push({url, options}); return reply;}});
  reply = {ok: true, json: async () => ({exito: true, data: [real]})};
  assert.equal((await authService.getCustomerOrders())[0].id_pedido, 42);
  assert.equal(calls[0].url, 'http://localhost:8000/api/mi-cuenta/pedidos/');
  assert.equal(calls[0].options.headers.Authorization, 'Token buyer-token');
  reply = {ok: true, json: async () => ({exito: true, data: real})};
  assert.equal((await authService.getCustomerOrder('42')).items[0].nombre, 'Producto real');
  assert.equal(calls[1].url, 'http://localhost:8000/api/mi-cuenta/pedidos/42/');
  await assert.rejects(authService.getCustomerOrder('../43'), /Pedido no encontrado/);
  reply = {ok: false, json: async () => ({mensaje: 'No encontrado'})};
  await assert.rejects(authService.getCustomerOrder('43'), /No encontrado/);
  token = null; const count = calls.length;
  await assert.rejects(authService.getCustomerOrders(), /Inicia sesión/);
  assert.equal(calls.length, count);

  let states = [], index = 0, effects = [], data = [], id, fail = false, template = 1;
  const jsx = (type, props) => ({type, props});
  const service = {getCustomerOrders: async () => {if (fail) throw Error('No disponible'); return data;}, getCustomerOrder: async requested => {assert.equal(requested, '42'); return real;}};
  const requireMock = name => {
    if (name === 'react/jsx-runtime') return {jsx, jsxs: jsx};
    if (name === 'react') return {useState: initial => {const i = index++; if (!(i in states)) states[i] = initial; return [states[i], value => {states[i] = value;}];}, useEffect: effect => effects.push(effect)};
    if (name === 'react-router-dom') return {Link: 'Link', NavLink: 'NavLink', useParams: () => ({id})};
    if (name.includes('authService')) return {authService: service};
    if (name.includes('useStorefrontTemplate')) return {useStorefrontTemplate: () => ({route: p => '/plantilla/' + template + '/' + p})};
    if (name.includes('CustomerAccountNavigation')) return {CustomerAccountNavigation: 'AccountNav'};
    throw Error(name);
  };
  const {default: Orders} = load('src/features/storefront/pages/CustomerOrders.tsx', {require: requireMock});
  function nodes(tree, out = []) {if (Array.isArray(tree)) tree.forEach(x => nodes(x, out)); else if (tree && typeof tree === 'object') {out.push(tree); nodes(tree.props?.children, out);} else if (typeof tree === 'string') out.push(tree); return out;}
  async function render() {states = []; index = 0; effects = []; Orders(); effects[0](); await new Promise(setImmediate); index = 0; return nodes(Orders());}
  assert.ok((await render()).includes('Aún no tienes pedidos.'));
  data = [real];
  for (template of [1, 2, 3, 4]) {
    const tree = await render();
    assert.ok(tree.includes('Enviado'));
    assert.ok(tree.includes('40.00'));
    assert.ok(tree.some(n => n.type === 'Link' && n.props.to === `/plantilla/${template}/mis-pedidos/42`));
  }
  id = '42';
  assert.ok((await render()).includes('Producto real'));
  id = undefined; fail = true;
  const tree = await render(); assert.ok(tree.includes('No disponible')); assert.ok(!tree.includes('Aún no tienes pedidos.'));
  const {CustomerAccountNavigation} = load('src/features/storefront/components/store/CustomerAccountNavigation.tsx', {require: requireMock});
  assert.ok(nodes(CustomerAccountNavigation()).includes('Mis pedidos'));
  const routes = fs.readFileSync(path.join(root, 'src/app/router/index.tsx'), 'utf8');
  for (const route of ['mis-pedidos', 'mis-pedidos/:id']) assert.ok(routes.includes(`path: '${route}', element: <RequireCustomer>`));

  // Pedidos del propietario: mismo array del backend, base configurada y errores visibles.
  const storeOrder = {id_pedido: 42, identificador: 'PEDIDO-42', nombre_contacto: 'Comprador', correo_contacto: 'buyer@example.test',
    monto_total: '40.00', estado: 'pendiente', fecha_creacion: '2026-10-02T12:00:00Z', metodo_pago: 'Transferencia',
    costo_envio: '0.00', descuento: '0.00', items: [{nombre_producto: 'Producto real', cantidad: 2, precio_unitario: '20.00'}]};
  let storeReply = {ok: true, json: async () => [storeOrder]}, storeToken = 'session-owner', storeCalls = [];
  const {default: StoreOrders} = load('src/features/admin/pages/Orders.tsx', {
    fetch: async (url, options) => {storeCalls.push({url, options}); return storeReply;},
    require: name => {
      if (name === 'react/jsx-runtime') return {jsx, jsxs: jsx};
      if (name === 'react') return requireMock(name);
      if (name.endsWith('/api')) return {API_BASE_URL: 'https://configured.example.test'};
      if (name.includes('authService')) return {authService: {getToken: () => storeToken}};
      if (name.includes('mockAdminData')) return {formatPrice: String};
      if (name.includes('components/ui')) return {Badge: 'Badge', Icon: 'Icon'};
      throw Error(name);
    },
  });
  async function renderStore() {
    states = []; index = 0; effects = []; StoreOrders(); effects[0]();
    await new Promise(setImmediate); index = 0; return nodes(StoreOrders());
  }
  assert.ok((await renderStore()).includes('Comprador'));
  assert.equal(storeCalls[0].url, 'https://configured.example.test/api/tienda/pedidos/');
  assert.equal(storeCalls[0].options.headers.Authorization, 'Token session-owner');
  for (const invalid of [{...storeOrder, fecha_creacion: 'invalid'}, {...storeOrder, monto_total: 'NaN'}, {...storeOrder, items: null}, {data: [storeOrder]}]) {
    storeReply = {ok: true, json: async () => Array.isArray(invalid.data) ? invalid : [invalid]};
    assert.ok((await renderStore()).some(node => node.props?.role === 'alert'));
  }
  storeReply = {ok: false};
  assert.ok((await renderStore()).includes('No se pudieron consultar los pedidos.'));
  storeToken = null;
  const beforeStore = storeCalls.length;
  assert.ok((await renderStore()).includes('Inicia sesión para consultar los pedidos.'));
  assert.equal(storeCalls.length, beforeStore);
  console.log('OK: pedidos cliente y propietario, contratos, Token, errores y navegación en cuatro plantillas protegidas.');
})().catch(error => {console.error(error); process.exitCode = 1;});
