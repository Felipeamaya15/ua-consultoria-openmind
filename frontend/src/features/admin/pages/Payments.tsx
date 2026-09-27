import {useAdminForm} from '../hooks/useAdminForm';
import {AdminCard,Alert,Input,Toggle,Button,Icon} from '../components/ui';
const methods=[
 {id:'transbank',name:'Webpay / Transbank',icon:'card',desc:'Tarjeta débito, crédito y prepago chilenos',fields:['API Key','Comercio ID']},
 {id:'mercadopago',name:'Mercado Pago',icon:'card',desc:'Tarjetas y saldo Mercado Pago',fields:['Access Token']},
 {id:'paypal',name:'PayPal',icon:'paypal',desc:'PayPal y tarjetas internacionales',fields:['Client ID','Client Secret']},
 {id:'linkify',name:'Linkify',icon:'link',desc:'Pago por link',fields:['API Key']},
 {id:'transfer',name:'Transferencia bancaria',icon:'bank',desc:'Verificación manual',fields:['Banco','N° de cuenta','RUT','Nombre titular']}
];
export default function Payments(){const {form,setForm,save,saved}=useAdminForm('paymentConfiguration');
 return <form className="flex flex-col gap-5 max-w-2xl" onSubmit={e=>{e.preventDefault();save();}}><Alert variant="info">Activa los métodos de pago de tu tienda demo. Usa únicamente datos ficticios; no se conectan pasarelas ni se realizan cobros.</Alert>{methods.map(method=>{const current=form[method.id];return <AdminCard key={method.id}><div className="flex items-center justify-between gap-3 mb-3"><div className="flex items-center gap-3"><Icon name={method.icon} className="w-6 h-6"/><div><h2 className="font-semibold text-sm">{method.name}</h2><p className="text-xs text-[var(--muted-foreground)]">{method.desc}</p></div></div><Toggle ariaLabel={'Activar '+method.name} checked={current.enabled} onChange={enabled=>setForm({...form,[method.id]:{...current,enabled}})}/></div><div className="grid sm:grid-cols-2 gap-3 border-t border-[var(--border)] pt-3">{method.fields.map(field=><Input key={field} label={field} autoComplete="off" type={/key|token|secret/i.test(field)?'password':'text'} value={current.fields[field]??''} placeholder={method.id==='transfer'?'Dato de ejemplo':'Credencial demo'} onChange={e=>setForm({...form,[method.id]:{...current,fields:{...current.fields,[field]:e.target.value}}})}/>)}</div></AdminCard>})}{saved&&<Alert variant="success">Métodos de pago guardados.</Alert>}<Button type="submit">Guardar métodos de pago</Button></form>;
}
