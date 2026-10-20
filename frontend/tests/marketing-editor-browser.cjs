// Extiende el recorrido de Parte 1; mismas respuestas HTTP interceptadas, nunca datos comerciales.
const assert = require('node:assert/strict'), path = require('node:path');
module.exports = async function verifyEditor(page, { width, out, pid, choose, formats }) {
  const art = page.locator('.marketing-art');
  const section = name => page.getByRole('button', { name, exact: true }).click();
  const pause = () => page.waitForTimeout(100);
  const valid = async label => {
    await pause();
    assert.equal(await art.getAttribute('data-blocked'), 'false', `${width}: ${label} cabe`);
    const issues = await art.evaluate(el => {
      const outer = el.getBoundingClientRect();
      const copy = el.querySelector('.marketing-art-copy');
      const nodes = [...copy.children].filter(n => getComputedStyle(n).display !== 'none');
      const bad = nodes.filter(n => { const b = n.getBoundingClientRect(); return b.bottom > outer.bottom + 1 || b.left < outer.left || b.right > outer.right + 1 || n.scrollWidth > n.clientWidth + 1; }).map(n => n.className);
      for (let i = 1; i < nodes.length; i++) if (nodes[i - 1].getBoundingClientRect().bottom > nodes[i].getBoundingClientRect().top + 1) bad.push('superposición');
      return bad;
    });
    assert.deepEqual(issues, [], `${width}: ${label} sin recortes ni superposición`);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'sin scroll horizontal');
  };
  await page.getByRole('radio', { name: /Publicación cuadrada/ }).check();
  await section('Textos');
  await page.getByLabel('Encabezado adicional (opcional)', { exact: true }).fill('Descubre tu próximo favorito');
  await page.getByLabel('Tipografía de la publicación').selectOption('serif');
  await page.getByLabel('Tamaño del bloque').fill('110');
  await page.getByLabel('Cursiva del bloque', { exact: true }).check();
  await page.getByLabel('Alineación del bloque').selectOption('center');
  assert.equal(await art.locator('.marketing-art-heading').evaluate(el => getComputedStyle(el).fontStyle), 'italic');
  assert.equal(await art.locator('.marketing-art-heading').evaluate(el => getComputedStyle(el).textAlign), 'center');
  assert((await art.evaluate(el => getComputedStyle(el).fontFamily)).includes('Georgia'));
  await page.getByLabel('Bloque de texto').selectOption('subtitle');
  await page.getByLabel('Texto del subtítulo', { exact: true }).fill('Estilo que te acompaña');
  await page.getByLabel('Mostrar subtítulo', { exact: true }).check();
  assert.equal(await art.locator('.marketing-art-subtitle').innerText(), 'Estilo que te acompaña');
  await page.getByLabel('Mostrar subtítulo', { exact: true }).uncheck();
  assert.equal(await art.locator('.marketing-art-subtitle').count(), 0);
  await page.getByLabel('Bloque de texto').selectOption('cta');
  await page.getByLabel('Texto de llamada a la acción', { exact: true }).fill('Conoce el producto en nuestra tienda');
  await page.getByLabel('Negrita del bloque', { exact: true }).check();
  assert.equal(await art.locator('.marketing-art-cta').evaluate(el => getComputedStyle(el).fontWeight), '700');
  await section('Colores'); await page.getByRole('button', { name: 'Ciruela', exact: true }).click();
  assert.equal(await art.evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(80, 36, 62)');
  const colorInput = async (name, value) => { await page.getByLabel(name, { exact: true }).evaluate((el, v) => { const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, value); };
  await colorInput('Acento e imagen', '#e8ddc0'); await colorInput('Etiqueta y botón', '#172b3a');
  assert.equal(await art.locator('.marketing-art-cta').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(23, 43, 58)');
  await colorInput('Fondo de la pieza', '#ffffff'); await colorInput('Texto principal', '#ffffff');
  await page.getByText('El color solicitado no tiene contraste suficiente:', { exact: false }).waitFor();
  assert.equal(await art.evaluate(el => getComputedStyle(el).color), 'rgb(0, 0, 0)');
  await page.getByRole('button', { name: 'Colores de mi tienda', exact: true }).click();
  assert.equal(await art.evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(24, 75, 69)');
  await section('Textos');
  await colorInput('Color del bloque', '#000000');
  assert.equal(await art.locator('.marketing-art-cta').evaluate(el => getComputedStyle(el).color), 'rgb(0, 0, 0)');
  await section('Imagen y logo');
  await page.getByLabel('Imagen real del producto', { exact: true }).selectOption('1');
  assert((await art.locator('.marketing-art-media img').getAttribute('src')).endsWith('logo-qa.png'));
  await page.getByLabel('Encuadre de imagen').selectOption('cover');
  await page.getByLabel('Posición de imagen', { exact: true }).selectOption('bottom');
  await page.getByLabel('Zoom de imagen').fill('120');
  assert.equal(await art.locator('.marketing-art-media img').evaluate(el => getComputedStyle(el).objectFit), 'cover');
  assert.equal(await art.locator('.marketing-art-media img').evaluate(el => getComputedStyle(el).objectPosition), '50% 100%');
  assert((await art.locator('.marketing-art-media img').getAttribute('style')).includes('scale(1.2)'));
  await page.getByLabel('Mostrar logo de la tienda').uncheck();
  assert.equal(await art.locator('.marketing-art-brand img').count(), 0);
  await section('Composición');
  await page.getByLabel('Espaciado de la pieza').selectOption('compact');
  await page.getByLabel('Alineación de la ficha').selectOption('right');
  await page.getByLabel('Posición de la imagen', { exact: true }).selectOption('end');
  assert.equal(await art.getAttribute('data-media-side'), 'end');
  await section('Plantilla');
  for (const template of ['Fotografía', 'Destacado', 'Esencial']) {
    await page.getByRole('radio', { name: new RegExp(template) }).check();
    if (template !== 'Fotografía') {
      assert.equal(await art.locator('.marketing-art-heading').count(), 0, 'plantilla nueva no hereda textos');
      await section('Textos'); await page.getByLabel('Bloque de texto').selectOption('heading');
      await page.getByLabel('Encabezado adicional (opcional)', { exact: true }).fill('Descubre tu próximo favorito');
      await section('Plantilla');
    }
    for (const [format, label] of formats) {
      await page.getByRole('radio', { name: new RegExp(label) }).check();
      await valid(`${template}-${format}`);
      assert.equal(await art.locator('.marketing-art-heading').innerText(), 'Descubre tu próximo favorito');
      await page.locator('.marketing-preview').screenshot({ path: path.join(out, `editor-${template}-${format}-${width}.png`) });
    }
  }
  await page.getByRole('button', { name: 'Restablecer diseño', exact: true }).click();
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  assert.equal(await art.locator('.marketing-art-heading').count(), 1);
  await page.getByRole('button', { name: 'Restablecer diseño', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar restablecimiento', exact: true }).click();
  assert.equal(await art.getAttribute('data-template'), 'minimal'); assert.equal(await art.locator('.marketing-art-heading').count(), 0);
  assert.equal(await art.getAttribute('data-format'), 'banner');
  await page.getByRole('button', { name: 'Deshacer', exact: true }).click(); assert.equal(await art.locator('.marketing-art-heading').count(), 1);
  await page.getByRole('button', { name: 'Rehacer', exact: true }).click(); assert.equal(await art.locator('.marketing-art-heading').count(), 0);
  await section('Textos'); await page.getByLabel('Bloque de texto').selectOption('heading');
  await page.getByLabel('Encabezado adicional (opcional)', { exact: true }).fill('<script>Oferta $1</script>');
  await page.getByText('Este texto no se mostrará en la pieza.', { exact: false }).waitFor(); assert.equal(await art.locator('.marketing-art-heading').count(), 0);
  await page.getByLabel('Encabezado adicional (opcional)', { exact: true }).fill('A'.repeat(48));
  await page.getByRole('radio', { name: /Historia vertical/ }).check(); await valid('sin espacios');
  await choose(2); assert.equal(await art.locator('.marketing-art-heading').count(), 0, 'producto nuevo limpia textos');
  assert((await art.innerText()).includes('$15.000')); assert(!(await art.innerText()).includes('$24.000'));
  await choose(9); await page.getByText('Esta combinación no cabe de forma legible.', { exact: false }).waitFor();
  assert.equal(await art.getAttribute('data-blocked'), 'true', 'datos extremos bloqueados sin recortes silenciosos');
  await page.locator('.marketing-preview').screenshot({ path: path.join(out, `editor-bloqueo-${width}.png`) });
  await choose(1); await valid('regreso al producto');
  await page.getByRole('radio', { name: /Publicación cuadrada/ }).check();
  // Teclado en selector de secciones y plantilla, además de los radios de formato del recorrido base.
  await section('Plantilla'); await page.getByRole('radio', { name: /Fotografía/ }).focus(); await page.keyboard.press('ArrowRight');
  assert(await page.getByRole('radio', { name: /Destacado/ }).isChecked());
  await page.getByRole('radio', { name: /Fotografía/ }).check();
  console.log(`OK editor ${width}px: 3 plantillas × 3 formatos, tipografía, textos, contraste, paletas, imagen, composición, reset/undo/redo, fuente nueva, XSS y teclado`);
};
