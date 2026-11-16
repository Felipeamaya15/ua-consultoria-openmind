import { API_BASE_URL } from '../../../api';
import { fetchLandingConfig } from '../../landing/services/landingService';
import { fetchPublishedSectionResources, type SectionResource } from '../../landing/services/sectionResources';
import { fetchPublicProducts } from '../../storefront/services/catalogService';
import { promotionService } from '../../admin/services/promotionService';
import type { Product, Promotion } from '../../storefront/data/mockData';
import type { LandingConfig, BloqueLanding } from '../../landing/types/landing.types';
import type { SocialProfiles } from '../../landing/types/socialProfiles';
import { fetchSocialProfiles } from './socialProfilesService';
import { fetchMarketingProducts } from './marketingService';
import { fetchMediaImage, fetchMediaResource } from './mediaLibraryService';
import { buildPublication, formatMarketingMoney } from '../domain/content';
import type { MarketingProduct, PublicationContent } from '../domain/types';
import { sharingKey, type SharingItem, type SharingReference } from '../domain/sharing';

export interface SharingSources {items:SharingItem[];products?:MarketingProduct[];profiles:SocialProfiles|null;errors:string[]}
interface Input {products:MarketingProduct[];publicProducts:Product[];landing:LandingConfig|null;promotions:Promotion[];resources:Record<string,SectionResource>;home:string;now?:number}
const text=(value:string,max=2000)=>value.trim().slice(0,max);
/** Only adapts authorized public content to the existing renderer; never creates products. */
function editorial(id:string,title:string,description:string,image:string|null,category:string,price?:number):PublicationContent {
  return {productId:id,productName:title,description:description.slice(0,280),category,image,price:price??0,hidePrice:price===undefined,originalPrice:null,discountLabel:null,fromPrice:false,variantLabel:'Contenido de la tienda',hasMultipleVariants:false,source:'product'};
}
function sectionText(block:BloqueLanding){
  const parts=(block.componentes||[]).filter(element=>element.visible).flatMap(element=>{
    if(['texto','informacion','duracion','caracteristicas','requisitos','condiciones'].includes(element.tipo))return [element.texto||''];
    if(element.tipo==='fecha')return [`Fecha: ${element.fecha}${element.hasta?' al '+element.hasta:''}`];
    if(element.tipo==='horario')return [`Horario: ${element.inicio}${element.termino?' a '+element.termino:''}${block.actividad?.zona_horaria?' · '+block.actividad.zona_horaria:''}`];
    if(element.tipo==='modalidad')return [`Modalidad: ${element.modalidad}`];
    return [];
  });
  if(block.actividad?.gratuito)parts.push('Actividad gratuita.');
  return text(parts.filter(Boolean).join('\n\n')||block.texto||'');
}

function activityEditorialDescription(block: BloqueLanding): string {
  const elements = (block.componentes || []).filter(e => e.visible);
  const raw = elements
    .filter(e => ['texto', 'informacion', 'caracteristicas'].includes(e.tipo))
    .map(e => e.texto || '')
    .filter(Boolean)
    .join(' ') || block.texto || '';

  const compact = raw.replace(/\s+/g, ' ').trim();
  const narrative = compact.length > 240
    ? compact.slice(0, 237).replace(/\s+\S*$/, '') + '...'
    : compact;

  const details: string[] = [];

  for (const e of elements) {
    if (e.tipo === 'fecha' && e.fecha)
      details.push('Fecha: ' + e.fecha + (e.hasta ? ' al ' + e.hasta : ''));

    if (e.tipo === 'horario' && e.inicio)
      details.push('Horario: ' + e.inicio + (e.termino ? ' a ' + e.termino : ''));

    if (e.tipo === 'modalidad' && e.modalidad)
      details.push('Modalidad: ' + e.modalidad);

    if (e.tipo === 'ubicacion' && e.texto?.trim())
      details.push('Ubicaci\u00f3n: ' + e.texto.trim());

    if (e.tipo === 'duracion' && e.texto?.trim())
      details.push('Duraci\u00f3n: ' + e.texto.trim());

    if (e.tipo === 'requisitos' && e.texto?.trim())
      details.push('Requisitos: ' + e.texto.trim());

    if (e.tipo === 'condiciones' && e.texto?.trim())
      details.push('Condiciones: ' + e.texto.trim());
  }

  if (block.actividad?.gratuito)
    details.push('Actividad gratuita.');

  return [narrative, ...new Set(details)].filter(Boolean).join('\n');
}

