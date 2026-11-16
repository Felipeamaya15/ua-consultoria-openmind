const assert = require('node:assert/strict');
const { test } = require('node:test');
const { webcrypto: crypto } = require('node:crypto');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { load } = require('./source-loader.cjs');

function createHookHarness() {
  let slots = [];
  let cursor = 0;
  let effects = [];
  let refCursor = 0;
  const refs = [];

  function resetPass() {
    cursor = 0;
    refCursor = 0;
    effects = [];
  }

  function resetAll() {
    slots = [];
    refs.length = 0;
    resetPass();
  }

  const reactMock = {
    ...React,
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) {
        slots[i] = typeof initial === 'function' ? initial() : initial;
      }
      return [
        slots[i],
        (value) => {
          slots[i] = typeof value === 'function' ? value(slots[i]) : value;
        },
      ];
    },
    useMemo(factory) {
      return factory();
    },
    useCallback(fn) {
      return fn;
    },
    useRef(initial) {
      const i = refCursor++;
      if (!(i in refs)) refs[i] = { current: initial };
      return refs[i];
    },
    useEffect(fn) {
      effects.push(fn);
    },
  };

  return { reactMock, resetPass, resetAll, getEffects: () => effects };
}

function walkElements(node, visitor) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const child of node) walkElements(child, visitor);
    return;
  }
  visitor(node);
  if (node.props && node.props.children) {
    walkElements(node.props.children, visitor);
  }
}

function findElement(node, predicate) {
  let found = null;
  walkElements(node, (el) => {
    if (!found && el.props && predicate(el)) found = el;
  });
  return found;
}

test('panelSearch catalog covers all sidebar modules and finds features accent-insensitively', () => {
  const { menuItems, legalSlugs } = load('src/features/admin/config/navigation.ts');
  const {
    PANEL_SEARCH_MODULES,
    normalizeSearchText,
    searchAdminPanel,
  } = load('src/features/admin/config/panelSearch.ts');

  assert.equal(normalizeSearchText('Diseño Visual y Campañas'), 'diseno visual y campanas');
  assert.equal(searchAdminPanel('').length, 0);
  assert.equal(searchAdminPanel('   ').length, 0);
  assert.equal(searchAdminPanel('xyznonexistenttoken999').length, 0);

  const indexedRoutes = new Set(PANEL_SEARCH_MODULES.map((mod) => mod.to));
  for (const item of menuItems) {
    assert(
      indexedRoutes.has(item.path),
      `Missing sidebar module route in PANEL_SEARCH_MODULES: ${item.path}`,
    );
  }
  assert(indexedRoutes.has('/emprendedor/perfil'));

  const legalMod = PANEL_SEARCH_MODULES.find((mod) => mod.id === 'legal');
  assert(legalMod, 'Expected legal module in PANEL_SEARCH_MODULES');
  for (const slug of Object.values(legalSlugs)) {
    assert(
      legalMod.features.some((f) => f.to.includes(slug)),
      `Expected legal slug ${slug} inside legal features`,
    );
  }

  const webpay = searchAdminPanel('webpay');
  assert.equal(webpay[0].module.id, 'payments');
  assert(webpay[0].matchingFeatures.some((f) => f.id === 'payments-gateways' && f.to === '/emprendedor/pagos'));

  const workshops = searchAdminPanel('taller');
  assert(workshops.some((r) => r.module.id === 'activities'));
  assert(
    workshops.some(
      (r) =>
        r.module.id === 'landing' &&
        r.matchingFeatures.some((f) => f.to.includes('#secciones-tienda')),
    ),
  );

  const retiro = searchAdminPanel('retiro tienda');
  assert(retiro.some((r) => r.module.id === 'shipping'));

  const marketingMatch = searchAdminPanel('biblioteca png');
  assert.equal(marketingMatch[0].module.id, 'marketing');

  const seoMatch = searchAdminPanel('meta pixel');
  assert.equal(seoMatch[0].module.id, 'seo');

  const noMatch = searchAdminPanel('pixel analytics xyz');
  assert.equal(noMatch.length, 0);
});

