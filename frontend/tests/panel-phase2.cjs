const {test}=require('node:test'),assert=require('node:assert/strict');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const {load}=require('./source-loader.cjs');
const {BENEFIT_ICONS,benefitIcon}=load('src/features/landing/types/benefitIcons.ts');
const {normalizeLandingContent}=load('src/features/landing/types/landingContent.ts');
const {Icon}=load('src/features/storefront/components/ui/Icon.tsx');
test('beneficios: todos los códigos tienen icono y son aceptados por el contrato; históricos y fallback',()=>{
 const backend=require('node:fs').readFileSync(require('node:path').join(__dirname,'../../backend/apps/landing/content_serializers.py'),'utf8');
 for(const code of Object.keys(BENEFIT_ICONS)){assert(backend.includes("'"+code+"'"));const html=renderToStaticMarkup(React.createElement(Icon,{name:code}));assert.match(html,/<(?:path|circle|rect)/)}
 for(const code of ['truck','lock','return','chat'])assert.equal(benefitIcon(code),code);
 assert.equal(benefitIcon('unknown'),'truck');assert.equal(benefitIcon('__proto__'),'truck');
 const value=normalizeLandingContent({beneficios:[{titulo:'Texto histórico',descripcion:'Propio',icono:'unknown'}]});assert.equal(value.beneficios[0].titulo,'Texto histórico');assert.equal(value.beneficios[0].icono,'truck');
});
for(const template of ['editorial','minimal','visual','catalog'])test('beneficios públicos en '+template+': 0 a 4, orden y textos conservados',()=>{
 for(let count=0;count<=4;count++){
  const content=normalizeLandingContent({beneficios:Object.keys(BENEFIT_ICONS).slice(0,count).map((icono,i)=>({titulo:'Beneficio '+i,descripcion:'Texto '+i,icono}))});
  const {LandingDetails}=load('src/features/landing/components/LandingDetails.tsx',{'../hooks/useLandingContent':{useLandingContent:()=>({content})},'../hooks/useLandingSectionVisibility':{useLandingSectionVisibility:()=>()=>true},'../../storefront/hooks/useStorefrontTemplate':{useStorefrontTemplate:()=>({template,isCatalog:template==='catalog'})}});
  const html=renderToStaticMarkup(React.createElement(LandingDetails,{includeBenefits:true,onlyBenefits:true}));assert.equal((html.match(/<h2/g)||[]).length,count);for(let i=1;i<count;i++)assert(html.indexOf('Beneficio '+(i-1))<html.indexOf('Beneficio '+i));
 }
});

