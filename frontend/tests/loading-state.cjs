// SCRUM-451: estados de carga compartidos. Prueba el componente real y vigila que ninguna pantalla vuelva a dibujar la carga a mano.
const fs = require('node:fs'), path = require('node:path');
const assert = require('node:assert/strict');
const React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
const { load } = require('./source-loader.cjs');

const root = path.resolve(__dirname, '..');
const { LoadingState } = load('src/shared/components/states.tsx');
const html = (props, children) => renderToStaticMarkup(React.createElement(LoadingState, props, children));
const clases = marcado => (marcado.match(/<div[^>]*class="([^"]*)"/) || [])[1].split(/\s+/);
let passed = 0;
function test(name, fn) { fn(); console.log('OK ' + name); passed++; }

function archivos(carpeta) {
  return fs.readdirSync(carpeta, { withFileTypes: true }).flatMap(entrada => {
    const ruta = path.join(carpeta, entrada.name);
    return entrada.isDirectory() ? archivos(ruta) : /\.tsx$/.test(entrada.name) ? [ruta] : [];
  });
}
const fuentes = archivos(path.join(root, 'src')).map(ruta => ({ ruta: path.relative(root, ruta).replaceAll('\\', '/'), texto: fs.readFileSync(ruta, 'utf8').replace(/\r/g, '') }));
const pantallas = fuentes.filter(f => f.ruta !== 'src/shared/components/states.tsx');

test('se anuncia como estado, ocupado y con aviso cortés a los lectores de pantalla', () => {
  const marcado = html({}, 'Cargando pedidos…');
  assert.match(marcado, /role="status"/);
  assert.match(marcado, /aria-live="polite"/);
  assert.match(marcado, /aria-busy="true"/);
});

test('muestra el texto recibido y, sin texto, dice "Cargando…"', () => {
  assert.ok(html({}, 'Cargando ventas…').includes('<span>Cargando ventas…</span>'));
  assert.ok(html({}).includes('<span>Cargando…</span>'));
});

test('el texto puede incluir formato y siempre se escapa', () => {
  assert.ok(html({}, React.createElement('strong', null, 'Cargando')).includes('<span><strong>Cargando</strong></span>'));
  const peligroso = html({}, '<script>alert(1)</script> & "x"');
  assert.ok(!peligroso.includes('<script>'));
  assert.ok(peligroso.includes('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;x&quot;'));
});

test('la ruedita es decorativa: no se anuncia ni crea un segundo estado', () => {
  const marcado = html({}, 'Cargando…');
  assert.match(marcado, /<span aria-hidden="true" class="[^"]*animate-spin[^"]*"><\/span>/);
  assert.equal((marcado.match(/role="status"/g) || []).length, 1);
  assert.ok(!/aria-label/.test(marcado));
});

test('los tamaños de la ruedita', () => {
  for (const [size, clase] of [['sm', 'w-3'], ['md', 'w-5'], ['lg', 'w-8']]) assert.ok(html({ size }, 'x').includes(`${clase} `), size);
  assert.ok(html({}, 'x').includes('w-5 h-5'), 'por defecto es mediano');
});

test('alineación: centrada por defecto o al inicio', () => {
  assert.ok(clases(html({}, 'x')).includes('justify-center'));
  assert.ok(clases(html({ align: 'center' }, 'x')).includes('justify-center'));
  assert.ok(!clases(html({ align: 'start' }, 'x')).includes('justify-center'));
});

test('espacio vertical: normal, compacto o ninguno', () => {
  assert.ok(clases(html({}, 'x')).includes('py-6'));
  assert.ok(clases(html({ spacing: 'compact' }, 'x')).includes('py-2'));
  const sin = clases(html({ spacing: 'none' }, 'x'));
  assert.ok(!sin.some(c => /^py-/.test(c)), 'sin espacio propio');
});

test('la clase del contenedor se agrega al final y no deja rastros de valores vacíos', () => {
  const marcado = html({ spacing: 'none', className: 'rounded-2xl border p-8' }, 'x');
  const lista = clases(marcado);
  assert.deepEqual(lista.slice(-3), ['rounded-2xl', 'border', 'p-8']);
  assert.ok(!/undefined|null|false/.test(marcado));
  assert.ok(!/class="[^"]*  [^"]*"/.test(marcado), 'sin espacios dobles');
});

test('el módulo es independiente: solo importa tipos de React', () => {
  const origen = fs.readFileSync(path.join(root, 'src/shared/components/states.tsx'), 'utf8');
  const importaciones = origen.split('\n').filter(l => /^import /.test(l));
  assert.deepEqual(importaciones, ["import type { ReactNode } from 'react';"]);
});

test('ninguna pantalla vuelve a dibujar la carga a mano', () => {
  const sueltos = [];
  for (const { ruta, texto } of pantallas) {
    if (ruta === 'src/features/storefront/components/ui/index.tsx') continue; // el Spinner del botón
    texto.split('\n').forEach((linea, i) => {
      if (/<(p|Alert|div|span)\b[^>]*>\s*Cargando\b/.test(linea) || /^\s*Cargando\s[^<{]*$/.test(linea)) sueltos.push(`${ruta}:${i + 1}  ${linea.trim().slice(0, 90)}`);
    });
  }
  assert.deepEqual(sueltos, [], 'usa <LoadingState> en vez de escribir el texto de carga a mano:\n' + sueltos.join('\n'));
});

test('quien usa <LoadingState> lo importa del módulo compartido', () => {
  const sinImportar = pantallas.filter(f => /<LoadingState\b/.test(f.texto) && !/import \{[^}]*\bLoadingState\b[^}]*\} from ['"][./]+(?:[./]*)shared\/components\/states['"]/.test(f.texto)).map(f => f.ruta);
  assert.deepEqual(sinImportar, []);
});

test('todos los textos de carga empiezan con "Cargando" y dicen qué se carga', () => {
  const malos = [];
  let usos = 0;
  for (const { ruta, texto } of pantallas) {
    for (const m of texto.matchAll(/<LoadingState\b[^>]*>([^<]*)<\/LoadingState>/g)) {
      usos++;
      if (!/^Cargando \S/.test(m[1].trim())) malos.push(`${ruta}: ${m[1]}`);
    }
  }
  assert.ok(usos >= 30, `se esperaban al menos 30 usos y hay ${usos}`);
  assert.deepEqual(malos, []);
});

test('los textos de carga terminan igual que el resto del panel: con puntos suspensivos', () => {
  const sin = [];
  for (const { ruta, texto } of pantallas) {
    for (const m of texto.matchAll(/<LoadingState\b[^>]*>([^<]*)<\/LoadingState>/g)) if (!/(…|\.\.\.)$/.test(m[1].trim())) sin.push(`${ruta}: ${m[1]}`);
  }
  assert.deepEqual(sin, []);
});

console.log(`\n${passed} pruebas OK`);
