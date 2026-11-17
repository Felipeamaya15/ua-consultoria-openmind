const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function harness(replies, gateway = 'mercadopago') {
  const states = [], refs = [], effects = [], storage = new Map();
  let stateIndex, refIndex, calls = 0;
  const jsx = (type, props) => ({type, props});
  const module = {exports: {}};
  const service = async () => {const reply = replies[calls++]; if (reply instanceof Error) throw reply; return reply;};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,
    '../src/features/storefront/pages/ExternalPaymentReturnResult.tsx'), 'utf8'), {
    compilerOptions: {module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX},
  }).outputText, {module, exports: module.exports, Number, JSON,
    sessionStorage: {getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value)},
    require(name) {
      if (name === 'react') return {
        useState(value) {const i = stateIndex++; if (!(i in states)) states[i] = value;
          return [states[i], next => states[i] = typeof next === 'function' ? next(states[i]) : next];},
        useRef(value) {const i = refIndex++; return refs[i] ||= {current: value};},
        useEffect(fn) {effects.push(fn);},
      };
      if (name === 'react/jsx-runtime') return {jsx, jsxs: jsx};
      if (name === 'react-router-dom') return {Link: 'Link'};
      if (name.endsWith('/ui')) return {Button: 'Button'};
      if (name.includes('useStorefrontTemplate')) return {useStorefrontTemplate: () => ({route: p => '/' + p})};
      if (name.includes('mercadoPagoPaymentService')) return {mercadoPagoPaymentService: {confirmarPago: service}};
      if (name.includes('paypalPaymentService')) return {paypalPaymentService: {capturarPago: service}};
      throw Error(name);
    },
  });
  function render() {stateIndex = refIndex = 0; return module.exports.default({gateway, orderNumber: 'ORDER', tiendaId: 2, reference: 'REF'});}
  return {render, calls: () => calls, storage, async flush() {for (const effect of effects.splice(0)) effect(); await new Promise(resolve => setImmediate(resolve));}};
}
function nodes(tree) {return !tree ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [tree];}

for (const gateway of ['mercadopago', 'paypal']) test(`${gateway}: un error permite verificar el mismo pago sin volver al checkout`, async () => {
  const h = harness([new Error('network'), {exito: true, data: {}}], gateway);
  h.render(); await h.flush();
  const tree = nodes(h.render());
  assert.equal(tree.filter(n => n?.props?.to === '/compra').length, 0);
  const button = tree.find(n => n?.type === 'Button' && n.props.children === 'Volver a verificar el pago');
  assert.ok(button); button.props.onClick();
  h.render(); await h.flush();
  assert.equal(h.calls(), 2);
  assert.ok(nodes(h.render()).some(n => typeof n === 'string' && n.includes('Pago aprobado')));
  assert.ok(h.storage.has(`${gateway}-result:2:ORDER:REF`));
});

test('Mercado Pago: un pago pendiente puede pasar a aprobado al verificar', async () => {
  const h = harness([{exito: false, error: {codigo: 'PAGO_PENDIENTE'}}, {exito: true}]);
  h.render(); await h.flush();
  const tree = nodes(h.render());
  assert.ok(tree.some(n => typeof n === 'string' && n.includes('No repitas el pago')));
  tree.find(n => n?.type === 'Button').props.onClick();
  h.render(); await h.flush();
  assert.equal(h.calls(), 2);
  assert.ok(nodes(h.render()).some(n => typeof n === 'string' && n.includes('Pago aprobado')));
});
