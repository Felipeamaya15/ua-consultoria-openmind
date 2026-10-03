const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const assert = require('node:assert/strict'), ts = require('typescript');
const root = path.resolve(__dirname, '..');
let user = null, states = [], index = 0, effects = [];
const jsx = (type, props) => ({type, props});
const moduleObject = {exports: {}};
const source = fs.readFileSync(path.join(root, 'src/features/storefront/components/store/AccountNavigation.tsx'), 'utf8');
vm.runInNewContext(ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX}}).outputText, {
  module: moduleObject, exports: moduleObject.exports, require: id => {
    if (id === 'react/jsx-runtime') return {jsx, jsxs: jsx, Fragment: 'Fragment'};
    if (id === 'react') return {useState: initial => {const i = index++; if (!(i in states)) states[i] = initial; return [states[i], value => {states[i] = value;}];}, useEffect: effect => effects.push(effect)};
    if (id === 'react-router-dom') return {Link: 'Link', Navigate: 'Navigate', useLocation: () => ({pathname: '/plantilla/1/perfil'})};
    if (id.includes('authService')) return {authService: {getMe: async () => user ? {data: user} : null}};
    if (id.includes('useStorefrontTemplate')) return {useStorefrontTemplate: () => ({route: p => '/plantilla/1/' + p})};
    throw Error(id);
  },
});
const {AccountNavigation, RequireCustomer} = moduleObject.exports;
async function settled(component, props = {}) {
  states = []; index = 0; effects = [];
  component(props); effects[0](); await new Promise(setImmediate);
  index = 0; return component(props);
}
(async () => {
  for (user of [{is_staff: true, is_store_owner: true}, {is_staff: false, is_store_owner: true}]) {
    const link = await settled(AccountNavigation);
    assert.equal(link.props.children, 'Volver al panel');
    assert.equal(link.props.to, '/emprendedor');
    assert.equal((await settled(RequireCustomer)).props.to, '/emprendedor');
  }
  user = {is_staff: false, is_store_owner: false, email: 'emprendedor@gmail.com'};
  assert.equal((await settled(AccountNavigation)).props.children, 'Mi cuenta');
  assert.equal((await settled(AccountNavigation)).props.to, '/plantilla/1/perfil');
  assert.equal((await settled(RequireCustomer, {children: 'Profile'})).props.children, 'Profile');
  user = {is_staff: true, is_store_owner: false};
  assert.equal(await settled(AccountNavigation), null);
  assert.equal((await settled(RequireCustomer)).props.role, 'alert');
  user = null;
  assert.equal((await settled(AccountNavigation)).props.children, 'Iniciar sesión');
  assert.equal((await settled(RequireCustomer)).props.to, '/plantilla/1/ingresar');
  for (const file of ['EditorialLayout.tsx', 'minimal/MinimalHeader.tsx', 'minimal/MinimalSidebar.tsx', 'visual/VisualHeader.tsx', 'catalog/CatalogHeader.tsx']) {
    const header = fs.readFileSync(path.join(root, 'src/features/storefront/components/store', file), 'utf8');
    assert.ok(header.includes('<AccountNavigation'), file);
    assert.ok(!header.includes('to="perfil"') && !header.includes("route('perfil')"), file);
  }
  console.log('OK: propietario/staff, cliente, visitante, guard de perfil y cinco headers.');
})().catch(error => {console.error(error); process.exitCode = 1;});
