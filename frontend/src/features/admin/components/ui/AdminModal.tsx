import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
export function AdminModal({open,onClose,title,children,size='lg',className='',portal=false}:{open:boolean;onClose:()=>void;title?:string;children:ReactNode;size?:'sm'|'md'|'lg'|'xl';className?:string;portal?:boolean}) {
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const dialog=ref.current; if(open) dialog?.showModal(); else dialog?.close();},[open]);
  const dialog=<dialog ref={ref} onCancel={event=>{event.preventDefault();onClose();}} onClick={e=>{if(e.target===e.currentTarget)onClose();}} aria-label={title} className={'admin-dialog rounded-2xl bg-white text-[var(--foreground)] shadow-2xl w-[calc(100%-32px)] '+({sm:'max-w-sm',md:'max-w-md',lg:'max-w-lg',xl:'max-w-2xl'}[size])+' '+className}>{open&&<><div className="p-5 border-b border-[var(--border)] flex justify-between items-center"><h2 className="text-lg font-semibold">{title}</h2><button type="button" aria-label="Cerrar" onClick={onClose} className="p-1 text-[var(--muted-foreground)]">✕</button></div><div className="p-5">{children}</div></>}</dialog>;
  return portal&&typeof document!=='undefined'?createPortal(dialog,document.body):dialog;
}
