import { useState } from 'react';
import { useAdminForm } from '../hooks/useAdminForm';
import { AdminCard, Alert, Input, Toggle, Button, Icon } from '../components/ui';
import { API_BASE_URL } from '../../../api';

const methods = [
 {id:'transbank',name:'Webpay / Transbank',icon:'card',desc:'Tarjeta débito, crédito y prepago chilenos',fields:['API Key','Comercio ID']},
 {id:'mercadopago',name:'Mercado Pago',icon:'card',desc:'Tarjetas y saldo Mercado Pago',fields:['Access Token']},
 {id:'paypal',name:'PayPal',icon:'paypal',desc:'PayPal y tarjetas internacionales',fields:['Client ID','Client Secret']},
 {id:'linkify',name:'Linkify',icon:'link',desc:'Pago por link',fields:['API Key']},
 {id:'transfer',name:'Transferencia bancaria',icon:'bank',desc:'Verificación manual',fields:['Banco','N° de cuenta','RUT','Nombre titular']}
];

export default function Payments() {
  const { form, setForm, save: localSave, saved } = useAdminForm('paymentConfiguration');
  const [isSyncing, setIsSyncing] = useState(false);
  const [backendError, setBackendError] = useState('');

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    localSave();
    setIsSyncing(true);
    setBackendError('');

    try {
      // Implementación futura: Obtener token del estado global/auth
      const token = localStorage.getItem('token') || '';
      
      const response = await fetch(`${API_BASE_URL}/api/pagos/configuracion/`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify(form)
      });

      if (!response.ok) {
        throw new Error('No se pudieron sincronizar los métodos de pago con el servidor.');
      }
    } catch (err) {
      setBackendError(err instanceof Error ? err.message : 'Error desconocido al guardar.');
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <form className="flex flex-col gap-5 max-w-2xl" onSubmit={handleSave}>
      <Alert variant="info">
        Activa los métodos de pago de tu tienda. Los pagos seleccionados aquí estarán disponibles automáticamente para el cliente en el checkout.
      </Alert>
      
      {methods.map(method => {
        const current = form[method.id];
        return (
          <AdminCard key={method.id}>
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-3">
                <Icon name={method.icon} className="w-6 h-6"/>
                <div>
                  <h2 className="font-semibold text-sm">{method.name}</h2>
                  <p className="text-xs text-[var(--muted-foreground)]">{method.desc}</p>
                </div>
              </div>
              <Toggle ariaLabel={`Activar ${method.name}`} checked={current.enabled} onChange={enabled => setForm({...form, [method.id]: {...current, enabled}})}/>
            </div>
            <div className="grid sm:grid-cols-2 gap-3 border-t border-[var(--border)] pt-3">
              {method.fields.map(field => (
                <Input 
                  key={field} 
                  label={field} 
                  autoComplete="off" 
                  type={/key|token|secret/i.test(field) ? 'password' : 'text'} 
                  value={current.fields[field] ?? ''} 
                  placeholder={method.id === 'transfer' ? 'Dato de ejemplo' : 'Credencial de producción'} 
                  onChange={e => setForm({...form, [method.id]: {...current, fields: {...current.fields, [field]: e.target.value}}})}
                />
              ))}
            </div>
          </AdminCard>
        )
      })}
      
      {backendError && <Alert variant="error">{backendError}</Alert>}
      {saved && !backendError && !isSyncing && <Alert variant="success">Métodos de pago integrados y actualizados exitosamente en la tienda.</Alert>}
      
      <Button type="submit" loading={isSyncing}>Guardar métodos de pago</Button>
    </form>
  );
}