import { humanizeAdminError } from '../../features/admin/utils/humanizeError';
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AdminModal } from '../../features/admin/components/ui/AdminModal';
import { Button, Input, Textarea, Toast } from '../../features/storefront/components/ui';
import './feedback.css';

type Variant = 'success' | 'error' | 'warning' | 'info';
export type FeedbackField = {name: string; label: string; multiline?: boolean; maxLength?: number; initialValue?: string; required?: boolean};
export type Confirmation = {title: string; message: string; confirmLabel?: string; cancelLabel?: string};
type Question = Confirmation & {fields: FeedbackField[]};
type Values = Record<string, string>;
type Pending = Question & {id: number; owner: symbol; root: HTMLElement; resolve: (values: Values | null) => void};
type Notice = {id: number; root: HTMLElement; message: string; variant: Variant};
type FeedbackContextValue = {request: (options: Question, owner: symbol) => Promise<Values | null>; cancel: (owner: symbol) => void; notify: (message: string, variant?: Variant) => void};
const FeedbackContext = createContext<FeedbackContextValue | null>(null);

function activeRoot() {
  const focused=document.activeElement instanceof HTMLElement?document.activeElement:null;
  return focused?.closest<HTMLElement>('[data-storefront-visual],.admin-shell') || document.querySelector<HTMLElement>('[data-storefront-visual]') || document.body;
}

function FeedbackDialog({item,onFinish}:{item:Pending;onFinish:(values:Values|null)=>void}) {
  const id=useId();
  const [errors,setErrors]=useState<Record<string,string>>({});
  return <AdminModal open onClose={()=>onFinish(null)} title={item.title} descriptionId={id} size="md" className="feedback-dialog">
    <form noValidate onSubmit={event=>{
      event.preventDefault();
      const data=new FormData(event.currentTarget);
      const values=Object.fromEntries(item.fields.map(field=>[field.name,String(data.get(field.name)||'').trim()]));
      for(const field of item.fields){
        if(field.required!==false&&!values[field.name]){
          const input=event.currentTarget.elements.namedItem(field.name) as HTMLInputElement|HTMLTextAreaElement;
          setErrors({[field.name]:'Completa este campo.'});input.focus();return;
        }
      }
      onFinish(values);
    }} className="space-y-4">
      <p id={id}>{item.message}</p>
      {item.fields.map(field=>field.multiline?<Textarea key={field.name} name={field.name} label={field.label} required={field.required!==false} error={errors[field.name]} maxLength={field.maxLength||1000} defaultValue={field.initialValue||''} onInput={()=>setErrors({})} />:<Input key={field.name} name={field.name} label={field.label} required={field.required!==false} error={errors[field.name]} maxLength={field.maxLength||200} defaultValue={field.initialValue||''} onInput={()=>setErrors({})} />)}
      <div className="feedback-actions"><Button type="button" variant="outline" data-modal-autofocus onClick={()=>onFinish(null)}>{item.cancelLabel||'Cancelar'}</Button><Button type="submit">{item.confirmLabel||'Confirmar'}</Button></div>
    </form>
  </AdminModal>;
}

export function FeedbackProvider({children}:{children:ReactNode}) {
  const sequence=useRef(0),pending=useRef<Pending[]>([]);
  const [active,setActive]=useState<Pending|null>(null);
  const [notices,setNotices]=useState<Notice[]>([]);
  const request=useCallback((options:Question,owner:symbol)=>{
    if(pending.current.some(item=>item.owner===owner))return Promise.resolve(null);
    return new Promise<Values|null>(resolve=>{
      const item={...options,id:++sequence.current,owner,root:activeRoot(),resolve};
      pending.current.push(item);
      if(pending.current.length===1)setActive(item);
    });
  },[]);
  const finish=useCallback((id:number,values:Values|null)=>{
    const item=pending.current[0];
    if(!item||item.id!==id)return;
    pending.current.shift();setActive(pending.current[0]||null);item.resolve(values);
  },[]);
  const cancel=useCallback((owner:symbol)=>{
    const removed=pending.current.filter(item=>item.owner===owner);
    pending.current=pending.current.filter(item=>item.owner!==owner);
    setActive(previous=>previous?.owner===owner?pending.current[0]||null:previous);
    removed.forEach(item=>item.resolve(null));
  },[]);
  const notify=useCallback((message:string,variant:Variant='success')=>{
    const notice={id:++sequence.current,root:activeRoot(),message:variant==='error'?humanizeAdminError(message):message,variant};
    setNotices(previous=>[...previous,notice].slice(-3));
  },[]);
  const dismiss=useCallback((id:number)=>setNotices(previous=>previous.filter(item=>item.id!==id)),[]);
  useEffect(()=>()=>{pending.current.splice(0).forEach(item=>item.resolve(null));},[]);
  const context=useMemo(()=>({request,cancel,notify}),[request,cancel,notify]);
  return <FeedbackContext.Provider value={context}>{children}
    {active&&createPortal(<FeedbackDialog key={active.id} item={active} onFinish={values=>finish(active.id,values)}/>,active.root.isConnected?active.root:document.body)}
    {Array.from(new Set(notices.map(notice=>notice.root))).map((root,index)=>createPortal(<div className="feedback-toasts">{notices.filter(notice=>notice.root===root).map(notice=><Toast key={notice.id} variant={notice.variant} message={notice.message} onClose={()=>dismiss(notice.id)} duration={notice.variant==='error'?0:6000}/>)}</div>,root.isConnected?root:document.body,String(index)))}
  </FeedbackContext.Provider>;
}

export function useFeedback() {
  const context=useContext(FeedbackContext);
  if(!context)throw new Error('La interfaz de confirmación no está disponible.');
  const owner=useRef(Symbol('feedback'));
  useEffect(()=>()=>context.cancel(owner.current),[context]);
  return useMemo(()=>({
    confirm:async(options:Confirmation)=>(await context.request({...options,fields:[]},owner.current))!==null,
    ask:(options:Question)=>context.request(options,owner.current),
    notify:context.notify,
  }),[context]);
}