export function buildSharingItems({products,publicProducts,landing,promotions,resources,home,now=Date.now()}:Input):SharingItem[]{
  const result:SharingItem[]=[];
  const visibleProducts=new Map(publicProducts.map(product=>[product.catalogId,product]));
  const featured=new Set(landing?.contenido?.productos_destacados||[]);
  for(const product of products){
    const publicProduct=visibleProducts.get(product.id),content=buildPublication(product,'product');
    if(!publicProduct?.id||!content)continue;
    result.push({reference:{kind:'product',id:product.id},group:featured.has(product.id)?'Destacados':'Productos',title:product.name,description:product.description||'',url:`${home}/producto/${encodeURIComponent(publicProduct.id)}`,images:[...new Set([...product.images,...product.variants.filter(v=>v.active&&Number(v.stock)>0).flatMap(v=>v.images||[])])],content});
  }
  for(const promotion of promotions){
    const start=promotion.startsAt?Date.parse(promotion.startsAt):-Infinity,end=promotion.endsAt?Date.parse(promotion.endsAt):Infinity;
    if(!promotion.active||Number.isNaN(start)||Number.isNaN(end)||start>now||end<now||(promotion.maxUses!=null&&promotion.usedCount>=promotion.maxUses))continue;
    const description=[promotion.type==='percentage'?`${promotion.value}% de descuento`:promotion.type==='fixed'?`${formatMarketingMoney(Math.round(promotion.value*100))} de descuento`:promotion.type==='free_shipping'?'Promoción de envío gratuito':'Productos con precio de oferta',promotion.code?`Código: ${promotion.code}`:'',promotion.minAmount?`Compra mínima: ${formatMarketingMoney(Math.round(promotion.minAmount*100))}`:'','Consulta condiciones y disponibilidad en el catálogo.'].filter(Boolean).join('\n');
    result.push({reference:{kind:'promotion',id:promotion.id},group:'Promociones',title:promotion.name,description,url:`${home}/catalogo`,images:[],content:editorial(promotion.id,promotion.name,description,null,'Promoción')});
  }
  for(const block of landing?.contenido?.bloques||[]){
    if(!block.visible||block.actividad?.estado==='cancelada')continue;
    const elements=(block.componentes||[]).filter(element=>element.visible);
    const title=text(elements.find(element=>['titulo','nombre'].includes(element.tipo)&&element.texto?.trim())?.texto||block.titulo||'',255);
    if(!title)continue;
    const media = [...(block.imagenes || []), ...elements.flatMap(element => element.imagenes || [])];
    const images = media.filter(image => !image.video_recurso_id)
      .map(image => image.src).filter(Boolean);
    const videoIds = [...new Set([
      ...media.map(image => image.video_recurso_id || ''),
      ...elements.filter(element => element.tipo === 'biblioteca')
        .map(element => element.recurso_id || '')
    ].filter(id => resources[id]?.activo && resources[id]?.tipo === 'video'))];
    for(const element of elements)if(element.tipo==='biblioteca'){
      const resource=resources[element.recurso_id||''];if(resource?.activo&&resource.tipo==='imagen'){const src=resource.imagen_publica||resource.url;if(src)images.push(src);}
    }
    const description=sectionText(block),price=elements.find(element=>element.tipo==='precio')?.importe;
    const cents=price!==undefined&&Number.isSafeInteger(Number(price)*100)?Number(price)*100:undefined;
    const category = `${block.nombre_interno || ''} ${block.tipo}`.toLocaleLowerCase('es');
    const group=block.actividad?.tipo==='servicio'||(!block.actividad&&category.includes('servicio'))?'Servicios':block.actividad?.tipo==='taller'||(!block.actividad&&category.includes('taller'))?'Talleres':'Información';
    result.push({reference:{kind:'section',id:block.id},group,title,description,url:`${home}#seccion-${block.id}`,images:[...new Set(images)],videoIds,content:{
      ...editorial(block.id,title,description,images[0]||null,group,cents),
      ...(['Servicios','Talleres'].includes(group)
        ? {description:activityEditorialDescription(block)}
        : {})
    }});
  }
  for(const resource of Object.values(resources)){
    if(!resource.activo)continue;
    const url=resource.imagen_publica||resource.url;if(!/^https?:\/\//i.test(url))continue;
    const images=resource.tipo==='imagen'?[url]:[];
    result.push({reference:{kind:'media',id:resource.id},group:'Multimedia',title:resource.titulo,description:resource.descripcion,url,images,youtube:resource.tipo==='youtube',content:editorial(resource.id,resource.titulo,resource.descripcion,images[0]||null,'Multimedia')});
  }
  return result;
}
export async function fetchSharingSources(home:string,signal:AbortSignal):Promise<SharingSources>{
  const results=await Promise.allSettled([fetchMarketingProducts(signal),fetchPublicProducts({signal,cache:'no-store'}),fetchLandingConfig({signal,cache:'no-store'}),promotionService.list(signal),fetchPublishedSectionResources(signal),fetchSocialProfiles(signal)]);
  signal.throwIfAborted();
  const [products,published,landing,promotions,media,profiles]=results;
  const errors=results.flatMap((result,index)=>result.status==='rejected'?[`No pudimos actualizar ${['los productos','el catálogo público','las secciones publicadas','las promociones','los recursos publicados','los perfiles sociales'][index]}. Reintenta antes de difundir ese contenido.`]:[]);
  // Product links require BOTH an active administrative item and a public catalog row.
  const items=buildSharingItems({home,products:products.status==='fulfilled'?products.value:[],publicProducts:published.status==='fulfilled'?published.value:[],landing:landing.status==='fulfilled'?landing.value:null,promotions:promotions.status==='fulfilled'?promotions.value:[],resources:media.status==='fulfilled'?media.value:{}});
  return {items,errors,products:products.status==='fulfilled'?products.value:[],profiles:profiles.status==='fulfilled'?profiles.value:null};
}

const frameCache = new Map<string, string>();

function videoFrame(id: string, signal: AbortSignal): Promise<string> {
  if (signal.aborted) return Promise.resolve('');
  if (frameCache.has(id)) return Promise.resolve(frameCache.get(id)!);

  return new Promise(resolve => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';

    let finished = false;
    const finish = (value = '') => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', cancel);
      video.onloadeddata = null;
      video.onerror = null;
      video.removeAttribute('src');
      video.load();
      resolve(value);
    };

    const cancel = () => finish();
    const timer = setTimeout(cancel, 7000);

    signal.addEventListener('abort', cancel, { once: true });
    video.onerror = cancel;

    video.onloadeddata = () => {
      try {
        if (!video.videoWidth || !video.videoHeight) return finish();

        const canvas = document.createElement('canvas');
        const scale = Math.min(1, 960 / Math.max(video.videoWidth, video.videoHeight));

        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);

        const ctx = canvas.getContext('2d');
        if (!ctx) return finish();

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const image = canvas.toDataURL('image/jpeg', 0.88);

        if (frameCache.size >= 20) frameCache.clear();
        frameCache.set(id, image);
        finish(image);
      } catch {
        finish();
      }
    };

    video.src = `${API_BASE_URL}/api/landing/multimedia-publica/${encodeURIComponent(id)}/video/`;
  });
}

