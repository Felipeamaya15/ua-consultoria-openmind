import React, { useEffect, useState } from 'react';
import { paypalService } from '../services/paypalService';
import { ConfiguracionPayPalInput } from '../types/paypal.types';

interface Props {
  tiendaId?: number;
}

export const PayPalConfigForm: React.FC<Props> = ({ tiendaId = 1 }) => {
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [activo, setActivo] = useState(false);
  const [ambiente, setAmbiente] = useState<'SANDBOX' | 'LIVE'>('SANDBOX');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [secretEnmascarado, setSecretEnmascarado] = useState('');
  const [isConfigured, setIsConfigured] = useState(false);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    cargarConfiguracion();
  }, [tiendaId]);

  const cargarConfiguracion = async () => {
    try {
      setInitialLoading(true);
      setErrorMsg(null);
      const data = await paypalService.obtenerConfiguracion(tiendaId);
      setActivo(data.activo);
      setAmbiente(data.ambiente);
      setClientId(data.client_id || '');
      setSecretEnmascarado(data.client_secret_enmascarado || '');
      setIsConfigured(data.configurado);
    } catch {
      // Si aún no está configurado en la base de datos se mantiene estado por defecto
      setIsConfigured(false);
    } finally {
      setInitialLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (activo && !clientId.trim()) {
      setErrorMsg('El Client ID es obligatorio para habilitar PayPal.');
      return;
    }

    try {
      setLoading(true);
      const payload: ConfiguracionPayPalInput = {
        activo,
        ambiente,
        client_id: clientId.trim(),
        client_secret: clientSecret.trim() ? clientSecret.trim() : undefined,
      };

      const data = await paypalService.guardarConfiguracion(tiendaId, payload);
      setActivo(data.activo);
      setAmbiente(data.ambiente);
      setClientId(data.client_id);
      setSecretEnmascarado(data.client_secret_enmascarado || '');
      setClientSecret('');
      setIsConfigured(data.configurado);
      setSuccessMsg('Credenciales de PayPal guardadas y actualizadas exitosamente.');
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al persistir la configuración de PayPal.');
    } finally {
      setLoading(false);
    }
  };

  if (initialLoading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 flex justify-center items-center text-gray-500">
        Cargando configuración de PayPal...
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm flex flex-col gap-5">
      {/* Encabezado */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#003087]/10 flex items-center justify-center text-[#003087]">
            <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
              <path d="M20.067 8.478c.492.315.844.818.996 1.425.292 1.168.04 2.827-.853 4.148-1.078 1.597-2.87 2.457-5.327 2.457h-1.62a.774.774 0 0 0-.766.657l-.804 5.093-.032.2a.772.772 0 0 1-.765.65h-2.91a.516.516 0 0 1-.51-.598l2.122-13.45a.774.774 0 0 1 .765-.653h4.636c2.534 0 4.288.583 5.068 2.021z" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-base text-[#151515]">PayPal</h3>
              {isConfigured && activo && (
                <span className="px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase bg-emerald-100 text-emerald-700 rounded-full">
                  API CONECTADA
                </span>
              )}
            </div>
            <p className="text-xs text-[#667085]">Cuenta PayPal, saldo o tarjetas internacionales</p>
          </div>
        </div>

        {/* Switch Activación */}
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={activo}
            onChange={(e) => setActivo(e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#003087]"></div>
        </label>
      </div>

      {/* Alertas */}
      {errorMsg && (
        <div className="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl">
          {errorMsg}
        </div>
      )}
      {successMsg && (
        <div className="p-3 text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl">
          {successMsg}
        </div>
      )}

      {/* Formulario */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-[#344054] mb-1.5">
              Entorno de Operación
            </label>
            <select
              value={ambiente}
              onChange={(e) => setAmbiente(e.target.value as 'SANDBOX' | 'LIVE')}
              className="w-full h-11 px-3 border border-gray-300 rounded-xl bg-white text-sm text-[#151515] focus:ring-2 focus:ring-[#003087] focus:outline-none"
            >
              <option value="SANDBOX">Sandbox (Pruebas)</option>
              <option value="LIVE">Live (Producción)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#344054] mb-1.5">
              Client ID
            </label>
            <input
              type="text"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="Ingresa el Client ID provisto por PayPal Developer"
              className="w-full h-11 px-3 border border-gray-300 rounded-xl text-sm text-[#151515] focus:ring-2 focus:ring-[#003087] focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-[#344054] mb-1.5">
            Client Secret
          </label>
          <input
            type="password"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            placeholder={secretEnmascarado ? `Clave guardada: ${secretEnmascarado}` : 'Ingresa la Secret Key de PayPal'}
            className="w-full h-11 px-3 border border-gray-300 rounded-xl text-sm text-[#151515] focus:ring-2 focus:ring-[#003087] focus:outline-none"
          />
          <p className="text-[11px] text-[#667085] mt-1">
            Si ya ingresaste tu Secret Key, déjalo vacío para conservar el valor actual.
          </p>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={loading}
            className="h-11 px-6 bg-[#003087] hover:bg-[#00205b] text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50"
          >
            {loading ? 'Guardando...' : 'Guardar credenciales PayPal'}
          </button>
        </div>
      </form>
    </div>
  );
};