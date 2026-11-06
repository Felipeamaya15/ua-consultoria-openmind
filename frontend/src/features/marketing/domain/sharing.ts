import type { PublicationContent } from './types';
import type { SocialNetwork, SocialProfiles } from '../../landing/types/socialProfiles';
import { SOCIAL_NETWORKS, profileLink } from '../../landing/types/socialProfiles';

export type SharingKind='product'|'promotion'|'section'|'media';
export interface SharingReference {kind:SharingKind;id:string}
export interface SharingItem {reference:SharingReference;group:'Productos'|'Destacados'|'Promociones'|'Servicios'|'Talleres'|'Información'|'Multimedia';title:string;description:string;url:string;images:string[];content:PublicationContent;youtube?:boolean}
export const sharingKey=(reference:SharingReference)=>`${reference.kind}:${reference.id}`;
export function readSharingReference(value:unknown):SharingReference|null {
  if(!value||typeof value!=='object')return null;
  const item=value as SharingReference;
  const valid=item.kind==='product'?/^[a-f0-9]{24}$/i.test(item.id):item.kind==='promotion'?/^[1-9][0-9]*$/.test(item.id):['section','media'].includes(item.kind)&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(item.id);
  return valid?{kind:item.kind,id:item.id}:null;
}
export function sharingChannels(profiles:SocialProfiles,item:SharingItem|null):{network:SocialNetwork;url:string;compatible:boolean}[]{
  return SOCIAL_NETWORKS.flatMap(network=>{
    const profile=profiles[network];if(!profile?.activo||!profile.perfil)return [];
    const link=profileLink(network,profile.perfil);if(!link.url)return [];
    return [{network,url:link.url,compatible:network!=='youtube'||!!item?.youtube}];
  });
}
export const sharingText=(title:string,text:string,url:string)=>[title.trim(),text.trim(),url].filter(Boolean).join('\n\n');
export const whatsappShareUrl=(text:string)=>`https://wa.me/?text=${encodeURIComponent(text)}`;