export async function resolveSharingItem(reference:SharingReference,home:string,signal:AbortSignal):Promise<SharingItem>{
  if (reference.kind === 'library') {
    const resource = await fetchMediaResource(reference.id, signal);
    if (!resource.activo || resource.tipo !== 'imagen') throw new Error('Selecciona una imagen activa y disponible de la biblioteca.');
    let image = resource.url;
    if (resource.archivo) {
      const blob = await fetchMediaImage(resource.id, signal);
      if (!blob.type.startsWith('image/')) throw new Error('Este recurso no es una imagen.');
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = '';
      for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
      image = `data:${blob.type};base64,${btoa(binary)}`;
    }
    signal.throwIfAborted();
    return { reference, group: 'Multimedia', title: resource.titulo, description: resource.descripcion, url: home, images: image ? [image] : [], content: editorial(resource.id, resource.titulo, resource.descripcion, image || null, 'Multimedia') };
  }
  const sources=await fetchSharingSources(home,signal);
  const item=sources.items.find(item=>sharingKey(item.reference)===sharingKey(reference));
  if(!item)throw new Error('Este contenido ya no está publicado o no pudimos verificar su disponibilidad. Actualiza Difusión antes de continuar.');
  if (item.reference.kind === 'section' && item.videoIds?.length) {
    const frames = await Promise.all(
      item.videoIds.slice(0, 3).map(id => videoFrame(id, signal))
    );
    signal.throwIfAborted();
    const images = [...new Set([...item.images, ...frames.filter(Boolean)])];
    return { ...item, images, content: { ...item.content, image: images[0] || null } };
  }
  return item;
}
