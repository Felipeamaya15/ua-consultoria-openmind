const assert=require('node:assert/strict'),{test}=require('node:test');
const {load}=require('./source-loader.cjs');
const fields=[{key:'customerName',label:'Nombre del cliente',description:'Nombre registrado',example:'María'},{key:'orderNumber',label:'Número de pedido',description:'Identificador',example:'PED-00125'},{key:'trackingLink',label:'Enlace de seguimiento',description:'Consulta segura',example:'https://example.test/seguimiento'}];
const {splitFields,previewFields,validateAutomaticFields}=load('src/features/admin/components/AutomaticFieldEditor.tsx',{'./automatic-fields.css':{}});
test('only recognized markers become atomic fields and original syntax round trips',()=>{
  const value='Hola {{ customerName }}, pedido {{orderNumber}}. [normal] {texto} {{ texto normal }}';
  const parts=splitFields(value,fields);
  assert.equal(parts.filter(part=>part.field).length,2);
  assert.equal(parts.map(part=>part.text).join(''),value);
});
test('required markers are validated across subject, preheader and body',()=>{
  assert.equal(validateAutomaticFields(['Pedido {{orderNumber}}','','Texto libre'],fields,['orderNumber']),'');
  assert.match(validateAutomaticFields(['Hola','','Texto libre'],fields,['orderNumber']),/Número de pedido/);
  assert.equal(validateAutomaticFields(['Hola'],fields,[]),'');
});
test('unknown and damaged fields fail while ordinary brackets remain editable',()=>{
  for(const value of ['{{orderNumberX}}','{{orderNumber}','{customerName}}'])assert.notEqual(validateAutomaticFields([value],fields),'');
  assert.equal(validateAutomaticFields(['[oferta] {año} {{ texto normal }}'],fields),'');
});
test('preview uses safe sample values without changing the stored template',()=>{
  const value='Hola {{customerName}}: {{orderNumber}}, {{trackingLink}}';
  assert.equal(previewFields(value,fields),'Hola María: PED-00125, https://example.test/seguimiento');
  assert(value.includes('{{customerName}}'));
});
