import React, { useState, useEffect } from 'react';
import { useAdminForm } from '../hooks/useAdminForm';
import { AdminCard, Alert, Input, Toggle, Button, Icon, Select } from '../components/ui';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const TIENDA_ID = 1;

// Métodos de demostración secundarios
const otherMethods = [
  { id: 'mercadopago', name: 'Mercado Pago', icon: 'card', desc: 'Tarjetas y saldo Mercado Pago', fields: ['Access Token'] },
  { id: 'paypal', name: 'PayPal', icon: 'paypal', desc: 'PayPal y tarjetas internacionales', fields: ['Client ID', 'Client Secret'] },
  { id: 'linkify', name: 'Linkify', icon: 'link', desc: 'Pago por link', fields: ['API Key'] },
  { id: 'transfer', name: 'Transferencia bancaria', icon: 'bank', desc: 'Verificación manual', fields: ['Banco', 'N° de cuenta', 'RUT', 'Nombre titular'] }
];

export default function Payments() {
  const { form, setForm, save, saved } = useAdminForm('paymentConfiguration');

  // Estados reactivos para la configuración real de Transbank
  const [tbActivo, setTbActivo] = useState(true);
  const [tbCodigo, setTbCodigo] = useState('');
  const [tbApiKey, setTbApiKey] = useState('');
  const [tbAmbiente, setTbAmbiente] = useState('INTEGRACION');
  const [tbMaskedKey, setTbMaskedKey] = useState('');
  const [tbIsConfigured, setTbIsConfigured] = useState(false);
  const [tbLoading, setTbLoading] = useState(true);
  const [tbSaving, setTbSaving] = useState(false);
  const [tbFeedback, setTbFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const getAuthHeaders = () => {
    const token =
      localStorage.getItem('token') ||
      sessionStorage.getItem('token') ||
      'b130c016ab2e6db86bee2da41dd5e3645c6abe93'; // Fallback a tu token activo
    return {
      'Content-Type': 'application/json',
      Authorization: `Token ${token}`,
    };
  };

  // 1. Obtener la configuración actual desde PostgreSQL mediante Django
  useEffect(() => {
    setTbLoading(true);
    fetch(`${API_BASE}/api/catalog/tiendas/${TIENDA_ID}/configuracion/transbank/`, {
      method: 'GET',
      headers: getAuthHeaders(),
    })
      .then((res) => res.json())
      .then((res) => {
        if (res.exito && res.data) {
          setTbCodigo(res.data.codigo_comercio || '');
          setTbAmbiente(res.data.ambiente || 'INTEGRACION');
          setTbActivo(res.data.activo ?? true);
          setTbMaskedKey(res.data.api_key_enmascarada || '');
          setTbIsConfigured(Boolean(res.data.configurado));
        }
      })
      .catch((err) => {
        console.error('Error al conectar con Transbank:', err);
      })
      .finally(() => {
        setTbLoading(false);
      });
  }, []);

  // 2. Persistir credenciales en el backend con Clean Architecture
  const handleSaveTransbank = async () => {
    setTbSaving(true);
    setTbFeedback(null);

    const payload = {
      codigo_comercio: tbCodigo.trim(),
      api_key: tbApiKey.trim() || (tbIsConfigured ? tbMaskedKey : ''),
      ambiente: tbAmbiente,
      activo: tbActivo,
    };

    try {
      const res = await fetch(`${API_BASE}/api/catalog/tiendas/${TIENDA_ID}/configuracion/transbank/`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (res.ok && data.exito) {
        setTbFeedback({
          type: 'success',
          message: 'Configuración de Transbank guardada exitosamente.',
        });
        setTbMaskedKey(data.data.api_key_enmascarada || '');
        setTbApiKey('');
        setTbIsConfigured(true);

        // Sincronizar con el estado local para que el checkout reconozca si está activo
        if (form && setForm) {
          setForm({
            ...form,
            transbank: {
              enabled: tbActivo,
              fields: {
                ...(form.transbank?.fields || {}),
                'Comercio ID': tbCodigo,
                'API Key': data.data.api_key_enmascarada || '••••••••',
              },
            },
          });
        }
        return true;
      } else {
        const errorDetail = data.error?.detalles
          ? Object.values(data.error.detalles).flat().join(' ')
          : data.mensaje || 'Error al guardar la configuración de Transbank.';
        setTbFeedback({ type: 'error', message: errorDetail });
        return false;
      }
    } catch {
      setTbFeedback({ type: 'error', message: 'No se pudo conectar con el servidor backend.' });
      return false;
    } finally {
      setTbSaving(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    save();
    await handleSaveTransbank();
  };

  return (
    <form className="flex flex-col gap-5 max-w-2xl" onSubmit={handleSubmit}>
      <Alert variant="info">
        Configura las pasarelas de pago de tu tienda. Webpay Plus se encuentra conectado a tu backend y base de datos real.
      </Alert>

      {/* ================= TARJETA REAL: WEBPAY / TRANSBANK ================= */}
      <AdminCard>
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <Icon name="card" className="w-6 h-6 text-[var(--primary)]" />
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-semibold text-sm">Webpay / Transbank</h2>
                <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-[#ebfdf2] text-[#027a48]">
                  API Conectada
                </span>
              </div>
              <p className="text-xs text-[var(--muted-foreground)]">
                Tarjeta débito, crédito y prepago chilenos
              </p>
            </div>
          </div>
          <Toggle
            ariaLabel="Activar Webpay / Transbank"
            checked={tbActivo}
            onChange={(enabled) => setTbActivo(enabled)}
          />
        </div>

        {tbFeedback && (
          <div className="mb-3">
            <Alert variant={tbFeedback.type}>{tbFeedback.message}</Alert>
          </div>
        )}

        {tbLoading ? (
          <div className="border-t border-[var(--border)] pt-3 text-xs text-[var(--muted-foreground)]">
            Cargando credenciales de pasarela...
          </div>
        ) : (
          <div className="flex flex-col gap-3 border-t border-[var(--border)] pt-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <Select
                label="Entorno de Operación"
                value={tbAmbiente}
                onChange={(e: any) => setTbAmbiente(e.target.value)}
                options={[
                  { value: 'INTEGRACION', label: 'Integración (Pruebas)' },
                  { value: 'PRODUCCION', label: 'Producción (Real)' },
                ]}
              />

              <Input
                label="Código de Comercio"
                autoComplete="off"
                type="text"
                value={tbCodigo}
                placeholder="597055555532"
                onChange={(e: any) => setTbCodigo(e.target.value)}
              />
            </div>

            <Input
              label="API Key Secret"
              autoComplete="off"
              type="password"
              value={tbApiKey}
              placeholder={tbMaskedKey ? `Guardada: ${tbMaskedKey}` : 'Ingresa la clave provista por Transbank'}
              hint={
                tbMaskedKey
                  ? `Clave guardada: ${tbMaskedKey}. Déjalo vacío si no deseas modificarla.`
                  : undefined
              }
              onChange={(e: any) => setTbApiKey(e.target.value)}
            />

            <div className="flex justify-end pt-2">
              <Button
                type="button"
                size="sm"
                variant="primary"
                loading={tbSaving}
                onClick={handleSaveTransbank}
              >
                Guardar credenciales Transbank
              </Button>
            </div>
          </div>
        )}
      </AdminCard>

      {/* ================= TARJETAS SECUNDARIAS (DEMO) ================= */}
      {otherMethods.map((method) => {
        const current = form[method.id] || { enabled: false, fields: {} };
        return (
          <AdminCard key={method.id}>
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-3">
                <Icon name={method.icon} className="w-6 h-6" />
                <div>
                  <h2 className="font-semibold text-sm">{method.name}</h2>
                  <p className="text-xs text-[var(--muted-foreground)]">{method.desc}</p>
                </div>
              </div>
              <Toggle
                ariaLabel={'Activar ' + method.name}
                checked={current.enabled}
                onChange={(enabled) =>
                  setForm({ ...form, [method.id]: { ...current, enabled } })
                }
              />
            </div>
            <div className="grid sm:grid-cols-2 gap-3 border-t border-[var(--border)] pt-3">
              {method.fields.map((field) => (
                <Input
                  key={field}
                  label={field}
                  autoComplete="off"
                  type={/key|token|secret/i.test(field) ? 'password' : 'text'}
                  value={current.fields?.[field] ?? ''}
                  placeholder={method.id === 'transfer' ? 'Dato de ejemplo' : 'Credencial demo'}
                  onChange={(e: any) =>
                    setForm({
                      ...form,
                      [method.id]: {
                        ...current,
                        fields: { ...current.fields, [field]: e.target.value },
                      },
                    })
                  }
                />
              ))}
            </div>
          </AdminCard>
        );
      })}

      {saved && <Alert variant="success">Métodos de pago guardados correctamente.</Alert>}

      <Button type="submit" loading={tbSaving}>
        Guardar todos los métodos de pago
      </Button>
    </form>
  );
}