const {safeMapsLink,mapLocation}=load('src/features/landing/types/mapLocation.ts');
test('mapas: destinos HTTPS seguros, datos parciales y direcciones escapadas',()=>{
 for(const url of ['javascript:alert(1)','http://google.com/maps/place/test','https://google.com.evil.test/maps/a','https://google.com/url?q=https://evil.test','https://user:pass@google.com/maps','https://maps.app.goo.gl/'])assert.equal(safeMapsLink(url),'',url);
 for(const url of ['https://maps.app.goo.gl/abc','https://www.google.cl/maps/place/Santiago','https://maps.google.com/?q=Santiago'])assert(safeMapsLink(url),url);
 const empty={direccion:'',comuna:'',ciudad:'',region:'',enlace_maps:''};assert.equal(mapLocation(empty).embed,'');assert.equal(mapLocation({...empty,region:'Metropolitana'}).href,'');
 const result=mapLocation({...empty,direccion:'Calle A & B #23',comuna:'Ñuñoa'});assert.equal(new URL(result.href).searchParams.get('query'),'Calle A & B #23, Ñuñoa');assert.equal(new URL(result.embed).searchParams.get('q'),'Calle A & B #23, Ñuñoa');
 assert.equal(mapLocation({...empty,enlace_maps:'https://maps.app.goo.gl/abc'}).embed,'');
});
test('mapa: desactivado o sin interacción no genera iframe ni conexiones a terceros',()=>{
 const {LocationPreview}=load('src/features/landing/components/LocationPreview.tsx');const value={direccion:'Calle 123',comuna:'Ñuñoa',ciudad:'',region:'Metropolitana',enlace_maps:''};
 for(const enabled of [false,true]){const html=renderToStaticMarkup(React.createElement(LocationPreview,{value,enabled}));assert(!html.includes('<iframe'));assert.equal(html.includes('Abrir en Google Maps'),enabled)}
});
const {normalizeContactFields,contactChannels}=load('src/features/landing/types/landingContent.ts');
test('contacto: normalización independiente, URLs seguras y valores históricos sin pérdida',()=>{
 const old=normalizeLandingContent().contacto;
 const value={...old,telefono:'+56 (2) 2345-6789',correo:' contacto@example.test ',sitio_web:'ejemplo.cl',whatsapp:'+56999999999',redes_sociales:{whatsapp:{activo:false,mensaje:'Mensaje propio'}}};
 const result=normalizeContactFields(value,old);assert.equal(result.error,'');assert.equal(result.contact.telefono,'+56223456789');assert.equal(result.contact.correo,'contacto@example.test');assert.equal(result.contact.sitio_web,'https://ejemplo.cl/');assert.equal(result.contact.whatsapp,value.whatsapp);assert.equal(result.contact.redes_sociales,value.redes_sociales);
 for(const sitio_web of ['javascript:alert(1)','https://user:pass@example.test','http://example.test'])assert(normalizeContactFields({...old,sitio_web},old).error);
 assert(normalizeContactFields({...old,telefono:'123'},old).error);assert(normalizeContactFields({...old,correo:'a@b?bcc=other'},old).error);
 const historic={...old,telefono:'12345',sitio_web:'http://antiguo.example.test',instagram:'https://instagram.com/antigua'};assert.equal(normalizeContactFields(historic,historic).error,'');
 assert.equal(contactChannels({...old,telefono:'',correo:'',sitio_web:'javascript:alert(1)'}).length,0);
});
for(const template of ['editorial','minimal','visual','catalog'])test('contactos públicos '+template+': 0 a 6 canales válidos, sin huecos y con visibilidad',()=>{
 const all={telefono:'+56223456789',whatsapp:'+56912345678',correo:'tienda@example.test',instagram:'https://instagram.com/mi.tienda',facebook:'https://facebook.com/mi.tienda',youtube:'https://youtube.com/@mi-tienda'};
 for(let count=0;count<=6;count++){
  const contacto=Object.fromEntries(Object.entries(all).slice(0,count));const content=normalizeLandingContent({contacto});
  const {LandingDetails}=load('src/features/landing/components/LandingDetails.tsx',{'../hooks/useLandingContent':{useLandingContent:()=>({content})},'../hooks/useLandingSectionVisibility':{useLandingSectionVisibility:()=>()=>true},'../../storefront/hooks/useStorefrontTemplate':{useStorefrontTemplate:()=>({template,isCatalog:template==='catalog'})}});
  const html=renderToStaticMarkup(React.createElement(LandingDetails));assert.equal((html.match(/class="landing-details__contact-card"/g)||[]).length,count);if(count)assert(html.includes('data-count="'+count+'"'));assert(!html.includes('<iframe'));
 }
 const c=normalizeLandingContent({contacto:{...all,redes_sociales:{whatsapp:{activo:false},youtube:{activo:false}}}}).contacto;assert.equal(contactChannels(c).length,4);
});
test('Marketing conserva el acceso central y no monta un segundo editor de perfiles',()=>{
 const fs=require('node:fs'),path=require('node:path');const source=fs.readFileSync(path.join(__dirname,'../src/features/marketing/components/MarketingSections.tsx'),'utf8');assert(source.includes('/emprendedor/landing#contacto-horarios'));assert(!source.includes('<SocialProfiles'));
});

test('inscripciones: ayudas distinguen confirmación, cupos y pagos sin crear acciones de envío',()=>{
 const {default:Activities}=load('src/features/admin/pages/Activities.tsx',{
  react:{...React,useEffect(){},useRef:initial=>({current:initial}),useState:initial=>[typeof initial==='function'?initial():initial,()=>{}]},
  'react-router-dom':{Link:({to,children,...props})=>React.createElement('a',{...props,href:to},children),useSearchParams:()=>[new URLSearchParams('tipo=inscripcion'),()=>{}]},
  '../../landing/services/activityService':{CONSULT_STATES:{nueva:'Nueva'},ENROLL_STATES:{pendiente:'Pendiente de confirmación',confirmada:'Confirmada (gratuita)',cancelada:'Cancelada'}}
 });
 const html=renderToStaticMarkup(React.createElement(Activities));for(const text of ['manual o automática','No acredita un pago','las pendientes y confirmadas ocupan cupo','Cambiar un estado aquí no envía un correo'])assert(html.includes(text),text);assert(!html.includes('Enviar correo'));
});
