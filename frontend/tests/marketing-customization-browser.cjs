// Matriz real de controles: reutiliza el transporte interceptado de Marketing, sin persistir ni exportar.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
module.exports = async (page, { width, choose, formats, out }) => {
  const art = page.locator('.marketing-art');
  const section = name => page.getByRole('button', { name, exact: true }).click();
  const template = name => page.getByRole('radio', { name: new RegExp(name) }).check();
  const pause = () => page.waitForTimeout(80);
  const color = async (name, value) => page.getByLabel(name, { exact: true }).evaluate((input, v) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, v);
    input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
  const measure = async label => {
    await pause();
    assert.equal(await art.getAttribute('data-blocked'), 'false', `${width} ${label}: legible`);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${label}: responsive`);
    assert.deepEqual(await art.evaluate(node => [...node.querySelectorAll('.marketing-art-copy > *, .marketing-art-brand')]
      .filter(n => getComputedStyle(n).display !== 'none').filter(n => { const r=n.getBoundingClientRect(), a=node.getBoundingClientRect(); return n.scrollWidth > n.clientWidth + 1 || r.bottom > a.bottom+1 || r.top < a.top-1 || r.right > a.right+1 || r.left < a.left-1; }).map(n => ({name:n.className, width:n.clientWidth, scrollWidth:n.scrollWidth, height:n.clientHeight, scrollHeight:n.scrollHeight, rect:n.getBoundingClientRect().toJSON(), outer:node.getBoundingClientRect().toJSON()}))), [], `${label}: texto completo`);
  };
  // Un producto nuevo inicia las tres sesiones sin arrastrar el recorrido previo.
  const logoData = 'data:image/png;base64,' + fs.readFileSync(path.resolve(__dirname, '../../docs/marketing-parte1/evidencias/producto-qa.png')).toString('base64');
  const logoRoute = route => route.fulfill({ json: { exito:true,data:{tienda:1,id:1,logo:logoData,contenido:{},secciones:{}} } });
  await page.route('**/api/landing/configuracion/', logoRoute);
  await page.getByRole('button', { name:'Actualizar datos', exact:true }).click();
  await page.getByText('Cargando productos e identidad de tu tienda...', {exact:true}).waitFor({state:'hidden'});
  await choose(2); await choose(1);
  const storageBefore = await page.evaluate(() => JSON.stringify(Object.entries(localStorage)));
  for (const [name, id] of [['Fotografía', 'photo'], ['Destacado', 'feature'], ['Esencial', 'minimal']]) {
    await section('Plantilla'); await template(name);
    assert.equal(await art.locator('.marketing-art-heading').count(), 0, 'cada plantilla empieza independiente');
    for (const [format, label] of formats) {
      await page.getByRole('radio', { name: new RegExp(label) }).check();
      await section('Textos'); await page.getByLabel('Bloque de texto').selectOption('heading');
      await page.getByLabel('Encabezado adicional (opcional)', { exact: true }).fill(`Diseño ${name}`);
      await page.getByLabel('Tipografía de la publicación').selectOption('calibri');
      await page.getByLabel('Tipografía de títulos').selectOption('georgia');
      assert((await art.locator('.marketing-art-title').evaluate(n => getComputedStyle(n).fontFamily)).includes('Georgia'));
      assert((await art.evaluate(n => getComputedStyle(n).fontFamily)).includes('Calibri'));
      for (const block of ['heading', 'subtitle', 'cta', 'title', 'price', 'variant', 'brand', 'description']) {
        await page.getByLabel('Bloque de texto').selectOption(block);
        if (block === 'subtitle') { await page.getByLabel('Texto del subtítulo', { exact: true }).fill('Calidad para cada día'); await page.getByLabel('Mostrar subtítulo', { exact: true }).check(); }
        if (block === 'cta') await page.getByLabel('Texto de llamada a la acción', { exact: true }).fill('Conoce nuestra colección');
        if (block === 'description') await page.getByLabel('Mostrar descripción del producto', {exact:true}).check();
        const selector = { heading: '.marketing-art-heading', subtitle: '.marketing-art-subtitle', cta: '.marketing-art-cta', title: '.marketing-art-title', price: '.marketing-art-price', variant: '.marketing-art-variant', brand: '.marketing-art-brand > span', description: '.marketing-art-description' }[block];
        const element = art.locator(selector);
        const before = await element.evaluate(n => parseFloat(getComputedStyle(n).fontSize));
        await page.getByLabel('Tamaño del bloque').fill('105'); await pause();
        assert((await element.evaluate(n => parseFloat(getComputedStyle(n).fontSize))) > before * .9, 'tamaño aplica con ajuste legible');
        assert.equal(await element.evaluate(n => n.style.getPropertyValue('--mk-block-size')), '1.05');
        await page.getByLabel('Negrita del bloque', { exact: true }).check();
        await page.getByLabel('Cursiva del bloque', { exact: true }).check();
        await page.getByLabel('Alineación del bloque').selectOption('center');
        await color('Color del bloque', '#ffffff');
        assert.equal(await element.evaluate(n => getComputedStyle(n).fontStyle), 'italic');
        assert.equal(await element.evaluate(n => getComputedStyle(n).textAlign), 'center');
        assert.equal(await element.evaluate(n => getComputedStyle(n).color), block === 'cta' ? 'rgb(0, 0, 0)' : 'rgb(255, 255, 255)', 'el botón claro aplica contraste seguro');
        // Volver a valores moderados evita confundir controles acumulados con capacidad de cabida.
        await page.getByLabel('Cursiva del bloque', { exact: true }).uncheck();
        await page.getByLabel('Tamaño del bloque').fill('90');
        if (block === 'description') {
          assert.equal(await element.innerText(), 'Material resistente para acompañarte cada día.');
          await page.getByLabel('Mostrar descripción del producto', {exact:true}).uncheck();
          assert.equal(await element.count(), 0, 'descripción opcional conserva el diseño original');
        }
      }
      assert((await art.innerText()).includes('$24.000')); assert((await art.innerText()).includes('$30.000'));
      await section('Imagen y logo');
      await page.getByLabel('Mostrar logo de la tienda').uncheck(); assert.equal(await art.locator('.marketing-art-brand img').count(),0); await page.getByLabel('Mostrar logo de la tienda').check(); assert.equal(await art.locator('.marketing-art-brand img').count(),1);
      await page.getByLabel('Imagen real del producto', { exact: true }).selectOption('0');
      await page.getByLabel('Encuadre de imagen').selectOption('cover');
      await page.getByLabel('Posición de imagen', { exact: true }).selectOption('bottom');
      await page.getByLabel('Zoom de imagen').fill('120');
      for (const [field, value] of [['Posición horizontal de imagen (%)','25'], ['Posición vertical de imagen (%)','75'], ['Bordes de imagen (%)','3'], ['Espacio interior de imagen (%)','1'], ['Tamaño del logo (%)','8']]) await page.getByLabel(field, { exact: true }).fill(value);
      assert.equal(await art.locator('.marketing-art-media img').evaluate(n => getComputedStyle(n).objectPosition), '25% 75%');
      assert.equal(await page.getByLabel('Posición de imagen', { exact: true }).inputValue(), 'custom');
      await page.getByLabel('Posición de imagen', { exact: true }).selectOption('top');
      assert.equal(await art.locator('.marketing-art-media img').evaluate(n => getComputedStyle(n).objectPosition), '25% 0%');
      await page.getByLabel('Posición vertical de imagen (%)', { exact: true }).fill('75');
      assert.equal(await art.locator('.marketing-art-media img').evaluate(n => getComputedStyle(n).objectFit), 'cover');
      assert((await art.locator('.marketing-art-media img').getAttribute('style')).includes('scale(1.2)'));
      assert((await art.locator('.marketing-art-media').getAttribute('style')).includes('3cqw'));
      assert((await art.locator('.marketing-art-brand img').getAttribute('style')).includes('8cqw'));
      await page.getByLabel('Mostrar logo de la tienda').uncheck();
      await section('Composición');
      await page.getByLabel('Espaciado de la pieza').selectOption('compact');
      await page.getByLabel('Alineación de la ficha').selectOption('right');
      // Un control de orden antes ignorado en Esencial debe cambiar la geometría en los tres formatos.
      for (const side of ['start','end']) {
        await page.getByLabel('Posición de la imagen', { exact: true }).selectOption(side); await pause();
        const boxes = await art.evaluate(n => ({ image: n.querySelector('.marketing-art-media').getBoundingClientRect().toJSON(), copy: n.querySelector('.marketing-art-copy').getBoundingClientRect().toJSON() }));
        const horizontal = format === 'banner' || id === 'feature' && format !== 'story';
        assert.equal(horizontal ? boxes.image.x < boxes.copy.x : boxes.image.y < boxes.copy.y, side === 'start', `${name}/${format}: orden efectivo`);
      }
      for (const [field, value] of [['Bordes de la pieza (%)','2'], ['Grosor del borde (px)','2'], ['Espacio interior de la pieza (%)','3'], ['Separación entre elementos (%)','1'], ['Espacio interior de la ficha (%)','1'], ['Espacio para imagen (%)','40'], ['Bordes de llamada a la acción (%)','2'], ['Espacio lateral de llamada a la acción (%)','2'], ['Espacio vertical de llamada a la acción (%)','1']]) await page.getByLabel(field, { exact: true }).fill(value);
      assert.notEqual(await page.getByLabel('Estilo del borde', {exact:true}).inputValue(), 'original', 'editar grosor activa el borde');
      assert.equal(await page.getByLabel('Espaciado de la pieza').inputValue(), 'custom');
      await page.getByLabel('Espaciado de la pieza').selectOption('compact');
      assert.equal(await page.getByLabel('Espacio interior de la pieza (%)', {exact:true}).inputValue(), '');
      assert.equal(await page.getByLabel('Separación entre elementos (%)', {exact:true}).inputValue(), '');
      await page.getByLabel('Espacio interior de la pieza (%)', {exact:true}).fill('3');
      await page.getByLabel('Separación entre elementos (%)', {exact:true}).fill('1');
      await page.getByLabel('Estilo del borde', {exact:true}).selectOption('dashed'); await color('Color del borde', '#ffffff');
      await page.getByLabel('Sombra de la pieza').selectOption('strong');
      assert.equal(await art.evaluate(n => getComputedStyle(n).borderTopStyle), 'dashed');
      assert.notEqual(await art.evaluate(n => getComputedStyle(n).boxShadow), 'none');
      await page.getByLabel('Llamada a la acción a todo el ancho').uncheck();
      for (const style of ['solid','outline','ghost']) {
        await page.getByLabel('Estilo de llamada a la acción').selectOption(style);
        assert.equal(await art.locator('.marketing-art-cta').evaluate(n => getComputedStyle(n).borderTopStyle), style === 'outline' ? 'solid' : 'none');
      }
      await page.getByLabel('Mostrar llamada a la acción', { exact: true }).uncheck(); assert.equal(await art.locator('.marketing-art-cta').count(), 0);
      await page.getByLabel('Mostrar llamada a la acción', { exact: true }).check();
      await page.getByLabel('Llamada a la acción a todo el ancho').check();
      await page.getByLabel('Estilo de llamada a la acción').selectOption('solid');
      // Ficha independiente: geometría y contraste se comprueban en el DOM real.
      const copy = art.locator('.marketing-art-copy'), cta = art.locator('.marketing-art-cta');
      await color('Fondo de la ficha', '#ffffff');
      await page.getByLabel('Bordes de la ficha (%)', {exact:true}).fill('2');
      await page.getByLabel('Grosor del borde de la ficha (px)', {exact:true}).fill('2');
      assert.equal(await page.getByLabel('Estilo del borde de la ficha').inputValue(), 'solid');
      await page.getByLabel('Estilo del borde de la ficha').selectOption('dashed');
      await color('Color del borde de la ficha', '#172b3a');
      await page.getByLabel('Sombra de la ficha').selectOption('soft');
      assert.equal(await copy.evaluate(n => getComputedStyle(n).backgroundColor), 'rgb(255, 255, 255)');
      assert.equal(await copy.evaluate(n => getComputedStyle(n).borderTopStyle), 'dashed');
      assert.equal(await copy.evaluate(n => getComputedStyle(n).borderTopWidth), '2px');
      assert.equal(await copy.evaluate(n => getComputedStyle(n).borderTopColor), 'rgb(23, 43, 58)');
      assert.notEqual(await copy.evaluate(n => getComputedStyle(n).boxShadow), 'none');
      assert.equal(await art.locator('.marketing-art-title').evaluate(n => getComputedStyle(n).color), 'rgb(0, 0, 0)', 'contraste sobre la ficha, independiente de la pieza');
      assert.equal(await art.locator('.marketing-art-brand > span').evaluate(n => getComputedStyle(n).color), 'rgb(255, 255, 255)', 'la marca mantiene el contraste sobre la pieza');
      await page.getByRole('button', {name:'Deshacer', exact:true}).click();
      assert.equal(await page.getByLabel('Sombra de la ficha').inputValue(), 'original');
      await page.getByRole('button', {name:'Rehacer', exact:true}).click();
      assert.equal(await page.getByLabel('Sombra de la ficha').inputValue(), 'soft');
      await color('Fondo de llamada a la acción', '#172b3a');
      assert.equal(await cta.evaluate(n => getComputedStyle(n).backgroundColor), 'rgb(23, 43, 58)');
      assert.equal(await cta.evaluate(n => getComputedStyle(n).color), 'rgb(255, 255, 255)');
      await page.getByLabel('Ancho personalizado de llamada a la acción (%)', {exact:true}).fill('70');
      assert.equal(await page.getByLabel('Llamada a la acción a todo el ancho').isChecked(), false);
      for (const align of ['left','center','right']) {
        await page.getByLabel('Posición de llamada a la acción').selectOption(align); await pause();
        const boxes = await copy.evaluate(n => { const r=n.getBoundingClientRect(), c=n.querySelector('.marketing-art-cta').getBoundingClientRect(), s=getComputedStyle(n); return {start:r.left+parseFloat(s.paddingLeft)+parseFloat(s.borderLeftWidth),end:r.right-parseFloat(s.paddingRight)-parseFloat(s.borderRightWidth),left:c.left,right:c.right,width:c.width}; });
        assert(Math.abs(boxes.width / (boxes.end-boxes.start) - .7) < .02, `ancho CTA real ${name}/${format}/${width}: ${JSON.stringify(boxes)}`);
        assert(Math.abs(align === 'left' ? boxes.left-boxes.start : align === 'right' ? boxes.end-boxes.right : (boxes.left-boxes.start)-(boxes.end-boxes.right)) < 2, `${name}/${format}: alineación CTA efectiva`);
      }
      for (const [shape, radius] of [['square','0px'],['pill','999px']]) {
        await page.getByLabel('Forma de llamada a la acción').selectOption(shape);
        assert.equal(await cta.evaluate(n => getComputedStyle(n).borderTopLeftRadius), radius);
      }
      await page.getByLabel('Forma de llamada a la acción').selectOption('rounded');
      assert((await cta.evaluate(n => parseFloat(getComputedStyle(n).borderTopLeftRadius))) > 0);
      await page.getByLabel('Bordes de llamada a la acción (%)', {exact:true}).fill('1');
      assert.equal(await page.getByLabel('Forma de llamada a la acción').inputValue(), 'original', 'radio manual toma efecto');
      await page.getByLabel('Estilo de llamada a la acción').selectOption('outline');
      await page.getByLabel('Borde de llamada a la acción', {exact:true}).selectOption('dashed');
      await page.getByLabel('Grosor del borde de llamada a la acción (px)', {exact:true}).fill('2');
      await color('Color del borde de llamada a la acción', '#ffffff');
      assert.equal(await cta.evaluate(n => getComputedStyle(n).borderTopStyle), 'dashed');
      assert.equal(await cta.evaluate(n => getComputedStyle(n).borderTopWidth), '2px');
      assert.equal(await cta.evaluate(n => getComputedStyle(n).borderTopColor), 'rgb(0, 0, 0)', 'borde visible aun con color incompatible');
      if (width === 1440 && format === 'story') await page.locator('.marketing-preview').screenshot({path:path.join(out,`ficha-cta-${id}.png`)});
      // Recuperar una composición moderada para las verificaciones de cabida posteriores.
      await page.getByRole('button', {name:'Restaurar apariencia original',exact:true}).click();
      await page.getByRole('button', {name:'Deshacer',exact:true}).click();
      assert.equal(await page.getByLabel('Estilo del borde de la ficha').inputValue(), 'dashed');
      await page.getByRole('button', {name:'Rehacer',exact:true}).click();
      assert.equal(await page.getByLabel('Estilo del borde de la ficha').inputValue(), 'original');
      // Conservar la expectativa de undo/redo del control compartido de Parte 2.
      await page.getByLabel('Estilo de llamada a la acción').selectOption('ghost');
      await page.getByLabel('Estilo de llamada a la acción').selectOption('solid');
      await measure(`${name}/${format}`);
      await page.getByRole('button', { name: 'Deshacer', exact: true }).click();
      assert.equal(await page.getByLabel('Estilo de llamada a la acción').inputValue(), 'ghost');
      await page.getByRole('button', { name: 'Rehacer', exact: true }).click();
      assert.equal(await page.getByLabel('Estilo de llamada a la acción').inputValue(), 'solid');
      await section('Colores');
      for (const preset of ['Tinta y papel','Bosque','Ciruela']) await page.getByRole('button', { name: preset, exact: true }).click();
      for (const [field, value] of [['Fondo de la pieza','#184b45'], ['Texto principal','#ffffff'], ['Acento e imagen','#e8ddc0'], ['Etiqueta y botón','#172b3a']]) await color(field, value);
      await measure(`${name}/${format}/colores`);
      await page.getByRole('button', { name: 'Colores de mi tienda', exact: true }).click();
      console.log(`OK personalización ${width}px ${name}/${format}: ocho bloques, fuentes, imagen, logo, ficha, bordes, sombra, CTA, paletas, undo/redo`);
    }
  }
  // Recuperación independiente: no basta con que el selector muestre otra etiqueta.
  for (const name of ['Fotografía','Destacado','Esencial']) {
    await section('Plantilla'); await template(name);
    assert.equal(await art.locator('.marketing-art-heading').innerText(), `Diseño ${name}`);
  }
  assert.equal(await page.evaluate(() => JSON.stringify(Object.entries(localStorage))), storageBefore, 'editar no altera identidad, tienda ni persistencia');
  // Sin imagen y precio normal: las tres plantillas y formatos siguen siendo composiciones de texto.
  await choose(5);
  for (const name of ['Fotografía','Destacado','Esencial']) {
    await section('Plantilla'); await template(name);
    for (const [,label] of formats) { await page.getByRole('radio', { name: new RegExp(label) }).check(); await measure(`${name}/sin imagen`); assert.equal(await art.locator('.marketing-art-media').count(), 0); }
  }
  await choose(8);
  for (const name of ['Fotografía','Destacado','Esencial']) {
    await section('Plantilla'); await template(name);
    for (const [,label] of formats) {
      await page.getByRole('radio', { name: new RegExp(label) }).check(); await pause();
      if (await art.getAttribute('data-blocked') === 'true') await page.getByText('Esta combinación no cabe de forma legible.', {exact:false}).waitFor();
      else await measure(`${name}/nombre y precio extensos`);
      assert((await art.innerText()).includes('$9.876.543,25'), 'precio extenso real sin truncar su contenido');
      assert((await art.innerText()).includes('$12.345.678,50'));
    }
  }
  if (await page.getByLabel('Producto para publicar', {exact:true}).locator('option[value="000000000000000000000009"]').count()) {
    await choose(9);
    for (const name of ['Fotografía','Destacado','Esencial']) {
      await section('Plantilla'); await template(name);
      for (const [,label] of formats) {
        await page.getByRole('radio', {name:new RegExp(label)}).check(); await pause();
        assert.equal(await art.getAttribute('data-blocked'), 'true', 'texto imposible bloqueado, sin recorte silencioso');
      }
    }
  }
  // Independencia entre tiendas, con otra página en el mismo navegador y catálogo simulado.
  const other = await page.context().newPage();
  await other.route('**/api/visual-config/plantilla-seleccionada/', route => route.fulfill({ json: { exito:true, data:{tienda_id:2,plantilla_seleccionada:'minimal'} } }));
  await other.route('**/api/tienda/configuracion/', route => route.fulfill({ json: { exito:true, data:{nombre:'Otra tienda QA',descripcion:''} } }));
  await other.goto(page.url()); await other.getByLabel('Producto para publicar', { exact:true }).selectOption('1'.padStart(24,'0'));
  await other.locator('.marketing-art').waitFor();
  assert((await other.locator('.marketing-art').innerText()).includes('Otra tienda QA'));
  assert.equal(await other.locator('.marketing-art-heading').count(),0);
  await other.close();
  await page.unroute('**/api/landing/configuracion/', logoRoute);
  await page.getByRole('button', { name:'Actualizar datos', exact:true }).click();
  await page.getByText('Cargando productos e identidad de tu tienda...', {exact:true}).waitFor({state:'hidden'});
  await choose(1); // Dejar el recorrido de Parte 1 intacto y con ajustes originales.
  console.log(`OK ${width}px: independencia de plantilla/tienda, sin imagen × 9, nombres/precios extensos × 9 y bloqueo extremo × 9; sin guardado ni exportación`);
};
