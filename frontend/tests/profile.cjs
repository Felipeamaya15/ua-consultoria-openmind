const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict'), ts = require('typescript');
const root = path.resolve(__dirname, '..');
function load(file, globals) {
  const module = { exports: {} };
  const source = fs.readFileSync(path.join(root, file), 'utf8').replace('import.meta.env.VITE_API_URL', 'undefined');
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, Error, sessionStorage: {getItem: () => null}, ...globals });
  return module.exports;
}
async function run() {
  let token = 'existing-token', reply, calls = [];
  const profile = {first_name: 'Ana', last_name: 'Pérez', email: 'ana@example.com', phone: '+56 912345678'};
  const {authService} = load('src/features/auth/services/authService.ts', {
    localStorage: {getItem: () => token, removeItem: () => { throw Error('Token must remain'); }},
    fetch: async (url, options) => { calls.push({url, options}); return reply; },
  });
  reply = {ok: true, json: async () => ({exito: true, data: profile})};
  assert.equal((await authService.getProfile()).email, profile.email);
  assert.equal(calls[0].options.headers.Authorization, 'Token existing-token');
  await authService.updateProfile({phone: '123456789'});
  assert.equal(calls[1].options.method, 'PATCH');
  assert.equal(calls[1].options.body, '{"phone":"123456789"}');
  await authService.changePassword('old', 'new');
  assert.equal(calls[2].url, 'http://localhost:8000/api/auth/perfil/password/');
  assert.equal(calls[2].options.method, 'POST');
  reply = {ok: false, json: async () => ({exito: false, error: {detalles: {email: ['Email ocupado.']}}})};
  await assert.rejects(authService.updateProfile({email: 'taken@example.com'}), /Email ocupado/);
  reply = {ok: true, json: async () => ({exito: false, mensaje: 'No guardado'})};
  await assert.rejects(authService.updateProfile({}), /No guardado/);
  token = null;
  const count = calls.length;
  await assert.rejects(authService.getProfile(), /Inicia sesión/);
  assert.equal(calls.length, count);

  // Renderiza y ejecuta handlers con el mismo arnés ligero usado en las pruebas existentes.
  let states = [], index = 0, effects = [], rejectSave = false, release;
  const realProfile = { ...profile };
  const service = {
    getProfile: async () => realProfile,
    updateProfile: async data => { if (rejectSave) throw Error('Backend falló'); await new Promise(resolve => { release = resolve; }); return data; },
    changePassword: async () => {},
  };
  const jsx = (type, props) => ({type, props});
  const {default: Profile} = load('src/features/storefront/pages/Profile.tsx', {require: id => {
    if (id === 'react/jsx-runtime') return {jsx, jsxs: jsx};
    if (id === 'react') return {
      useState: initial => { const i = index++; if (!(i in states)) states[i] = initial; return [states[i], value => { states[i] = value; }]; },
      useEffect: effect => { effects.push(effect); },
    };
    if (id === 'react-router-dom') return {Link: 'Link'};
    if (id.includes('CustomerAccountNavigation')) return {CustomerAccountNavigation: 'AccountNav'};
    if (id.includes('authService')) return {authService: service};
    if (id.includes('useStorefrontTemplate')) return {useStorefrontTemplate: () => ({route: p => '/plantilla/1/' + p})};
    throw Error(id);
  }});
  function render() { index = 0; return Profile(); }
  function nodes(tree, result = []) {
    if (Array.isArray(tree)) tree.forEach(x => nodes(x, result));
    else if (tree && typeof tree === 'object') { result.push(tree); nodes(tree.props?.children, result); }
    else if (typeof tree === 'string') result.push(tree);
    return result;
  }
  render(); effects[0](); await new Promise(setImmediate);
  let tree = nodes(render());
  assert.ok(tree.some(n => n.type === 'input' && n.props.value === 'ana@example.com'));
  let form = tree.find(n => n.type === 'form');
  const saving = form.props.onSubmit({preventDefault() {}});
  assert.ok(!nodes(render()).includes('Perfil guardado correctamente.'));
  release(); await saving;
  assert.ok(nodes(render()).includes('Perfil guardado correctamente.'));
  rejectSave = true;
  form = nodes(render()).find(n => n.type === 'form');
  await form.props.onSubmit({preventDefault() {}});
  tree = nodes(render());
  assert.ok(tree.includes('Backend falló'));
  assert.ok(!tree.includes('Perfil guardado correctamente.'));
  console.log('Perfil: token, contrato, errores, carga real y feedback de guardado verificados.');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
