import React, { useState, useEffect, ChangeEvent, FormEvent } from 'react';
import { transbankService } from '../services/transbankService';
import { GuardarTransbankDTO } from '../types/transbank.types';
import { Button, Input, Select, Alert, Icon } from '../components/ui';

interface Props {
  idTienda?: number | string;
}

export const TransbankConfigForm: React.FC<Props> = ({ idTienda = 1 }) => {
  const [formData, setFormData] = useState<GuardarTransbankDTO>({
    codigo_comercio: '',
    api_key: '',
    ambiente: 'INTEGRACION',
    activo: true,
  });

  const [maskedKey, setMaskedKey] = useState<string>('');
  const [isConfigured, setIsConfigured] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [alertState, setAlertState] = useState<{
    variant: 'error' | 'info' | 'success';
    message: string;
  } | null>(null);

  useEffect(() => {
    setLoading(true);
    setAlertState(null);

    transbankService
      .obtenerConfiguracion(idTienda)
      .then((res) => {
        if (res.exito && res.data) {
          setFormData({
            codigo_comercio: res.data.codigo_comercio || '',
            api_key: '',
            ambiente: res.data.ambiente || 'INTEGRACION',
            activo: res.data.activo ?? true,
          });
          setMaskedKey(res.data.api_key_enmascarada || '');
          setIsConfigured(Boolean(res.data.configurado));
        } else {
          setAlertState({
            variant: 'error',
            message: res.mensaje || 'Error al obtener la configuración actual.',
          });
        }
      })
      .catch(() => {
        setAlertState({
          variant: 'error',
          message: 'Error de conexión con el backend de pagos.',
        });
      })
      .finally(() => setLoading(false));
  }, [idTienda]);

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData((prev) => ({ ...prev, [name]: checked }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setAlertState(null);

    const payload: GuardarTransbankDTO = {
      ...formData,
      codigo_comercio: formData.codigo_comercio.trim(),
      api_key: formData.api_key.trim() || (isConfigured ? maskedKey : ''),
    };

    try {
      const res = await transbankService.guardarConfiguracion(idTienda, payload);

      if (res.exito) {
        setAlertState({
          variant: 'success',
          message: 'Configuración de Transbank guardada exitosamente.',
        });
        setMaskedKey(res.data.api_key_enmascarada || '');
        setFormData((prev) => ({ ...prev, api_key: '' }));
        setIsConfigured(true);

        // Sincronizar con el storage local si el Checkout depende de él
        try {
          const raw = localStorage.getItem('ua-entrepreneur-demo-v1');
          if (raw) {
            const parsed = JSON.parse(raw);
            if (!parsed.config) parsed.config = {};
            if (!parsed.config.paymentConfiguration) parsed.config.paymentConfiguration = {};
            parsed.config.paymentConfiguration.transbank = {
              enabled: formData.activo,
              commerceCode: formData.codigo_comercio,
              environment: formData.ambiente,
            };
            localStorage.setItem('ua-entrepreneur-demo-v1', JSON.stringify(parsed));
          }
        } catch {
          // Ignorar si no existe la estructura local
        }
      } else {
        const errorDetail = res.error?.detalles
          ? Object.values(res.error.detalles).flat().join(' ')
          : res.mensaje;

        setAlertState({
          variant: 'error',
          message: errorDetail || 'No se pudo guardar la configuración.',
        });
      }
    } catch {
      setAlertState({
        variant: 'error',
        message: 'Ocurrió un error en el servidor al enviar la configuración.',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white border border-[var(--border)] rounded-2xl p-6 text-center text-[#667085] text-sm">
        Cargando credenciales de Transbank...
      </div>
    );
  }

  return (
    <div className="bg-white border border-[var(--border)] rounded-2xl p-6 flex flex-col gap-6">
      <div className="flex items-center justify-between border-b border-[var(--border)] pb-4">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-xl bg-[var(--primary)] text-white flex items-center justify-center">
            <Icon name="card" className="w-5 h-5" />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-[#151515]">Webpay Plus (Transbank)</h2>
            <p className="text-xs text-[#667085]">
              Recibe pagos con tarjetas de débito, crédito y prepago directamente en tu tienda.
            </p>
          </div>
        </div>

        <span
          className={`px-3 py-1 rounded-full text-xs font-semibold ${
            formData.activo ? 'bg-[#ebfdf2] text-[#027a48]' : 'bg-[var(--muted)] text-[#667085]'
          }`}
        >
          {formData.activo ? 'Activo' : 'Desactivado'}
        </span>
      </div>

      {alertState && (
        <Alert variant={alertState.variant}>
          {alertState.message}
        </Alert>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <Select
          label="Entorno de Transacción"
          value={formData.ambiente}
          onChange={handleChange}
          options={[
            { value: 'INTEGRACION', label: 'Integración (Pruebas - Sin cobro real)' },
            { value: 'PRODUCCION', label: 'Producción (Transacciones bancarias reales)' },
          ]}
        />

        <Input
          label="Código de Comercio"
          value={formData.codigo_comercio}
          onChange={(e) => setFormData((c) => ({ ...c, codigo_comercio: e.target.value }))}
          placeholder="Ej: 597055555532"
          required
        />

        <Input
          label="API Key Secret"
          type="password"
          value={formData.api_key}
          onChange={(e) => setFormData((c) => ({ ...c, api_key: e.target.value }))}
          placeholder={maskedKey ? `Clave actual: ${maskedKey}` : 'Ingresa tu secreto de Transbank'}
          required={!isConfigured}
          hint={
            maskedKey
              ? `Clave guardada: ${maskedKey}. Déjalo en blanco si no deseas modificarla.`
              : 'La llave de autenticación provista por Transbank.'
          }
        />

        <div className="flex items-center gap-3 p-4 bg-[var(--muted)]/40 rounded-xl border border-[var(--border)]">
          <input
            id="transbank-switch"
            type="checkbox"
            name="activo"
            checked={formData.activo}
            onChange={handleChange}
            className="w-4 h-4 rounded text-[var(--primary)] focus:ring-[var(--primary)] border-[var(--border)]"
          />
          <label htmlFor="transbank-switch" className="text-sm font-medium text-[#151515] cursor-pointer">
            Habilitar Webpay Plus en el paso de pago del Checkout
          </label>
        </div>

        <div className="flex items-center justify-between border-t border-[var(--border)] pt-5">
          <p className="flex items-center gap-1.5 text-xs text-[#667085]">
            <Icon name="lock" className="w-3.5 h-3.5" />
            Las credenciales se transmiten encriptadas y enmascaradas.
          </p>

          <Button
            variant="primary"
            size="lg"
            loading={saving}
            type="submit"
          >
            {saving ? 'Guardando...' : 'Guardar configuración'}
          </Button>
        </div>
      </form>
    </div>
  );
};