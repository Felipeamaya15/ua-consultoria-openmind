/** Validación de navegación mediante teclado en tienda pública y panel de administración. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

function loadModule(relative, mocks = {}) {
  const file = path.resolve(root, relative);
  const module = { exports: {} };
  const jsx = (type, props) => ({ type, props });
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;

  const req = (id) => {
    if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' };
    if (id in mocks) return mocks[id];
    if (!id.startsWith('.')) return require(id);
    const resolved = path.resolve(path.dirname(file), id);
    const target = ['.ts', '.tsx'].map((ext) => resolved + ext).find(fs.existsSync) || path.join(resolved, 'index.ts');
    return loadModule(path.relative(root, target), mocks);
  };

  vm.runInNewContext(code, { module, exports: module.exports, require: req });
  return module.exports;
}

test('las cuatro plantillas y el panel de administración tienen contenedor principal enfocable y anillo de foco visible en cabeceras, pies y controles', () => {
  for (const layoutPath of [
    'src/features/storefront/components/store/EditorialLayout.tsx',
    'src/features/storefront/components/store/minimal/MinimalLayout.tsx',
    'src/features/storefront/components/store/visual/VisualLayout.tsx',
    'src/features/storefront/components/store/catalog/CatalogLayout.tsx',
  ]) {
    const layoutSource = read(layoutPath);
    assert.match(layoutSource, /<main[^>]*id="main-content"[^>]*tabIndex=\{-1\}/, layoutPath);
  }

  const adminLayout = read('src/features/admin/components/layout/AdminLayout.tsx');
  assert.match(adminLayout, /<main[^>]*id="admin-main-content"[^>]*tabIndex=\{-1\}/);

  const css = read('src/styles/storefront.css');
  assert.match(css, /\[data-storefront-visual\] :is\(a, button, input, select, textarea, summary, \[role="button"\], \[tabindex="0"\]\):focus-visible/);
  assert.match(css, /\[data-storefront-visual\] \[data-visual-section="header"\] :is\(a, button, input, select, summary, \[tabindex="0"\]\):focus-visible/);
  assert.match(css, /\[data-storefront-visual\] \[data-visual-section="footer"\] :is\(a, button, input, select, summary, \[tabindex="0"\]\):focus-visible/);
});

test('los menús móviles de la tienda cierran con la tecla Escape', () => {
  const editorialLayout = read('src/features/storefront/components/store/EditorialLayout.tsx');
  assert.match(editorialLayout, /event\.key === 'Escape'/);
  assert.match(editorialLayout, /setMobileOpen\(false\)/);

  const compactNav = read('src/features/storefront/components/store/CompactMobileNavigation.tsx');
  assert.match(compactNav, /event\.key === 'Escape'/);
  assert.match(compactNav, /ref\.current\.open = false/);
});

test('Card interactiva se activa con Enter y Espacio mediante teclado', () => {
  const ui = loadModule('src/features/storefront/components/ui/index.tsx', {
    'react-router-dom': { Link: 'Link' },
    './SoftwareVersionModal': { SoftwareVersionModal: () => null },
    './Icon': { Icon: () => null },
  });

  let clicks = 0;
  const card = ui.Card({ onClick: () => { clicks++; }, children: 'Contenido' });
  assert.equal(card.props.role, 'button');
  assert.equal(card.props.tabIndex, 0);

  let prevented = 0;
  card.props.onKeyDown({ key: 'Enter', preventDefault: () => { prevented++; } });
  card.props.onKeyDown({ key: ' ', preventDefault: () => { prevented++; } });
  card.props.onKeyDown({ key: 'Tab', preventDefault: () => { prevented++; } });

  assert.equal(clicks, 2);
  assert.equal(prevented, 2);
});

test('Tabs de tienda y de administración navegan con ArrowRight, ArrowLeft, Home y End', () => {
  const storeUi = loadModule('src/features/storefront/components/ui/index.tsx', {
    'react-router-dom': { Link: 'Link' },
    './SoftwareVersionModal': { SoftwareVersionModal: () => null },
    './Icon': { Icon: () => null },
  });
  const adminUi = loadModule('src/features/admin/components/ui/index.tsx', {
    '../../../storefront/components/ui': storeUi,
    '../../../storefront/components/ui/Icon': { Icon: () => null },
    './AdminModal': { AdminModal: () => null },
    '../../context/AdminHelpContext': { useAdminHelp: () => ({ showHelp: true }) },
  });

  const tabs = [
    { id: 'general', label: 'General' },
    { id: 'envios', label: 'Envíos' },
    { id: 'pagos', label: 'Pagos' },
  ];

  for (const TabsComponent of [storeUi.Tabs, adminUi.Tabs]) {
    let active = 'general';
    let focusedIndex = -1;
    const render = () => TabsComponent({ tabs, active, onChange: (next) => { active = next; } });

    let tree = render();
    const buttons = tree.props.children;
    assert.equal(buttons[0].props.tabIndex, 0);
    assert.equal(buttons[1].props.tabIndex, -1);

    const makeEvent = (key) => ({
      key,
      preventDefault() {},
      currentTarget: {
        parentElement: {
          querySelectorAll: () => buttons.map((_, i) => ({ focus: () => { focusedIndex = i; } })),
        },
      },
    });

    buttons[0].props.onKeyDown(makeEvent('ArrowRight'));
    assert.equal(active, 'envios');
    assert.equal(focusedIndex, 1);

    tree = render();
    tree.props.children[1].props.onKeyDown(makeEvent('End'));
    assert.equal(active, 'pagos');
    assert.equal(focusedIndex, 2);

    tree = render();
    tree.props.children[2].props.onKeyDown(makeEvent('Home'));
    assert.equal(active, 'general');
    assert.equal(focusedIndex, 0);

    tree = render();
    tree.props.children[0].props.onKeyDown(makeEvent('ArrowLeft'));
    assert.equal(active, 'pagos');
    assert.equal(focusedIndex, 2);
  }
});

test('QuantityControl permite aumentar y disminuir cantidad con teclas de flecha respetando límites', () => {
  const { QuantityControl } = loadModule('src/features/storefront/components/store/QuantityControl.tsx');
  let qty = 1;
  const render = () =>
    QuantityControl({
      value: qty,
      onDecrease: () => { qty = Math.max(1, qty - 1); },
      onIncrease: () => { qty = Math.min(3, qty + 1); },
      increaseDisabled: qty >= 3,
    });

  let node = render();
  node.props.onKeyDown({ key: 'ArrowUp', preventDefault() {} });
  assert.equal(qty, 2);

  node = render();
  node.props.onKeyDown({ key: 'ArrowRight', preventDefault() {} });
  assert.equal(qty, 3);

  node = render();
  node.props.onKeyDown({ key: 'ArrowUp', preventDefault() {} });
  assert.equal(qty, 3, 'no supera el stock máximo');

  node = render();
  node.props.onKeyDown({ key: 'ArrowDown', preventDefault() {} });
  assert.equal(qty, 2);

  node = render();
  node.props.onKeyDown({ key: 'ArrowLeft', preventDefault() {} });
  assert.equal(qty, 1);
});