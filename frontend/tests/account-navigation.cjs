const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const assert = require('node:assert/strict'), ts = require('typescript');
const root = path.resolve(__dirname, '..');
let user = null, states = [], index = 0, effects = [], editorPreview = false, identityRequests = 0, templateId = 1;
const jsx = (type, props) => ({type, props});
const moduleObject = {exports: {}};
const source = fs.readFileSync(path.join(root, 'src/features/storefront/components/store/AccountNavigation.tsx'), 'utf8');
vm.runInNewContext(ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX}}).outputText, {
  module: moduleObject, exports: moduleObject.exports, require: id => {
    if (id === '../../visual/pages') return {isActiveEditorPreview: () => editorPreview};
    if (id === 'react/jsx-runtime') return {jsx, jsxs: jsx, Fragment: 'Fragment'};
    if (id === 'react') return {useState: initial => {const i = index++; if (!(i in states)) states[i] = initial; return [states[i], value => {states[i] = value;}];}, useEffect: effect => effects.push(effect)};
    if (id === 'react-router-dom') return {Link: 'Link', Navigate: 'Navigate', useLocation: () => ({pathname: '/plantilla/1/perfil'})};
    if (id.includes('authService')) return {authService: {getMe: async () => { identityRequests++; return user ? {data: user} : null; }}};
    if (id.includes('useStorefrontTemplate')) return {useStorefrontTemplate: () => ({route: (p = '') => `/plantilla/${templateId}${p ? '/' + p : ''}`})};
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
  for (const file of ['EditorialLayout.tsx', 'minimal/MinimalSidebar.tsx', 'CompactMobileNavigation.tsx', 'visual/VisualHeader.tsx', 'catalog/CatalogHeader.tsx']) {
    const header = fs.readFileSync(path.join(root, 'src/features/storefront/components/store', file), 'utf8');
    assert.ok(header.includes('<AccountNavigation'), file);
    assert.ok(!header.includes('to="perfil"') && !header.includes("route('perfil')"), file);
  }
  const storeRoot = 'src/features/storefront/components/store/';
  const header = fs.readFileSync(path.join(root, storeRoot, 'minimal/MinimalHeader.tsx'), 'utf8');
  const layout = fs.readFileSync(path.join(root, storeRoot, 'minimal/MinimalLayout.tsx'), 'utf8');
  assert.ok(layout.includes('<MinimalSidebar') && layout.includes('<MinimalHeader'), 'Plantilla 2 monta ambas modalidades');
  assert.ok(header.includes('<CompactMobileNavigation'), 'Encabezado conecta la navegación móvil');
  assert.ok(!header.includes('<AccountNavigation') && !header.includes('<nav'), 'Encabezado no duplica el menú de escritorio');
  assert.ok(!header.includes('to="perfil"') && !header.includes("route('perfil')"), 'Encabezado no evita el control compartido de identidad');
  const stylesheet = fs.readFileSync(path.join(root, 'src/styles/storefront.css'), 'utf8');
  assert.match(stylesheet, /@media\s*\(min-width:\s*768px\)\s*\{\s*\.store-mobile-navigation,[^{]+\{\s*display:\s*none\s*!important;/, 'Menú compacto se oculta en escritorio');


  const {load} = require('./source-loader.cjs');
  const nodes = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree)
    ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
  templateId = 2;
  for (const [file, name] of [['minimal/MinimalSidebar.tsx', 'MinimalSidebar'], ['CompactMobileNavigation.tsx', 'CompactMobileNavigation']]) {
    let logouts = 0, notifications = 0;
    const destinations = [], details = {open: true};
    const account = {AccountNavigation, useStorefrontIdentity: () => ({user, loading: false}), notifyStorefrontAuthChange: () => {notifications++;}};
    const template = {useStorefrontTemplate: () => ({route: (p = '') => '/plantilla/2' + (p ? '/' + p : '')})};
    const auth = {authService: {logout: () => {logouts++; user = null;}}};
    const component = load(storeRoot + file, {
      'react/jsx-runtime': {jsx, jsxs: jsx, Fragment: 'Fragment'},
      'react': {useRef: () => ({current: details}), useEffect: () => {}},
      'react-router-dom': {Link: 'Link', useLocation: () => ({pathname: '/plantilla/2/catalogo'}), useNavigate: () => destination => destinations.push(destination)},
      '../AccountNavigation': account, './AccountNavigation': account,
      '../../../hooks/useStorefrontTemplate': template, '../../hooks/useStorefrontTemplate': template,
      '../../../../auth/services/authService': auth, '../../../auth/services/authService': auth,
      '../../ui': {Icon: 'Icon'},
    })[name];
    for (const [identity, label, destination] of [
      [null, 'Iniciar sesión', '/plantilla/2/ingresar'],
      [{is_staff: false, is_store_owner: false}, 'Mi cuenta', '/plantilla/2/perfil'],
      [{is_staff: false, is_store_owner: true}, 'Volver al panel', '/emprendedor'],
      [{is_staff: true, is_store_owner: true}, 'Volver al panel', '/emprendedor'],
      [{is_staff: true, is_store_owner: false}, null, null],
    ]) {
      user = identity;
      const tree = component(), all = nodes(tree);
      if (name === 'MinimalSidebar') assert.match(tree.props.className, /\bhidden md:flex\b/, 'Barra lateral solo en escritorio');
      else assert.equal(tree.props.className, 'store-mobile-navigation');
      const accounts = all.filter(node => node.type === AccountNavigation);
      assert.equal(accounts.length, 1, `${name}: un único acceso con control de roles`);
      const link = await settled(accounts[0].type, accounts[0].props);
      if (label === null) assert.equal(link, null, `${name}: staff sin tienda no recibe perfil comprador`);
      else {assert.equal(link.props.children, label); assert.equal(link.props.to, destination);}
      const buttons = all.filter(node => node.type === 'button' && node.props.children === 'Salir');
      assert.equal(buttons.length, identity ? 1 : 0, `${name}: cierre de sesión solo para autenticados`);
      if (identity) {
        details.open = true;
        const before = logouts;
        buttons[0].props.onClick();
        assert.equal(logouts, before + 1);
        assert.equal(notifications, logouts);
        assert.equal(destinations.at(-1), '/plantilla/2');
        if (name === 'CompactMobileNavigation') assert.equal(details.open, false, 'Salir cierra menú móvil');
        const loggedOut = nodes(component());
        assert.equal(loggedOut.filter(node => node.type === 'button' && node.props.children === 'Salir').length, 0);
        const accountAfter = loggedOut.find(node => node.type === AccountNavigation);
        assert.equal((await settled(accountAfter.type, accountAfter.props)).props.children, 'Iniciar sesión');
      }
    }
    console.log(`OK ${name}: visitante, cliente, propietario, staff y cierre de sesión.`);
  }
  templateId = 1;
  editorPreview = true; const beforePreview = identityRequests;
  assert.equal((await settled(AccountNavigation)).props.children, 'Iniciar sesión');
  assert.equal(identityRequests, beforePreview, 'Editor no consulta identidad real');
  console.log('OK: propietario/staff, cliente, visitante, guard de perfil y navegación de las cuatro plantillas.');
})().catch(error => {console.error(error); process.exitCode = 1;});


(async () => {
  const local = new Map([['token', 'qa-session-only'], ['entrepreneur_session_started_at', '2026-11-10'], ['cookie-preferences', 'preservar']]);
  const session = new Map([['token', 'qa-tab-session-only']]);
  const storage = map => ({ getItem: key => map.get(key) ?? null, removeItem: key => map.delete(key), setItem: (key, value) => map.set(key, value) });
  const { authService } = require('./source-loader.cjs').load('src/features/auth/services/authService.ts', {
    '../../../shared/services/apiRequest': {},
  }, { localStorage: storage(local), sessionStorage: storage(session), fetch: () => { throw new Error('Logged-out identity must not make requests'); } });
  assert.equal(authService.hasSession(), true);
  authService.logout();
  assert.equal(authService.hasSession(), false);
  assert.equal(authService.getSessionStartedAt(), null);
  assert.equal(session.has('token'), false);
  assert.equal(local.get('cookie-preferences'), 'preservar');
  assert.equal(await authService.getMe(), null);
  console.log('OK cierre de sesión: limpia tokens locales y de pestaña, conserva preferencias y no consulta identidad sin sesión.');
})().catch(error => { console.error(error); process.exitCode = 1; });
