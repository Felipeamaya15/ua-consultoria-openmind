// SCRUM-434: las variables y los textos por defecto de la pantalla de correos coinciden con los del backend.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict'), ts = require('typescript');
const root = path.resolve(__dirname, '..');

function load(relative) {
  const file = path.resolve(root, relative), module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports });
  return module.exports;
}
const same = (actual, expected, message) => assert.deepEqual(JSON.parse(JSON.stringify(actual)), JSON.parse(JSON.stringify(expected)), message);
let passed = 0;
function test(name, fn) { fn(); console.log('OK ' + name); passed++; }

// Si cambia VARIABLES_PERMITIDAS o TIPOS en backend/apps/core/domain/plantillas_correo, hay que cambiar esto y la pantalla.
const VARIABLES_DEL_BACKEND = ['customerName', 'customerEmail', 'orderNumber', 'orderTotal', 'shippingMethod', 'carrier', 'trackingCode', 'trackingLink', 'storeName'];
const TIPOS_DEL_BACKEND = ['order_received', 'order_shipped', 'payment_rejected', 'payment_success'];

const pantalla = fs.readFileSync(path.join(root, 'src/features/admin/pages/Emails.tsx'), 'utf8').replace(/\r/g, '');
const listaDeLaPantalla = (pantalla.match(/const variables = \[([\s\S]*?)\]/) || [])[1];
const variablesDeLaPantalla = [...(listaDeLaPantalla || '').matchAll(/"(\{\{\w+\}\})"/g)].map(m => m[1]);
const { createDefaultEmailTemplates, emailTemplateDefinitions } = load('src/features/admin/data/emailTemplates.ts');
const porDefecto = createDefaultEmailTemplates();
const usadas = texto => [...texto.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map(m => m[1]);

test('la pantalla ofrece exactamente las mismas variables que el backend', () => {
  assert.ok(listaDeLaPantalla, 'no se encontró la lista de variables de la pantalla');
  same([...variablesDeLaPantalla].sort(), VARIABLES_DEL_BACKEND.map(nombre => `{{${nombre}}}`).sort());
});

test('ninguna variable de la pantalla se repite', () => {
  assert.equal(new Set(variablesDeLaPantalla).size, variablesDeLaPantalla.length);
});

test('la pantalla maneja los mismos tipos de correo que el backend', () => {
  same(Object.keys(porDefecto).sort(), TIPOS_DEL_BACKEND);
  same(Object.keys(emailTemplateDefinitions).sort(), TIPOS_DEL_BACKEND);
});

test('los textos por defecto de la pantalla solo usan variables permitidas', () => {
  for (const [tipo, plantilla] of Object.entries(porDefecto)) {
    const desconocidas = usadas(`${plantilla.subject}\n${plantilla.preheader}\n${plantilla.body}`).filter(v => !VARIABLES_DEL_BACKEND.includes(v));
    same(desconocidas, [], tipo);
  }
});

test('el correo de despacho trae por defecto el mismo texto que el backend, con el enlace de seguimiento', () => {
  const despacho = porDefecto.order_shipped;
  assert.equal(despacho.enabled, true);
  assert.equal(despacho.subject, 'Tu pedido ya fue despachado · {{orderNumber}}');
  assert.equal(despacho.preheader, 'Tu compra va en camino.');
  assert.equal(despacho.body, 'Hola {{customerName}},\n\n'
    + 'Tu pedido {{orderNumber}} ya fue despachado y va en camino.\n\n'
    + 'Transportista: {{carrier}}\n'
    + 'Código de seguimiento: {{trackingCode}}\n\n'
    + 'Revisa el estado de tu pedido aquí (te pediremos el correo con el que compraste): {{trackingLink}}\n\n'
    + 'Gracias por comprar en {{storeName}}.');
});

test('los textos por defecto no tienen saltos de línea de más ni espacios al final', () => {
  for (const [tipo, plantilla] of Object.entries(porDefecto)) {
    assert.ok(!/\n{3,}/.test(plantilla.body), tipo);
    assert.equal(plantilla.body, plantilla.body.trim(), tipo);
    assert.equal(plantilla.subject, plantilla.subject.trim(), tipo);
  }
});

console.log(`\n${passed} pruebas OK`);
