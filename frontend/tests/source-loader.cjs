// Carga TypeScript real para pruebas Node sin introducir un segundo compilador de producción.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
const root = path.resolve(__dirname, '..');
function load(file, mocks = {}, globals = {}) {
  const resolved = path.resolve(root, file), module = { exports: {} };
  const source = fs.readFileSync(resolved, 'utf8')
    .replaceAll('(import.meta as any).env.VITE_API_URL', '"http://test"')
    .replaceAll('import.meta.env.VITE_API_URL', '"http://test"');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const req = name => {
    if (name in mocks) return mocks[name];
    if (!name.startsWith('.')) return require(name);
    const target = path.resolve(path.dirname(resolved), name);
    if (target.endsWith('.json')) return { default: JSON.parse(fs.readFileSync(target, 'utf8')) };
    return load(['.ts', '.tsx'].map(ext => target + ext).find(fs.existsSync) || path.join(target, 'index.tsx'), mocks, globals);
  };
  vm.runInNewContext(code, { module, exports: module.exports, require: req, Error, console, URL, URLSearchParams, AbortController,
    setTimeout, clearTimeout, structuredClone, ...globals });
  return module.exports;
}
module.exports = { load };
