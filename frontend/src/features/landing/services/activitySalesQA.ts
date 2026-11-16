import { authService } from '../../auth/services/authService';
const API = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/+$/,'')+'/api/landing/ventas-actividades-qa/';
export type SaleRow = {id:string; pedido_id:number; pedido:string; titulo:string; tipo:string; inicio:string; cantidad:number; importe:number; estado:string; pedido_estado:string; vence:string; politica:string; horas:number; plazo_vigente:boolean; modo?:'qa'|'transfer'|'webpay'|'external'; medio_pago?:string; reembolso_externo?:boolean; ambiente?:string; reembolso_total_webpay?:boolean; puede_solicitar:boolean; comprador?:string; correo?:string; devolucion:{estado?:string;motivo?:string;monto?:number}};
export async function salesQA<T>(path='', data?:object, signal?:AbortSignal):Promise<T|null>{
 const token=authService.getToken();if(!token)return null;
 const response=await fetch(API+path,{method:data?'POST':'GET',headers:{Authorization:`Token ${token}`,'Content-Type':'application/json'},...(data?{body:JSON.stringify(data)}:{}),cache:'no-store',signal});
 if(response.status===404&&!data)return null;
 const body=await response.json().catch(()=>null);
 if(authService.getToken()!==token)throw new Error('La sesión cambió.');
 if(!response.ok||!body?.exito){const message=body?.error?.detalles||body?.detail||body?.mensaje;throw new Error(typeof message==='string'?message:'No se pudo realizar la operación. Revisa el estado del pedido.');}
 return body.data as T;
}
export const saleMoney=(value:number)=>new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(value);
export const saleDate=(value:string)=>new Date(value).toLocaleString('es-CL');
export const saleState=(row:SaleRow)=>row.devolucion.estado==='reembolsada_externa'?'Devolución confirmada por la pasarela':row.devolucion.estado==='reembolso_externo_revision'?'Reembolso en revisión':row.devolucion.estado==='reembolsada_webpay'?'Devolución Webpay confirmada':row.devolucion.estado==='reembolso_en_revision'?'Reembolso Webpay en revisión':row.devolucion.estado==='reembolsada_manual'?'Devolución registrada':row.devolucion.estado==='autorizada'?'Devolución autorizada, pendiente de ejecución':row.devolucion.estado==='reembolsada_simulada'?'Devuelta (simulación)':row.estado==='confirmada'?'Inscripción confirmada':row.estado==='en_pago'?'Pendiente de pago':row.estado==='liberada'?'Cupo liberado':'Reserva en revisión';
