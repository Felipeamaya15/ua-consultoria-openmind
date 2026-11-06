const assert = require('node:assert/strict');
const { test } = require('node:test');
const React = require('react');
const { load } = require('./source-loader.cjs');

const ui = load('src/features/admin/components/ui/index.tsx', {
  '../../../storefront/components/ui': {},
  '../../../storefront/components/ui/Icon': { Icon: 'svg' },
  '../../context/AdminHelpContext': { useAdminHelp: () => ({ showHelp: true }) },
  './AdminModal': { AdminModal: 'dialog' },
});
const children = node => Array.isArray(node) ? node.flatMap(children) : node && typeof node === 'object' ? [node, ...children(node.props?.children)] : [];

function workspace() {
  let active, focused;
  const api = load('src/features/marketing/components/MarketingSections.tsx', {
    react: { useId: () => 'marketing-test', useState: initial => [active ??= typeof initial === 'function' ? initial() : initial, next => { active = next; }] },
    'react-router-dom': { Link: 'a' },
    '../../admin/components/ui': { Tabs: ui.Tabs, AdminCard: 'section', Button: 'button' },
    '../../admin/components/AdminPageHeader': { AdminHelp: 'p' },
    './SocialProfiles': { SocialProfiles: 'SocialProfiles' },
    './MediaLibrary': { MediaLibrary: 'MediaLibrary' },
    './Sharing': { Sharing: 'Sharing' },
  }, { window: { location: { hash: '' } }, document: { getElementById: id => ({ focus: () => { focused = id; } }) } });
  const editor = React.createElement('input', { defaultValue: 'Edición sin guardar', 'data-editor': true });
  const render = busy => {
    const tree = api.MarketingSections({ children: editor, busy, onPrepare:async()=>true });
    const navigation = children(tree).find(node => node.type === ui.Tabs);
    return { tree, tabs: children(ui.Tabs(navigation.props)).filter(node => node.props?.role === 'tab'), panels: children(tree).filter(node => node.props?.role === 'tabpanel') };
  };
  return { render, editor, focused: () => focused };
}

test('four labelled panels preserve the same mounted publication editor across every section', () => {
  const page = workspace();
  const labels = page.render().tabs.map(tab => tab.props.children.at(-1));
  assert.deepEqual(labels, ['Publicaciones', 'Redes sociales', 'Biblioteca multimedia', 'Difusión']);
  for (let index = 0; index < 4; index++) {
    page.render().tabs[index].props.onClick();
    const { tabs, panels } = page.render();
    assert.equal(tabs.filter(tab => tab.props['aria-selected']).length, 1);
    assert.equal(panels.filter(panel => !panel.props.hidden).length, 1);
    assert.equal(panels[0].props.children, page.editor);
    assert.equal(panels[0].props.hidden, index !== 0);
    assert.equal(tabs[index].props['aria-controls'], panels[index].props.id);
    assert.equal(panels[index].props['aria-labelledby'], tabs[index].props.id);
  }
});

test('keyboard navigation wraps, supports Home/End, moves focus and is disabled during export', () => {
  const page = workspace();
  let focused;
  const press = (index, key, busy = false) => page.render(busy).tabs[index].props.onKeyDown({ key, preventDefault() {}, currentTarget: { parentElement: { querySelectorAll: () => [0, 1, 2, 3].map(n => ({ focus: () => { focused = n; } })) } } });
  press(0, 'ArrowLeft'); assert.equal(focused, 3);
  press(3, 'ArrowRight'); assert.equal(focused, 0);
  press(0, 'End'); assert.equal(focused, 3);
  press(3, 'Home'); assert.equal(focused, 0);
  assert(page.render(true).tabs.every(tab => tab.props.disabled));
  press(0, 'End', true); assert.equal(focused, 0);
});

test('manual sharing returns to the existing editor and focuses its tab after preparing content', async () => {
  const page = workspace();
  page.render().tabs[3].props.onClick();
  const action = children(page.render().panels[3]).find(node => node.type === 'Sharing');
  await action.props.onPrepare({},'square');
  assert.equal(page.render().panels[0].props.hidden, false);
  assert.equal(page.focused(), 'marketing-test-tab-publications');
});

test('existing unnumbered tabs keep their labels, styling and callback contract', () => {
  let selected;
  const tree = ui.Tabs({ tabs: [{ id: 'info', label: 'Información' }], active: 'info', onChange: id => { selected = id; } });
  const tab = children(tree).find(node => node.props?.role === 'tab');
  assert.equal(tab.props.children.at(-1), 'Información');
  assert.equal(tab.props.tabIndex, 0);
  assert.equal(tab.props.id, undefined);
  assert(tree.props.className.includes('overflow-x-auto'));
  tab.props.onClick(); assert.equal(selected, 'info');
});