test('AdminSidebar shows default nav when empty, filters modules & features on input, and clears properly', () => {
  const harness = createHookHarness();
  const { AdminSidebar } = load(
    'src/features/admin/components/layout/AdminSidebar.tsx',
    {
      react: harness.reactMock,
      'react-router-dom': {
        Link: ({ to, children, ...rest }) => React.createElement('a', { href: to, ...rest }, children),
        NavLink: ({ to, end: _end, children, className, ...rest }) =>
          React.createElement(
            'a',
            {
              href: to,
              className: typeof className === 'function' ? className({ isActive: to === '/emprendedor' }) : className,
              ...rest,
            },
            children,
          ),
        useLocation: () => ({ pathname: '/emprendedor', hash: '' }),
      },
      '../../context/AdminContext': {
        useAdmin: () => ({ config: { name: 'Mi Tienda Test', template: 'catalog' } }),
      },
      '../../data/mockAdminData': {
        legalPageTemplates: {
          terms: { title: 'Términos y condiciones' },
          privacy: { title: 'Política de privacidad' },
          refund: { title: 'Política de devoluciones' },
          cookies: { title: 'Política de cookies' },
        },
      },
      '../ui': {
        Icon: ({ name, className }) => React.createElement('span', { 'data-icon': name, className }),
      },
    },
  );

  harness.resetPass();
  let tree = AdminSidebar({ open: false, onClose: () => {} });
  let html = renderToStaticMarkup(tree);
  assert(html.includes('id="admin-sidebar-search"'));
  assert(html.includes('placeholder="Buscar módulo o función"'));
  assert(!html.includes('admin-sidebar-search-kbd'));
  assert(html.includes('href="/emprendedor/landing"'));
  assert(html.includes('href="/emprendedor/actividades"'));
  assert(!html.includes('admin-search-results'));

  // Type "servicios" into search input
  const input = findElement(tree, (el) => el.props.id === 'admin-sidebar-search');
  assert(input, 'Search input must exist');
  input.props.onChange({ target: { value: 'servicios' } });

  harness.resetPass();
  tree = AdminSidebar({ open: false, onClose: () => {} });
  html = renderToStaticMarkup(tree);
  assert(html.includes('admin-search-results'));
  assert(html.includes('Servicios y talleres'));
  assert(html.includes('/emprendedor/landing#secciones-tienda'));

  // Click clear button
  const clearBtn = findElement(tree, (el) => el.props['aria-label'] === 'Limpiar búsqueda');
  assert(clearBtn, 'Clear button must appear when query is non-empty');
  clearBtn.props.onClick();

  harness.resetPass();
  tree = AdminSidebar({ open: false, onClose: () => {} });
  html = renderToStaticMarkup(tree);
  assert(!html.includes('admin-search-results'));
  assert(html.includes('href="/emprendedor/productos"'));
});

test('LandingBlocksEditor opens modular/service/workshop sections in fullscreen overlay and keeps standard blocks inline', () => {
  const harness = createHookHarness();
  const schema = load('src/features/landing/types/sectionElements.ts', {}, { crypto });
  const portalCalls = [];

  const { LandingBlocksEditor } = load(
    'src/features/admin/components/LandingBlocksEditor.tsx',
    {
      react: harness.reactMock,
      'react-dom': {
        createPortal: (node, target) => {
          portalCalls.push({ node, target });
          return React.createElement('div', { 'data-portal': 'body' }, node);
        },
      },
      'react-router-dom': {
        Link: ({ to, children, ...rest }) => React.createElement('a', { href: to, ...rest }, children),
      },
      './ui': Object.fromEntries(
        ['AdminCard', 'Button', 'Input', 'Textarea', 'Toggle', 'Modal'].map((name) => [
          name,
          ({ children, label, ariaLabel: _ariaLabel, checked: _checked, onChange: _onChange, size: _size, variant: _variant, ...rest }) =>
            React.createElement('div', { 'data-ui': name, ...rest }, label, children),
        ]),
      ),
      './ui/ImageUpload': {
        ImageUpload: ({ label }) => React.createElement('div', { 'data-image-upload': label }),
      },
      './FlexibleSectionEditor': {
        FlexibleSectionEditor: ({ section, fullScreen }) =>
          React.createElement('div', {
            'data-flexible-editor': section.id,
            'data-fullscreen': String(Boolean(fullScreen)),
          }),
      },
    },
    { crypto },
  );

  const tallerBlock = schema.createFlexibleSection('talleres');
  const storyBlock = {
    id: 'story-1',
    tipo: 'texto',
    titulo: 'Sobre nosotros',
    texto: 'Historia',
    visible: true,
    orden: 1,
    imagenes: [],
  };

  let currentBlocks = [tallerBlock, storyBlock];
  const onChange = (next) => {
    currentBlocks = next;
  };

  // Initial render: nothing open
  harness.resetPass();
  let tree = LandingBlocksEditor({ value: currentBlocks, onChange });
  let html = renderToStaticMarkup(tree);
  assert(!html.includes('lb-fullscreen-overlay'));
  assert(!html.includes('class="lb-fields"'));

  // Expand the workshop/service section (section 1) -> opens fullscreen overlay (not inline lb-fields)
  const tallerExpand = findElement(
    tree,
    (el) => el.props.className === 'lb-expand' && el.props['aria-label'] === 'Editar sección 1',
  );
  assert(tallerExpand, 'Taller expand button must exist');
  assert.equal(tallerExpand.props['aria-controls'], undefined);
  tallerExpand.props.onClick();

  harness.resetPass();
  tree = LandingBlocksEditor({ value: currentBlocks, onChange });
  html = renderToStaticMarkup(tree);
  assert(html.includes('lb-fullscreen-overlay'));
  assert(html.includes('role="dialog"'));
  assert(html.includes('aria-modal="true"'));
  assert(html.includes('Volver a secciones'));
  assert(html.includes('data-fullscreen="true"'));
  assert(!html.includes(`id="lb-fields-${tallerBlock.id}"`));

  // Close via "Volver a secciones"
  const backBtn = findElement(tree, (el) => el.props.className === 'lb-fullscreen-back');
  assert(backBtn, 'Fullscreen back button must exist');
  backBtn.props.onClick();

  harness.resetPass();
  tree = LandingBlocksEditor({ value: currentBlocks, onChange });
  html = renderToStaticMarkup(tree);
  assert(!html.includes('lb-fullscreen-overlay'));

  // Creating a new workshop via Plantillas configurables directly opens fullscreen editor
  const presetsContainer = findElement(
    tree,
    (el) => el.props['aria-label'] === 'Plantillas configurables',
  );
  assert(presetsContainer, 'Plantillas configurables container must exist');
  const addTallerBtn = findElement(
    presetsContainer,
    (el) => el.type === 'button' && renderToStaticMarkup(el).includes('Sección de talleres'),
  );
  assert(addTallerBtn, 'Button to create Sección de talleres must exist');
  addTallerBtn.props.onClick();

  harness.resetPass();
  tree = LandingBlocksEditor({ value: currentBlocks, onChange });
  html = renderToStaticMarkup(tree);
  assert.equal(currentBlocks.length, 3);
  assert(html.includes('lb-fullscreen-overlay'));

  // Close fullscreen, then open standard text block -> expands inline inside .lb-fields
  findElement(tree, (el) => el.props.className === 'lb-fullscreen-back').props.onClick();
  harness.resetPass();
  tree = LandingBlocksEditor({ value: currentBlocks, onChange });

  const storyExpand = findElement(
    tree,
    (el) => el.props.className === 'lb-expand' && el.props['aria-controls'] === 'lb-fields-story-1',
  );
  assert(storyExpand, 'Story expand button must exist');
  storyExpand.props.onClick();

  harness.resetPass();
  tree = LandingBlocksEditor({ value: currentBlocks, onChange });
  html = renderToStaticMarkup(tree);
  assert(!html.includes('lb-fullscreen-overlay'));
  assert(html.includes('id="lb-fields-story-1"'));
});

