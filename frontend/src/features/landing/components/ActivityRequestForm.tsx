import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AdminModal as Modal } from '../../admin/components/ui/AdminModal';
import { Button, Input, Textarea } from '../../storefront/components/ui';
import { ErrorState } from '../../../shared/components/states';
import { humanizeAdminError } from '../../admin/utils/humanizeError';
import { submitActivity, type ActivityRequestKind } from '../services/activityService';
import './activities.css';

export function ActivityRequestForm({sectionId,kind,label}:{sectionId:string;kind:ActivityRequestKind;label:string}) {
  const [open,setOpen]=useState(false),[form,setForm]=useState({nombre:'',apellido:'',email:'',telefono:'',mensaje:'',consentimiento:false});
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[sent,setSent]=useState(false);
  const pending=useRef<AbortController|null>(null),retry=useRef<{signature:string;id:string}|null>(null),sending=useRef(false);
  useEffect(()=>()=>pending.current?.abort(),[]);
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(sending.current)return;
    if(!event.currentTarget.reportValidity()||!form.consentimiento)return;
    const data={...form,nombre:form.nombre.trim(),apellido:form.apellido.trim(),email:form.email.trim().toLowerCase(),telefono:form.telefono.trim(),mensaje:form.mensaje.trim()};
    const signature=JSON.stringify(data);if(retry.current?.signature!==signature)retry.current={signature,id:crypto.randomUUID()};
    const controller=new AbortController();pending.current=controller;sending.current=true;setBusy(true);setError('');
    try{await submitActivity(sectionId,kind,{...data,solicitud_id:retry.current.id},controller.signal);if(!controller.signal.aborted){setSent(true);setForm({nombre:'',apellido:'',email:'',telefono:'',mensaje:'',consentimiento:false});}}
    catch(cause){if(!controller.signal.aborted)setError(humanizeAdminError(cause instanceof Error?cause.message:''));}
    finally{sending.current=false;if(!controller.signal.aborted)setBusy(false);}
  }
  return <><button type="button" className="section-element-link" onClick={()=>setOpen(true)}>{label}</button>
    <Modal open={open} onClose={()=>{if(!sending.current)setOpen(false);}} title={kind==='consulta'?'Solicitar información':'Inscripción a taller gratuito'} className="activity-request-dialog">
      {sent?<div role="status"><h3>Recibimos tus datos</h3><p>Si ya existía una solicitud, se conserva sin duplicarla. La tienda gestionará tu solicitud. Esto no acredita pagos ni garantiza un cupo confirmado.</p><Button type="button" onClick={()=>setOpen(false)}>Cerrar</Button></div>:<form onSubmit={submit} className="activity-public-form">
        <p>{kind==='consulta'?'Deja tu consulta para que la tienda pueda responderte. No te inscribe ni reserva cupos.':'La inscripción es gratuita. La tienda puede requerir confirmación; los cupos se verifican al enviar.'}</p>
        <fieldset disabled={busy}>
          <div className="activity-settings-grid"><Input label="Nombre" autoComplete="given-name" required maxLength={100} value={form.nombre} onChange={event=>setForm({...form,nombre:event.target.value})} /><Input label="Apellido (opcional)" autoComplete="family-name" maxLength={100} value={form.apellido} onChange={event=>setForm({...form,apellido:event.target.value})} /></div>
          <Input label="Correo electrónico" type="email" autoComplete="email" required maxLength={254} value={form.email} onChange={event=>setForm({...form,email:event.target.value})} />
          <Input label="Teléfono (opcional)" type="tel" autoComplete="tel" maxLength={40} pattern={String.raw`\+?[0-9 \(\)\-]{5,40}`} value={form.telefono} onChange={event=>setForm({...form,telefono:event.target.value})} />
          <Textarea label={kind==='consulta'?'Tu consulta':'Comentario (opcional)'} required={kind==='consulta'} maxLength={3000} value={form.mensaje} onChange={event=>setForm({...form,mensaje:event.target.value})} />
          <label className="activity-consent"><input type="checkbox" required checked={form.consentimiento} onChange={event=>setForm({...form,consentimiento:event.target.checked})} /><span>Acepto que esta tienda utilice los datos que proporciono para {kind==='consulta'?'responder esta consulta':'gestionar mi inscripción y comunicarme información de participación'}. Esto no autoriza campañas publicitarias.</span></label>
          <Button type="submit" loading={busy}>{busy?'Enviando solicitud…':kind==='consulta'?'Enviar consulta':'Enviar inscripción'}</Button>
        </fieldset>
        {busy&&<p role="status">Enviando solicitud…</p>}{error&&<ErrorState>{humanizeAdminError(error)}</ErrorState>}
      </form>}
    </Modal></>;
}
