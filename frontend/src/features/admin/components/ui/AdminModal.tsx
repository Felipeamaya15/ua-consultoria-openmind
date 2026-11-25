import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
export function AdminModal({open,onClose,title,children,size='lg',className='',portal=false,descriptionId}:{open:boolean;onClose:()=>void;title?:string;children:ReactNode;size?:'sm'|'md'|'lg'|'xl';className?:string;portal?:boolean;descriptionId?:string}) {
  const ref=useRef<HTMLDialogElement>(null);
  const titleId=useId();
  useEffect(()=>{
    const dialog=ref.current;
    if(!dialog)return;
    if(!open){if(dialog.open)dialog.close();return;}
    const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;
    const fallback=previous?.closest('main,[data-storefront-visual]')?.querySelector<HTMLElement>('h1,h2');
    if(!dialog.open)dialog.showModal();
    dialog.querySelector<HTMLElement>('[data-modal-autofocus]')?.focus();
    return()=>{
      if(dialog.open)dialog.close();
      if(previous?.isConnected&&!previous.matches(':disabled'))previous.focus();
      else if(fallback?.isConnected){const hadTabIndex=fallback.hasAttribute('tabindex');fallback.tabIndex=-1;fallback.focus();if(!hadTabIndex)fallback.removeAttribute('tabindex');}
    };
  },[open]);
  function trapFocus(event:KeyboardEvent<HTMLDialogElement>) {
    if(event.key!=='Tab')return;
    const dialog=event.currentTarget;
    const targets=Array.from(dialog.querySelectorAll<HTMLElement>('button,input,select,textarea,a[href],[tabindex]')).filter(element=>element.tabIndex>=0&&!element.matches(':disabled')&&element.getClientRects().length>0);
    const first=targets[0],last=targets[targets.length-1];
    if(!first){event.preventDefault();dialog.focus();return;}
    if(event.shiftKey&&(document.activeElement===first||!dialog.contains(document.activeElement))){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&(document.activeElement===last||!dialog.contains(document.activeElement))){event.preventDefault();first.focus();}
  }
  const dialog=<dialog ref={ref} onKeyDown={trapFocus} onCancel={event=>{event.preventDefault();onClose();}} onClick={e=>{if(e.target===e.currentTarget)onClose();}} aria-labelledby={title?titleId:undefined} aria-describedby={descriptionId} aria-modal="true" className={'admin-dialog rounded-2xl bg-white text-[var(--foreground)] shadow-2xl w-[calc(100%-32px)] '+({sm:'max-w-sm',md:'max-w-md',lg:'max-w-lg',xl:'max-w-2xl'}[size])+' '+className}>{open&&<><div className="p-5 border-b border-[var(--border)] flex justify-between items-center"><h2 id={titleId} className="text-lg font-semibold">{title}</h2><button type="button" aria-label="Cerrar" onClick={onClose} className="p-1 text-[var(--muted-foreground)]">✕</button></div><div className="p-5">{children}</div></>}</dialog>;
  return portal&&typeof document!=='undefined'?createPortal(dialog,document.body):dialog;
}
