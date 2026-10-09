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
  let calls = [], response = {ok: true, json: async () => ({exito: true, data: {email: 'owner@example.com'}})};
  const {authService} = load('src/features/auth/services/authService.ts', {localStorage: {getItem: () => 'token', removeItem() {throw Error('Unexpected logout');}}, fetch: async (url, options) => {calls.push({url, options}); return response;}});
  await authService.getEntrepreneurProfile();
  await authService.updateEntrepreneurProfile('new@example.com');
  await authService.changeEntrepreneurPassword('old', 'new');
  assert.equal(calls[0].url, 'http://localhost:8000/api/auth/emprendedor/perfil/');
  assert.equal(calls[0].options.headers.Authorization, 'Token token');
  assert.equal(calls[1].options.body, '{"email":"new@example.com"}');
  assert.equal(calls[1].options.method, 'PATCH');
  assert.equal(calls[2].options.body, '{"current_password":"old","new_password":"new"}');
  response = {ok: false, json: async () => ({exito: false, mensaje: 'Acceso denegado'})};
  await assert.rejects(authService.getEntrepreneurProfile(), /Acceso denegado/);

  let states = [], index = 0, effects = [], deny = false, token = 'token';
  const jsx = (type, props) => ({type, props});
  const service = {hasSession: () => !!token, getEntrepreneurProfile: async () => {if (deny) throw Error('Denied'); return {email: 'owner@example.com'};}};
  const {RequireAdmin} = load('src/features/admin/auth/RequireAdmin.tsx', {localStorage: {getItem: () => token}, require: id => {
    if (id === 'react/jsx-runtime') return {jsx, jsxs: jsx};
    if (id === 'react') return {useState: initial => {const i = index++; if (!(i in states)) states[i] = initial; return [states[i], value => {states[i] = value;}];}, useEffect: effect => effects.push(effect)};
    if (id === 'react-router-dom') return {Navigate: 'Navigate', Outlet: 'Outlet', useLocation: () => ({pathname: '/admin'})};
    if (id.includes('authService')) return {authService: service};
    throw Error(id);
  }});
  async function renderGuard() {
    states = []; index = 0; effects = [];
    assert.equal(RequireAdmin().props.role, 'status'); // No panel mientras se verifica.
    effects[0](); await new Promise(setImmediate); index = 0; return RequireAdmin();
  }
  assert.equal((await renderGuard()).type, 'Outlet');
  deny = true;
  assert.equal((await renderGuard()).props.to, '/plantilla/1');
  token = null;
  assert.equal((await renderGuard()).props.to, '/plantilla/1/ingresar');

  // Vista emprendedor: datos remotos, persistencia confirmada y errores visibles.
  let fail = false, savedEmail, changedPassword;
  Object.assign(service, {getSessionStartedAt: () => null, updateEntrepreneurProfile: async email => {if (fail) throw Error('No guardado'); savedEmail = email; return {email};}, changeEntrepreneurPassword: async (old, next) => {changedPassword = [old, next];}});
  const {default: Profile} = load('src/features/admin/pages/Profile.tsx', {require: id => {
    if (id === 'react-router-dom') return {useNavigate: () => () => {}};
    if (id.includes('AdminContext')) return {useAdmin: () => ({config: {template: 'editorial'}})};
    if (id.includes('navigation')) return {templatePaths: {editorial: '/plantilla/1'}};
    if (id === 'react/jsx-runtime') return {jsx, jsxs: jsx, Fragment: 'Fragment'};
    if (id === 'react') return {useState: initial => {const i = index++; if (!(i in states)) states[i] = initial; return [states[i], value => {states[i] = value;}];}, useEffect: effect => effects.push(effect)};
    if (id.includes('authService')) return {authService: service};
    if (id.includes('components/ui')) return {Input: 'Input', Button: 'Button', Alert: 'Alert'};
    throw Error(id);
  }});
  function nodes(tree, out = []) {if (Array.isArray(tree)) tree.forEach(x => nodes(x, out)); else if (tree && typeof tree === 'object') {out.push(tree); nodes(tree.props?.children, out);} else if (typeof tree === 'string') out.push(tree); return out;}
  function renderProfile() {index = 0; return nodes(Profile());}
  deny = false; states = []; effects = []; renderProfile(); effects[0](); await new Promise(setImmediate);
  let tree = renderProfile(); assert.ok(tree.some(x => x.type === 'Input' && x.props.value === 'owner@example.com'));
  tree.find(x => x.type === 'Input').props.onChange({target: {value: 'edited@example.com'}});
  await renderProfile().find(x => x.type === 'form').props.onSubmit({preventDefault() {}});
  assert.equal(savedEmail, 'edited@example.com'); assert.ok(renderProfile().includes('Correo actualizado.'));
  fail = true; await renderProfile().find(x => x.type === 'form').props.onSubmit({preventDefault() {}});
  assert.ok(renderProfile().includes('No guardado')); assert.ok(!renderProfile().includes('Correo actualizado.'));
  tree = renderProfile(); const inputs = tree.filter(x => x.type === 'Input');
  inputs[1].props.onChange({target: {value: 'old'}}); inputs[2].props.onChange({target: {value: 'new'}});
  await renderProfile().filter(x => x.type === 'form')[1].props.onSubmit({preventDefault() {}});
  assert.deepEqual(changedPassword, ['old', 'new']); assert.ok(renderProfile().includes('Contrasena actualizada.'));
  console.log('OK: contrato Token emprendedor, guard propietario/cliente/visitante y formulario remoto con errores.');
})().catch(error => {console.error(error); process.exitCode = 1;});
