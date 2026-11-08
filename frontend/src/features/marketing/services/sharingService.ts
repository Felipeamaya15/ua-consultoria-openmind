import { fetchLandingConfig } from '../../landing/services/landingService';
import { fetchPublishedSectionResources, type SectionResource } from '../../landing/services/sectionResources';
import { fetchPublicProducts } from '../../storefront/services/catalogService';
import { promotionService } from '../../admin/services/promotionService';
import type { Product, Promotion } from '../../storefront/data/mockData';
import type { LandingConfig, BloqueLanding } from '../../landing/types/landing.types';
import type { SocialProfiles } from '../../landing/types/socialProfiles';
import { fetchSocialProfiles } from './socialProfilesService';
import { fetchMarketingProducts } from './marketingService';
import { buildPublication, formatMarketingMoney } from '../domain/content';
import type { MarketingProduct, PublicationContent } from '../domain/types';
import { sharingKey, type SharingItem, type SharingReference } from '../domain/sharing';

export interface SharingSources {items:SharingItem[];profiles:SocialProfiles|null;errors:string[]}
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
export function buildSharingItems({products,publicProducts,landing,promotions,resources,home,now=Date.now()}:Input):SharingItem[]{
  const result:SharingItem[]=[];
  const visibleProducts=new Map(publicProducts.map(product=>[product.catalogId,product]));
  const featured=new Set(landing?.contenido?.productos_destacados||[]);
  for(const product of products){
    const publicProduct=visibleProducts.get(product.id),content=buildPublication(product,'product');
    if(!publicProduct?.id||!content)continue;
    result.push({reference:{kind:'product',id:product.id},group:featured.has(product.id)?'Destacados':'Productos',title:product.name,description:product.description||'',url:`${home}/producto/${encodeURIComponent(publicProduct.id)}`,images:product.images,content});
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
    const images=[...block.imagenes,...elements.flatMap(element=>element.imagenes||[])].map(image=>image.src);
    for(const element of elements)if(element.tipo==='biblioteca'){
      const resource=resources[element.recurso_id||''];if(resource?.activo&&resource.tipo==='imagen'){const src=resource.imagen_publica||resource.url;if(src)images.push(src);}
    }
    const description=sectionText(block),price=elements.find(element=>element.tipo==='precio')?.importe;
    const cents=price!==undefined&&Number.isSafeInteger(Number(price)*100)?Number(price)*100:undefined;
    const group=block.actividad?.tipo==='servicio'?'Servicios':block.actividad?.tipo==='taller'?'Talleres':'Información';
    result.push({reference:{kind:'section',id:block.id},group,title,description,url:`${home}#seccion-${block.id}`,images:[...new Set(images)],content:editorial(block.id,title,description,images[0]||null,group,cents)});
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
  const results=await Promise.allSettled([fetchMarketingProducts(signal),fetchPublicProducts({signal,cache:'no-store'}),fetchLandingConfig({signal}),promotionService.list(signal),fetchPublishedSectionResources(signal),fetchSocialProfiles(signal)]);
  signal.throwIfAborted();
  const [products,published,landing,promotions,media,profiles]=results;
  const errors=results.flatMap((result,index)=>result.status==='rejected'?[`No pudimos actualizar ${['los productos','el catálogo público','las secciones publicadas','las promociones','los recursos publicados','los perfiles sociales'][index]}. Reintenta antes de difundir ese contenido.`]:[]);
  // Product links require BOTH an active administrative item and a public catalog row.
  const items=buildSharingItems({home,products:products.status==='fulfilled'?products.value:[],publicProducts:published.status==='fulfilled'?published.value:[],landing:landing.status==='fulfilled'?landing.value:null,promotions:promotions.status==='fulfilled'?promotions.value:[],resources:media.status==='fulfilled'?media.value:{}});
  return {items,errors,profiles:profiles.status==='fulfilled'?profiles.value:null};
}
export async function resolveSharingItem(reference:SharingReference,home:string,signal:AbortSignal):Promise<SharingItem>{
  const sources=await fetchSharingSources(home,signal);
  const item=sources.items.find(item=>sharingKey(item.reference)===sharingKey(reference));
  if(!item)throw new Error('Este contenido ya no está publicado o no pudimos verificar su disponibilidad. Actualiza Difusión antes de continuar.');
  return item;
}
