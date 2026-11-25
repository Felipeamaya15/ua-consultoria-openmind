const {test} = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./source-loader.cjs');
const jsx = (type, props) => typeof type==='function'&&['CartProductRow','CartLineItem','QuantityControl'].includes(type.name)?type(props):({type,props});
const rows=load('src/features/storefront/components/store/CartLineItem.tsx',{'react/jsx-runtime':{jsx,jsxs:jsx},'react-router-dom':{Link:'Link'}});
const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : tree && typeof tree === 'object'
  ? [tree, ...nodes(tree.props?.children)] : tree == null ? [] : [tree];
const react = {useState: initial => [initial, () => {}], useEffect() {}};
const item = {productId: 'product', variantId: 'sku', sku: 'sku', name: 'Producto QA',
  quantity: 1, price: 5000, maxStock: 5, attributes: {}};

for (const template of ['editorial', 'minimal', 'visual', 'catalog']) {
  test(`${template}: cancelar conserva el producto y confirmar elimina también la última unidad`, async () => {
    let accepted = false, removed = 0, updated = 0;
    const {default: Cart} = load('src/features/storefront/pages/Cart.tsx', {
      react, 'react/jsx-runtime': {jsx, jsxs: jsx},
      '../components/store/CartLineItem':rows,'./CartLineItem':rows,
      '../../../shared/components/FeedbackProvider': {useFeedback: () => ({confirm: async () => accepted})},
      '../../../../shared/components/FeedbackProvider': {useFeedback: () => ({confirm: async () => accepted})},
      'react-router-dom': {Link: 'Link', useNavigate: () => () => {}},
      '../../../shared/components/states': {LoadingState: 'LoadingState'},
      '../components/store/StockFeedback': {StockFeedback: 'StockFeedback'},
      '../components/store/ActivityCartPreview': {ActivityCartRows: 'ActivityCartRows'},
      '../components/ui': {Button: 'Button', EmptyState: 'EmptyState', Icon: 'Icon'},
      '../hooks/useStorefrontTemplate': {useStorefrontTemplate: () => ({
        route: value => value, isMinimal: template === 'minimal', isVisual: template === 'visual', isCatalog: template === 'catalog',
      })},
      '../context/CartContext': {useCart: () => ({items: [item], activities: [], loading: false,
        subtotal: 5000, total: 5000, discount: 0, shipping: 0, promoCode: '', count: 1,
        removeItem: () => removed++, updateQuantity: () => updated++, applyPromo() {}})},
    });
    const tree = nodes(Cart());
    const remove = tree.find(node => node.props?.['aria-label'] === 'Eliminar Producto QA');
    const decrease = tree.find(node => node.type === 'button' && nodes(node.props?.children).includes('−'));
    assert(remove && decrease);
    await remove.props.onClick(); await decrease.props.onClick();
    assert.equal(removed, 0); assert.equal(updated, 0);
    accepted = true;
    await remove.props.onClick(); await decrease.props.onClick();
    assert.equal(removed, 2); assert.equal(updated, 0);
  });
}

test('taller/servicio: cancelar conserva selección y participantes; confirmar quita la última unidad', async () => {
  let accepted = false, removed = 0, reduced = 0;
  const {ActivityCartRows} = load('src/features/storefront/components/store/ActivityCartPreview.tsx', {
    react, 'react/jsx-runtime': {jsx, jsxs: jsx},
      '../../../shared/components/FeedbackProvider': {useFeedback: () => ({confirm: async () => accepted})},
      '../../../../shared/components/FeedbackProvider': {useFeedback: () => ({confirm: async () => accepted})},
    '../../context/activityCart': {useActivityCart: () => ({put() {}, remove: () => removed++, reduce: () => reduced++})},
    '../../../landing/services/paidActivityService': {formatActivityDate: () => '', canSelectPaidQuote: () => false, paidStatusLabel: {}},
  });
  const activity = {sectionId: 'workshop', title: 'Taller QA', quantity: 1, price: 15000};
  function row(quantity) {
    const child = ActivityCartRows({items: [{...activity, quantity}]}).props.children[0];
    return nodes(child.type(child.props));
  }
  let tree = row(1);
  await tree.find(node => node.props?.className?.split(' ').includes('paid-cart-remove')).props.onClick();
  await tree.find(node => node.props?.['aria-label'] === 'Quitar último participante y eliminar actividad').props.onClick();
  assert.equal(removed, 0); assert.equal(reduced, 0);
  accepted = true;
  await tree.find(node => node.props?.className?.split(' ').includes('paid-cart-remove')).props.onClick();
  await tree.find(node => node.props?.['aria-label'] === 'Quitar último participante y eliminar actividad').props.onClick();
  assert.equal(removed, 2); assert.equal(reduced, 0);
  tree = row(2);
  await tree.find(node => node.props?.['aria-label'] === 'Quitar un participante').props.onClick();
  assert.equal(reduced, 1);
});
