import { useEffect, useState } from 'react';
import { API_BASE_URL } from '../api';
import { requestJson } from './services/apiRequest';
import type { VisualConfigOverrides, VisualSections } from '../features/storefront/visual/types';
import type { TemplateId } from '../features/storefront/data/mockData';
import { useStoreIdentity } from '../features/storefront/context/StoreIdentityContext';
import { setServerSelectedTemplate } from '../features/storefront/visual/resolveVisualConfig';
import { normalizeTemplateId } from '../features/storefront/visual/templates';

export type PaletteColors = VisualSections['global']['colors'];
export interface StorePalette { id:string; nombre:string; colores:PaletteColors }
export interface PaletteLibrary { sistema:StorePalette[]; compatibles?:StorePalette[]; propias:StorePalette[]; limite:number }
export type Appearance = Partial<Record<TemplateId,{visualConfig:VisualConfigOverrides;paleta_id:string|null}>>;
export const PALETTES_CHANGED = 'openmind:palettes-changed';
const endpoint = `${API_BASE_URL}/api/visual-config/`;
function auth() { const token=localStorage.getItem('token')||sessionStorage.getItem('token'); if(!token)throw new Error('Inicia sesión como propietario.');return {'Content-Type':'application/json',Authorization:`Token ${token}`}; }
export const fetchPalettes = (signal?:AbortSignal) => requestJson(endpoint+'paletas/',{signal,cache:'no-store'}) as Promise<PaletteLibrary>;
export const fetchAppearance = async (signal?:AbortSignal) => (await requestJson(endpoint+'apariencia/',{signal,cache:'no-store'}) as {plantillas:Appearance}).plantillas;
export async function savePalette(value:Pick<StorePalette,'nombre'|'colores'>,id?:string) {
  const result = await requestJson(endpoint+'paletas/'+(id?id+'/':''),{method:id?'PUT':'POST',headers:auth(),body:JSON.stringify(value)}) as {propias:StorePalette[]};
  window.dispatchEvent(new Event(PALETTES_CHANGED)); return result.propias;
}
export async function deletePalette(id:string) {
  const result=await requestJson(endpoint+'paletas/'+id+'/',{method:'DELETE',headers:auth()}) as {propias:StorePalette[]}; window.dispatchEvent(new Event(PALETTES_CHANGED));return result.propias;
}
export async function saveSelectedTemplate(template:TemplateId) {
  await requestJson(endpoint+'plantilla-seleccionada/',{method:'PUT',headers:auth(),body:JSON.stringify({plantilla_seleccionada:template})});
  if (typeof window !== 'undefined' && typeof Event !== 'undefined') {
    window.dispatchEvent(new Event(PALETTES_CHANGED));
  }
}
export async function fetchSelectedTemplate(signal?:AbortSignal):Promise<string> {
  const data=await requestJson(endpoint+'plantilla-seleccionada/',{signal,cache:'no-store'}) as {plantilla_seleccionada?:unknown;plantilla_activa?:unknown};
  if (typeof data?.plantilla_seleccionada === 'string' && data.plantilla_seleccionada) return data.plantilla_seleccionada;
  return typeof data?.plantilla_activa==='string'?data.plantilla_activa:'';
}
export async function saveAppearance(plantillas:Appearance) {
  await requestJson(endpoint+'apariencia/',{method:'PUT',headers:auth(),body:JSON.stringify({plantillas})});window.dispatchEvent(new Event(PALETTES_CHANGED));
}

export function usePaletteLibrary() {
  const {identity}=useStoreIdentity();const key=identity?`${identity.apiBaseUrl}:${identity.storeId}`:'';
  const [state,setState]=useState<{key:string;library:PaletteLibrary;appearance:Appearance;selectedTemplate?:TemplateId}|null>(null);
  const [error,setError]=useState(''),[revision,setRevision]=useState(0);
  useEffect(() => {
    if(!key)return;
    const controller=new AbortController();
    const refresh=()=>setRevision(value=>value+1);
    Promise.all([fetchPalettes(controller.signal),fetchAppearance(controller.signal),fetchSelectedTemplate(controller.signal).catch(()=>'')]).then(([library,appearance,rawSelected])=>{if(!controller.signal.aborted){const selectedTemplate=normalizeTemplateId(rawSelected);if(selectedTemplate)setServerSelectedTemplate(identity,selectedTemplate);setState({key,library,appearance,selectedTemplate});setError('');}}).catch(()=>{if(!controller.signal.aborted)setError('No pudimos cargar las paletas guardadas. Reintenta antes de guardarlas.');});
    window.addEventListener(PALETTES_CHANGED,refresh);window.addEventListener('focus',refresh);
    const channel=typeof BroadcastChannel==='undefined'?null:new BroadcastChannel(PALETTES_CHANGED+key);
    channel?.addEventListener('message',refresh);
    const publish=()=>channel?.postMessage('refresh');window.addEventListener(PALETTES_CHANGED,publish);
    return ()=>{controller.abort();window.removeEventListener(PALETTES_CHANGED,refresh);window.removeEventListener('focus',refresh);window.removeEventListener(PALETTES_CHANGED,publish);channel?.close();};
  },[key,revision]);
  const current=state?.key===key?state:null;
  return {library:current?.library,appearance:current?.appearance,selectedTemplate:current?.selectedTemplate,error,retry:()=>setRevision(value=>value+1)};
}
export function paletteOverrides(entry:Appearance[TemplateId],library?:PaletteLibrary):VisualConfigOverrides|undefined {
  if(!entry)return;
  const palette=library?.propias.find(item=>item.id===entry.paleta_id);
  return palette?{...entry.visualConfig,global:{...entry.visualConfig.global,colors:{...entry.visualConfig.global?.colors,...palette.colores}}}:entry.visualConfig;
}