test('FlexibleSectionEditor adds is-fullscreen layout panes when fullScreen=true', () => {
  const harness = createHookHarness();
  const schema = load('src/features/landing/types/sectionElements.ts', {}, { crypto });
  const { FlexibleSectionEditor } = load(
    'src/features/admin/components/FlexibleSectionEditor.tsx',
    {
      react: harness.reactMock,
      './ui': Object.fromEntries(
        ['AdminCard', 'Button', 'Input', 'Modal', 'Select', 'Textarea', 'Toggle'].map((name) => [
          name,
          ({ children, label, ariaLabel: _ariaLabel, checked: _checked, onChange: _onChange, size: _size, variant: _variant, portal: _portal, ...rest }) =>
            React.createElement('div', { 'data-ui': name, ...rest }, label, children),
        ]),
      ),
      './ui/ImageUpload': {
        ImageUpload: ({ label }) => React.createElement('div', { 'data-image-upload': label }),
      },
      './SectionMediaField': {
        SectionMediaField: () => React.createElement('div', { 'data-section-media': 'true' }),
      },
      '../../../shared/components/states': {
        ErrorState: ({ message }) => React.createElement('div', null, message),
        LoadingState: ({ message }) => React.createElement('div', null, message),
      },
      '../../marketing/components/MediaPreview': {
        MediaPreview: () => React.createElement('div', { 'data-media-preview': 'true' }),
      },
      '../../landing/services/sectionResources': {
        fetchSectionLibrary: async () => [],
      },
      '../../landing/components/SectionElements': {
        SectionElements: ({ elements }) => React.createElement('div', { 'data-preview-count': elements.length }),
      },
      './ActivitySettings': {
        ActivitySettings: () => React.createElement('fieldset', { 'data-activity-settings': 'true' }),
      },
    },
    { crypto },
  );

  const section = schema.createFlexibleSection('servicios');
  harness.resetPass();
  let tree = FlexibleSectionEditor({ section, onChange: () => {}, fullScreen: true });
  let htmlFull = renderToStaticMarkup(tree);
  assert(htmlFull.includes('flexible-section-editor is-fullscreen'));
  assert(htmlFull.includes('flexible-config-pane'));
  assert(htmlFull.includes('flexible-blocks-pane'));

  // Toggle preview in fullscreen -> shows .flexible-section-preview alongside panes
  const previewBtn = findElement(tree, (el) => el.props.children === 'Ver vista previa');
  assert(previewBtn, 'Preview toggle button must exist');
  previewBtn.props.onClick();

  harness.resetPass();
  tree = FlexibleSectionEditor({ section, onChange: () => {}, fullScreen: true });
  htmlFull = renderToStaticMarkup(tree);
  assert(htmlFull.includes('flexible-section-editor is-fullscreen has-preview'));
  assert(htmlFull.includes('flexible-section-preview'));
});

