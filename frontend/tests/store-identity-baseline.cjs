// Ejecuta la prueba histórica y sus módulos src desde Git, sin cambiar de rama ni archivos.
const path = require('node:path'), Module = require('node:module'), { execFileSync } = require('node:child_process');
const ref = process.argv[2] || 'f5c880e', file = path.join(__dirname, 'store-identity.cjs');
let source = execFileSync('git', ['show', `${ref}:frontend/tests/store-identity.cjs`], { encoding: 'utf8' });
source = source.replace("fs.readFileSync(file,'utf8')", `require('node:child_process').execFileSync('git', ['show',${JSON.stringify(ref)}+':frontend/'+path.relative(root,file).split(path.sep).join('/')], {encoding:'utf8'})`);
const instance = new Module(file, module); instance.filename = file; instance.paths = Module._nodeModulePaths(__dirname); instance._compile(source, file);
