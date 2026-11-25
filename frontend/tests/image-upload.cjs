const assert=require('node:assert/strict'),{test}=require('node:test');
const{load}=require('./source-loader.cjs');
function api(request){return load('src/shared/services/imageUpload.ts',{'../../api':{API_BASE_URL:'http://local.test'},'./apiRequest':{requestJson:request}}, {localStorage:{getItem:()=> 'test-auth'},sessionStorage:{getItem:()=>null},FormData});}
test('HEIC with empty MIME is sent centrally and only the normalized web URL reaches the caller',async()=>{
  let call;const service=api(async(...args)=>{call=args;return {url:'data:image/webp;base64,AAAA'}});
  const result=await service.prepareImage(new File(['synthetic'],'iphone.HEIC',{type:''}),1);
  assert.equal(result,'data:image/webp;base64,AAAA');assert.equal(call[0],'http://local.test/api/tienda/imagenes/procesar/');
  assert.equal(call[1].body.get('max_mb'),'1');assert.equal(call[1].body.get('imagen').name,'iphone.HEIC');
  assert(service.IMAGE_ACCEPT.includes('.heif'));assert(service.IMAGE_ACCEPT.includes('.heic'));
});
test('oversized and unsupported files fail before any upload',async()=>{
  let calls=0;const service=api(async()=>{calls++;});
  await assert.rejects(service.prepareImage(new File(['raw'],'photo.dng'),1),/Selecciona una imagen/);
  await assert.rejects(service.prepareImage(new File([new Uint8Array(1024*1024+1)],'large.heic'),1),/1 MB/);
  assert.equal(calls,0);
});
test('corrupt results and processing errors never replace the current image',async()=>{
  await assert.rejects(api(async()=>({url:'data:image/heic;base64,AAAA'})).prepareImage(new File(['x'],'a.heic')),/procesar/);
  await assert.rejects(api(async()=>{throw new Error('Archivo corrupto');}).prepareImage(new File(['x'],'a.png')),/corrupto/);
});
