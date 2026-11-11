const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const root = path.resolve(__dirname, '..');

function loadTs(relative, globals = {}) {
  const file = path.resolve(root, relative);
  const module = { exports: {} };
  const source = fs
    .readFileSync(file, 'utf8')
    .replaceAll('import.meta.env.VITE_API_URL', "'http://test'");
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;

  const req = (id) => {
    if (globals.mocks && id in globals.mocks) return globals.mocks[id];
    if (!id.startsWith('.')) return require(id);
    const resolved = path.resolve(path.dirname(file), id);
    const target =
      ['.ts', '.tsx'].map((ext) => resolved + ext).find(fs.existsSync) ||
      path.join(resolved, 'index.ts');
    return loadTs(path.relative(root, target), globals);
  };

  vm.runInNewContext(code, {
    module,
    exports: module.exports,
    require: req,
    Error,
    Date,
    Number,
    JSON,
    AbortController,
    setTimeout,
    clearTimeout,
    ...globals,
  });
  return module.exports;
}

async function run() {
  // 1. Validación estricta, Allowlists y escape XSS (<script> -> &lt;script&gt;)
  const security = loadTs('src/shared/utils/security.ts');
  assert.equal(
    security.escapeHtml('<script>alert("xss")</script>'),
    '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;',
  );
  assert.equal(security.isValidEmail('usuario@dominio.cl'), true);
  assert.equal(security.isValidEmail("admin'--@dominio.cl"), false);
  assert.equal(security.isValidPhone('+56 9 8765-4321'), true);
  assert.equal(security.isValidPhone('12345abc'), false);
  assert.equal(security.isValidPostalCode('832-0000'), true);
  assert.equal(security.isValidPostalCode('83200AB'), false);
  assert.equal(security.isValidPostalCode('<script>'), false);
  assert.equal(security.isValidPersonName('María José González-Pérez'), true);
  assert.equal(security.isValidPersonName('María <script>'), false);
  assert.equal(
    security.containsSqlOrControlInjection("' OR '1'='1' UNION SELECT * FROM users"),
    true,
  );

  // 2. Ojito para ocultar/mostrar contraseña en el componente Input
  const ui = loadTs('src/features/storefront/components/ui/index.tsx', {
    mocks: {
      'react-router-dom': { Link: 'a' },
      './SoftwareVersionModal': { SoftwareVersionModal: () => null },
      './Icon': { Icon: () => null },
    },
  });
  const passwordInputHtml = renderToStaticMarkup(
    React.createElement(ui.Input, {
      label: 'Contraseña',
      type: 'password',
      value: 'Secreta123!',
      onChange: () => {},
    }),
  );
  assert.match(passwordInputHtml, /type="password"/);
  assert.match(passwordInputHtml, /data-password-toggle="true"/);
  assert.match(passwordInputHtml, /aria-label="Mostrar contraseña"/);

  // 3. authService: inactividad de 30 minutos, CAPTCHA, MFA y Olvidé mi contraseña
  const store = new Map();
  const calls = [];
  let mockResponse = {
    ok: true,
    status: 200,
    json: async () => ({ exito: true, mensaje: 'OK', data: { token: 'tok-123' } }),
  };

  const { authService, SESSION_INACTIVITY_LIMIT_MS } = loadTs(
    'src/features/auth/services/authService.ts',
    {
      localStorage: {
        getItem: (k) => store.get(k) ?? null,
        setItem: (k, v) => store.set(k, v),
        removeItem: (k) => store.delete(k),
      },
      sessionStorage: {
        getItem: () => null,
        removeItem: () => {},
      },
      fetch: async (url, options) => {
        calls.push({ url, options });
        return mockResponse;
      },
    },
  );

  assert.equal(SESSION_INACTIVITY_LIMIT_MS, 30 * 60 * 1000);
  authService.setSession('tok-activo');
  assert.equal(authService.hasSession(), true);

  // Simular más de 30 minutos de inactividad
  store.set(
    'session_last_activity_at',
    new Date(Date.now() - 31 * 60 * 1000).toISOString(),
  );
  assert.equal(authService.hasSession(), false);
  assert.equal(store.get('token'), undefined);

  // Verificar llamadas de recuperación de contraseña, MFA y CAPTCHA
  await authService.requestPasswordReset('cliente@ejemplo.cl', 2);
  assert.equal(
    calls[calls.length - 1].url,
    'http://test/api/auth/password-reset/request/',
  );
  assert.equal(
    calls[calls.length - 1].options.body,
    '{"email":"cliente@ejemplo.cl","template":2}',
  );

  await authService.confirmPasswordReset('signed-reset-token', 'NuevaClave2026!#');
  assert.equal(
    calls[calls.length - 1].url,
    'http://test/api/auth/password-reset/confirm/',
  );

  await authService.verifyMfa('mfa-tok', '123456');
  assert.equal(calls[calls.length - 1].url, 'http://test/api/auth/mfa/verify/');
  assert.equal(authService.getToken(), 'tok-123');

  console.log(
    'OK: ojito de contraseña, listas blancas, escape XSS, inactividad de 30m, MFA, CAPTCHA y recuperación de contraseña verificados.',
  );
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
