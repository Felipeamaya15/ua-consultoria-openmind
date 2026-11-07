import { useEffect, useRef, useState } from 'react';
import { AdminCard, Button, Input, Select, Textarea } from '../../admin/components/ui';
import { EmptyListState, ErrorState, LoadingState } from '../../../shared/components/states';
import { humanizeAdminError } from '../../admin/utils/humanizeError';
import { SOCIAL_LABELS, type SocialNetwork } from '../../landing/types/socialProfiles';
import { fetchSharingSources, resolveSharingItem, type SharingSources } from '../services/sharingService';
import { sharingChannels, sharingKey, sharingText, whatsappShareUrl, type SharingItem } from '../domain/sharing';
import type { PublicationFormat } from '../domain/types';
import './sharing.css';

interface Props {active:boolean;home:string;isCurrent:()=>boolean;onDirty:(dirty:boolean)=>void;onOpenSocial:()=>void;onPrepare:(item:SharingItem,format:PublicationFormat)=>Promise<boolean>}
export function Sharing({active,home,isCurrent,onDirty,onPrepare,onOpenSocial}:Props){
  const [sources,setSources]=useState<SharingSources|null>(null),[loading,setLoading]=useState(false),[attempt,setAttempt]=useState(0),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [key,setKey]=useState(''),[query,setQuery]=useState(''),[group,setGroup]=useState(''),[title,setTitle]=useState(''),[caption,setCaption]=useState(''),[channel,setChannel]=useState<SocialNetwork|''>(''),[busy,setBusy]=useState(false);
  const pending=useRef<AbortController|null>(null),writing=useRef(false),selected=useRef(key);selected.current=key;
  const item=sources?.items.find(item=>sharingKey(item.reference)===key)||null;
  const dirty=!!key&&!!item&&(title!==item.title||caption!==item.description);
  useEffect(()=>{onDirty(dirty);return()=>onDirty(false);},[dirty,onDirty]);
  useEffect(()=>()=>pending.current?.abort(),[]);
  useEffect(()=>{
    if(!active)return;const controller=new AbortController();setLoading(true);setError('');
    fetchSharingSources(home,controller.signal).then(result=>{if(!controller.signal.aborted&&isCurrent())setSources(result);}).catch(cause=>{if(!controller.signal.aborted&&isCurrent())setError(humanizeAdminError(cause instanceof Error?cause.message:''));}).finally(()=>{if(!controller.signal.aborted&&isCurrent())setLoading(false);});
    return()=>controller.abort();
  },[active,home,attempt]);
  const channels=sources?.profiles?sharingChannels(sources.profiles,item):[];
  const chosen=channels.find(entry=>entry.network===channel&&entry.compatible);
  const text=item?sharingText(title,caption,item.url):'';
  async function action(kind:'text'|'link'|'native'|'whatsapp'){
    if(!item||writing.current||!isCurrent())return;writing.current=true;setBusy(true);setError('');setNotice('');
    const controller=new AbortController();pending.current=controller;const start=key;
    try{
      const current=await resolveSharingItem(item.reference,home,controller.signal);if(!isCurrent()||selected.current!==start)throw new Error('La selección o sesión cambió. Revisa el contenido antes de continuar.');
      const content=sharingText(title,caption,current.url);
      if(kind==='text'||kind==='link'){
        if(!navigator.clipboard?.writeText)throw new Error('Este navegador no permite copiar automáticamente. Selecciona y copia el texto o enlace que aparece abajo.');
        await navigator.clipboard.writeText(kind==='text'?content:current.url);setNotice(kind==='text'?'Texto y enlace copiados. Todavía no se publicaron en ninguna red.':'Enlace público copiado.');
      }else if(kind==='native'){
        if(!navigator.share)throw new Error('La función de compartir del navegador no está disponible. Usa las acciones de copia y descarga.');
        await navigator.share({title,text:caption,url:current.url});setNotice('El navegador completó la acción de compartir. OpenMind no puede confirmar una publicación en redes.');
      }else{
        const opened=window.open(whatsappShareUrl(content),'_blank','noopener,noreferrer');
        // noopener can return null even when the tab opened: never claim delivery.
        setNotice(opened?'Se solicitó abrir WhatsApp con el texto preparado. Revisa el destinatario y confirma allí.':'Se solicitó abrir WhatsApp. Si no aparece, el navegador pudo bloquear la ventana; utiliza Copiar texto.');
      }
    }catch(cause){if(!controller.signal.aborted&&isCurrent())setError(cause instanceof Error&&cause.name==='AbortError'?'Se canceló la acción de compartir.':humanizeAdminError(cause instanceof Error?cause.message:''));}
    finally{writing.current=false;if(!controller.signal.aborted&&isCurrent())setBusy(false);}
  }
  async function prepare(format:PublicationFormat){if(!item||busy||writing.current)return;setError('');setNotice('');setBusy(true);try{await onPrepare(item,format);}catch(cause){if(isCurrent())setError(humanizeAdminError(cause instanceof Error?cause.message:''));}finally{if(isCurrent())setBusy(false);}}
  return <section className="sharing-workspace" aria-label="Difusión manual">
    <div className="sharing-heading"><div><h3>Difusión manual</h3><p>Prepara material con contenido publicado de tu tienda. Tú decides dónde y cuándo compartirlo.</p></div><Button variant="outline" disabled={busy||loading} onClick={()=>setAttempt(value=>value+1)}>Actualizar contenido</Button></div>
    {loading&&<LoadingState>Cargando contenido publicado y perfiles sociales…</LoadingState>}{error&&<ErrorState>{humanizeAdminError(error)}</ErrorState>}
    {sources?.errors.map(message=><p role="alert" key={message}>{message}</p>)}
    <div className="sharing-columns"><AdminCard><h4>1. Selecciona contenido publicado</h4><Input label="Buscar contenido para difundir" value={query} onChange={event=>setQuery(event.target.value)} /><Select label="Tipo de contenido" value={group} options={[{value:'',label:'Todos'},...['Productos','Destacados','Promociones','Servicios','Talleres','Información','Multimedia'].map(value=>({value,label:value}))]} onChange={event=>setGroup(event.target.value)} />
      <div className="sharing-items">{(sources?.items||[]).filter(item=>(!group||item.group===group)&&`${item.title} ${item.description}`.toLocaleLowerCase('es').includes(query.toLocaleLowerCase('es'))).map(row=><button key={sharingKey(row.reference)} type="button" disabled={busy||loading} aria-pressed={key===sharingKey(row.reference)} onClick={()=>{if(dirty&&!window.confirm('Tienes un texto de difusión editado. ¿Descartarlo y elegir otro contenido?'))return;setKey(sharingKey(row.reference));setTitle(row.title);setCaption(row.description);setError('');setNotice('');}}><strong>{row.title}</strong><small>{row.group}</small></button>)}</div>
      {!loading&&!sources?.items.length&&<EmptyListState>No hay contenido publicado disponible. Publica una sección o agrega productos disponibles.</EmptyListState>}
      <p>Biblioteca solo muestra recursos usados en secciones visibles. Los archivos privados conservan su acceso restringido.</p>
    </AdminCard><AdminCard><h4>2. Prepara el texto y el canal</h4>{item?<>
      {item.images[0]&&<img className="sharing-source-image" src={item.images[0]} alt={item.title} loading="lazy" referrerPolicy="no-referrer" />}
      <Input label="Título para difundir" value={title} maxLength={255} disabled={busy} onChange={event=>setTitle(event.target.value)} /><Textarea label="Texto descriptivo para compartir" value={caption} maxLength={3000} rows={5} disabled={busy} onChange={event=>setCaption(event.target.value)} />
      <p><a href={item.url} target="_blank" rel="noopener noreferrer" className="marketing-text-link">Revisar enlace público ↗</a></p>
      {/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/)/.test(item.url)&&<p>Este enlace usa localhost y solo sirve en este equipo. Para difundir fuera de él necesitas el dominio público de la tienda.</p>}
      <Select label="Red social registrada" disabled={busy} value={chosen?channel:''} options={[{value:'',label:'Selecciona una red'},...channels.filter(entry=>entry.compatible).map(entry=>({value:entry.network,label:SOCIAL_LABELS[entry.network]}))]} onChange={event=>setChannel(event.target.value as SocialNetwork)} />
      {!channels.length&&<p>No hay perfiles activos válidos. <button type="button" className="marketing-text-link" onClick={onOpenSocial}>Configurar Redes sociales</button>.</p>}
      {channels.some(entry=>!entry.compatible)&&<p>YouTube solo se ofrece como canal para un video de YouTube ya publicado; no se suben videos desde OpenMind.</p>}
      {chosen&&<p><a href={chosen.url} target="_blank" rel="noopener noreferrer">Abrir perfil registrado de {SOCIAL_LABELS[chosen.network]} ↗</a>. Perfil registrado; publicación automática no autorizada. {chosen.network==='instagram'||chosen.network==='facebook'?'Prepara y descarga la imagen; publícala manualmente en esa red.':''}</p>}
      <div className="sharing-actions"><Button disabled={busy||loading} onClick={()=>void action('text')}>Copiar texto y enlace</Button><Button variant="outline" disabled={busy||loading} onClick={()=>void action('link')}>Copiar enlace público</Button>{chosen?.network==='whatsapp'&&<Button disabled={busy||loading} onClick={()=>void action('whatsapp')}>Abrir WhatsApp con el texto</Button>}{typeof navigator!=='undefined'&&typeof navigator.share==='function'&&<Button variant="outline" disabled={busy||loading} onClick={()=>void action('native')}>Compartir con el navegador</Button>}</div>
      <details><summary>Texto y enlace para copiar manualmente</summary><pre className="sharing-copy-text">{text}</pre></details>
      <h4>3. Prepara la imagen en Publicaciones</h4><p>Se abrirá el generador que ya usas, con los datos seleccionados. Allí podrás editar, guardar borrador y descargar PNG o JPG.</p><div className="sharing-actions"><Button disabled={busy||loading} onClick={()=>void prepare('square')}>Preparar imagen 1:1</Button><Button variant="outline" disabled={busy||loading} onClick={()=>void prepare('story')}>Preparar imagen 9:16</Button></div>
    </>:<p>{key?'El contenido seleccionado ya no está publicado o no pudo verificarse. Actualiza y selecciona otro.':'Elige un contenido de la lista para ver su vista previa y preparar el material.'}</p>}</AdminCard></div>
    {notice&&<p role="status">{notice}</p>}
  </section>;
}
