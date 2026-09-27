import { useId, type ReactNode } from 'react';
import { Icon as StoreIcon } from '../../../storefront/components/ui/Icon';
export { Button, Input, Textarea, Select, Badge, Alert, EmptyState, InstitutionalBadge } from '../../../storefront/components/ui';
export { AdminModal as Modal } from './AdminModal';
export type IconName = string;
const extraIcons: Record<string,ReactNode> = {
  mail:<><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></>,
  shield:<><path d="m12 3 8 3v6c0 4-4 7-8 9-4-2-8-5-8-9V6z"/><path d="m8 12 3 3 5-6"/></>,
  menu:<path d="M4 6h16M4 12h16M4 18h16"/>,
  refresh:<><path d="M20 7a8 8 0 1 0 1 9M20 3v5h-5"/></>,
  paypal:<path d="m6 21 3-18h6c8 0 7 11-1 11h-3l-1 7H6Zm5-12h3c2 0 3-3 0-3h-2z"/>
};
export function Icon({name,className='w-4 h-4'}:{name:string;className?:string}) {
  if (!extraIcons[name]) return <StoreIcon name={name === 'file' ? 'orders' : name} className={className}/>;
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>{extraIcons[name]}</svg>;
}
export function Toggle({checked,onChange,label,id,ariaLabel}:{checked:boolean;onChange:(v:boolean)=>void;label?:string;id?:string;ariaLabel?:string}) {
  const generated = useId();
  return <label htmlFor={id ?? generated} className="flex items-center gap-3 cursor-pointer select-none"><span className="relative shrink-0"><input id={id ?? generated} type="checkbox" className="sr-only peer" aria-label={ariaLabel || label || 'Activar opción'} checked={checked} onChange={e=>onChange(e.target.checked)}/><span className={'block w-10 h-5 rounded-full transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 '+(checked?'bg-[var(--primary)]':'bg-[var(--border)]')}/><span className={'absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform '+(checked?'translate-x-5':'')}/></span>{label && <span className="text-sm">{label}</span>}</label>;
}
export function AdminCard({children,className=''}:{children:ReactNode;className?:string}) {return <section className={'bg-white border border-[var(--border)] rounded-xl p-5 '+className}>{children}</section>;}
export function Tabs({tabs,active,onChange}:{tabs:{id:string;label:string}[];active:string;onChange:(id:string)=>void}) {
  return <div role="tablist" className="flex overflow-x-auto border-b border-[var(--border)] gap-1">{tabs.map(tab=><button type="button" role="tab" aria-selected={active===tab.id} key={tab.id} onClick={()=>onChange(tab.id)} className={'shrink-0 px-4 py-2.5 text-sm border-b-2 '+(active===tab.id?'border-[var(--primary)] text-[var(--primary)]':'border-transparent text-[var(--muted-foreground)]')}>{tab.label}</button>)}</div>;
}