test('LandingPageContent honors explicit URL hashes like #secciones-tienda and #beneficios over saved localStorage', async () => {
  const harness = createHookHarness();
  const fakeStorage = new Map([['openmind:landing:active-panel', 'contact']]);
  let mockHash = '#secciones-tienda';

  const { default: LandingPageContent } = load(
    'src/features/admin/components/LandingPageContent.tsx',
    {
      react: harness.reactMock,
      'react-router-dom': {
        useLocation: () => ({ pathname: '/emprendedor/landing', hash: mockHash }),
        useBlocker: () => ({ state: 'unblocked', proceed: () => {}, reset: () => {} }),
      },
      './ui': Object.fromEntries(
        ['AdminCard', 'Alert', 'Input', 'Textarea', 'Modal'].map((name) => [
          name,
          ({ children, ...rest }) => React.createElement('div', rest, children),
        ]),
      ),
      './ui/ImageUpload': { ImageUpload: () => React.createElement('div') },
      './AdminPageHeader': { AdminHelp: ({ children }) => React.createElement('span', null, children) },
      './LandingBlocksEditor': { LandingBlocksEditor: () => React.createElement('div', { 'data-blocks': 'true' }) },
      './LandingContentEditor': { LandingContentEditor: () => React.createElement('div') },
      './BusinessInformation': { BusinessInformationFields: () => React.createElement('div') },
      './MailConnectionPanel': { MailConnectionPanel: () => React.createElement('div') },
      './WeeklyHoursEditor': { parseWeeklyHours: () => [], validHour: () => true },
      './CarouselImagesEditor': { CarouselImagesEditor: () => React.createElement('div') },
      '../../marketing/components/SocialProfiles': { SocialProfiles: () => React.createElement('div') },
      '../context/AdminContext': { useAdmin: () => ({ config: { template: 'catalog' }, updateConfig: () => {} }) },
      '../context/AdminHelpContext': { useAdminHelp: () => ({ showHelp: false, toggleHelp: () => {} }) },
      '../../auth/services/authService': { authService: { getStoredUser: () => null, getToken: () => null } },
      '../../storefront/services/catalogService': { fetchPublicProducts: async () => [] },
      '../../storefront/services/storeInformationService': {
        fetchStoreInformation: async () => ({ nombre: 'Mi Tienda', descripcion: '', correo_negocio: '' }),
        saveStoreInformation: async () => {},
      },
      '../../landing/services/landingService': {
        fetchPrivateLandingConfig: async () => ({
          titulo: '',
          descripcion: '',
          texto_boton: '',
          imagen_principal: null,
          logo: null,
          secciones: {},
          contenido: {},
        }),
        saveLandingConfig: async () => {},
      },
      '../../../shared/components/states': {
        ErrorState: ({ message }) => React.createElement('div', null, message),
        LoadingState: ({ message }) => React.createElement('div', null, message),
      },
      '../../../shared/services/apiRequest': { ApiError: class ApiError extends Error {} },
    },
    {
      localStorage: {
        getItem: (k) => fakeStorage.get(k) ?? null,
        setItem: (k, v) => fakeStorage.set(k, v),
      },
    },
  );

  harness.resetPass();
  LandingPageContent();
  for (const fn of harness.getEffects()) fn();
  await new Promise((resolve) => setTimeout(resolve, 0));

  harness.resetPass();
  const treeBlocks = LandingPageContent();
  const blocksTab = findElement(treeBlocks, (el) => el.props.id === 'lp-tab-blocks');
  assert(blocksTab, 'Blocks tab must exist');
  assert.equal(blocksTab.props['aria-selected'], true);

  harness.resetAll();
  mockHash = '#beneficios';
  harness.resetPass();
  LandingPageContent();
  for (const fn of harness.getEffects()) fn();
  await new Promise((resolve) => setTimeout(resolve, 0));

  harness.resetPass();
  const treeBenefits = LandingPageContent();
  const benefitsTab = findElement(treeBenefits, (el) => el.props.id === 'lp-tab-catalog');
  assert(benefitsTab, 'Catalog/Benefits tab must exist');
  assert.equal(benefitsTab.props['aria-selected'], true);
});
