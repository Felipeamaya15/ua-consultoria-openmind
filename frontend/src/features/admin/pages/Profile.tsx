import {
  useEffect,
  useState,
  type FormEvent,
} from 'react';
import { LoadingState } from '../../../shared/components/states';
import { useNavigate } from 'react-router-dom';

import { authService, type MfaSetupData } from '../../auth/services/authService';
import { useAdmin } from '../context/AdminContext';
import { templatePaths } from '../config/navigation';
import { Alert, Button, Input } from '../components/ui';

export default function EntrepreneurProfile() {
  const navigate = useNavigate();
  const { config } = useAdmin();
  const [email, setEmail] = useState<string | null>(null);
  const [sessionStartedAt, setSessionStartedAt] =
    useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [mfaSetup, setMfaSetup] = useState<MfaSetupData | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaDisablePassword, setMfaDisablePassword] = useState('');

  useEffect(() => {
    let active = true;
    setSessionStartedAt(authService.getSessionStartedAt());

    authService
      .getEntrepreneurProfile()
      .then((data) => {
        if (active) setEmail(data.email);
        if (active && typeof authService.getMfaStatus === 'function') {
          authService
            .getMfaStatus()
            .then((st) => {
              if (active) setMfaEnabled(!!st?.mfa_enabled);
            })
            .catch(() => {});
        }
      })
      .catch((err) => {
        if (active) {
          setError(err.message || 'No se pudo cargar la cuenta.');
        }
      });

    return () => {
      active = false;
    };
  }, []);

  async function save(event: FormEvent, password = false) {
    event.preventDefault();
    if (busy || email === null) return;
    setBusy(true);
    setError('');
    setSuccess('');

    try {
      if (password) {
        await authService.changeEntrepreneurPassword(
          currentPassword,
          newPassword,
        );
        setCurrentPassword('');
        setNewPassword('');
        setSuccess('Contrasena actualizada.');
      } else {
        const data = await authService.updateEntrepreneurProfile(email);
        setEmail(data.email);
        setSuccess('Correo actualizado.');
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No se pudo guardar.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleStartMfaSetup() {
    if (busy || typeof authService.setupMfa !== 'function') return;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const setup = await authService.setupMfa();
      setMfaSetup(setup);
      setMfaCode('');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'No se pudo iniciar la configuracion MFA.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmMfa(event: FormEvent) {
    event.preventDefault();
    if (busy || typeof authService.enableMfa !== 'function') return;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await authService.enableMfa(mfaCode.trim());
      setMfaEnabled(true);
      setMfaSetup(null);
      setMfaCode('');
      setSuccess('Autenticacion Multifactor (MFA) activada.');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Codigo TOTP invalido.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleDisableMfa(event: FormEvent) {
    event.preventDefault();
    if (busy || typeof authService.disableMfa !== 'function') return;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await authService.disableMfa(mfaDisablePassword);
      setMfaEnabled(false);
      setMfaDisablePassword('');
      setSuccess('Autenticacion Multifactor (MFA) desactivada.');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'No se pudo desactivar MFA.',
      );
    } finally {
      setBusy(false);
    }
  }

  function logout() {
    authService.logout();
    navigate(`${templatePaths[config.template]}/ingresar`, {
      replace: true,
    });
  }

  return (
    <div className="w-full space-y-5">
      <div>
        <h2 className="font-semibold text-xl">
          Mi cuenta / Emprendedor
        </h2>
      </div>

      {error && <Alert variant="error">{error}</Alert>}
      {success && <Alert variant="success">{success}</Alert>}

      {email === null ? (
        !error && <LoadingState align="start" spacing="compact">Cargando cuenta...</LoadingState>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2 items-start">
          <div className="grid gap-6">
            <section className="bg-white border border-[var(--border)] rounded-xl p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)] space-y-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-11 h-11 rounded-full overflow-hidden border border-slate-200 bg-[var(--primary)] text-white flex items-center justify-center font-bold text-sm shrink-0">
                    {config.logo ? (
                      <img
                        src={config.logo}
                        alt={config.name || 'Tienda'}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      (config.name?.trim()?.[0] || 'E').toUpperCase()
                    )}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-slate-900 truncate">
                      {config.name || 'Mi tienda'}
                    </h3>
                    <p className="text-xs text-slate-500 break-all">
                      {email}
                    </p>
                  </div>
                </div>
                <span className="shrink-0 inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700">
                  Sesión activa
                </span>
              </div>

              <div className="rounded-lg bg-slate-50 border border-slate-200/80 px-3.5 py-2.5 text-xs text-slate-600">
                {sessionStartedAt
                  ? `Inicio: ${String(new Date(sessionStartedAt).getDate()).padStart(2, '0')}/${String(new Date(sessionStartedAt).getMonth() + 1).padStart(2, '0')}/${new Date(sessionStartedAt).getFullYear()}, ${new Date(sessionStartedAt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })} (expira tras 30 min de inactividad)`
                  : 'Inicio no registrado para esta sesión.'}
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-700">
                  Emprendedor
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={logout}
                >
                  Cerrar sesión
                </Button>
              </div>
            </section>

            <form
              onSubmit={(event) => save(event)}
              className="bg-white border border-[var(--border)] rounded-xl p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)] space-y-4"
            >
              <div>
                <h3 className="font-semibold text-slate-900">Correo electrónico</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Dirección principal para acceder al panel y recibir notificaciones.
                </p>
              </div>
              <Input
                label="Correo electrónico"
                type="email"
                autoComplete="email"
                required
                maxLength={254}
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setSuccess('');
                }}
              />
              <div className="flex justify-end">
                <Button
                  type="submit"
                  size="sm"
                  disabled={busy}
                >
                  Guardar correo
                </Button>
              </div>
            </form>
          </div>

          <div className="grid gap-6">
            <form
              onSubmit={(event) => save(event, true)}
              className="bg-white border border-[var(--border)] rounded-xl p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)] space-y-4"
            >
              <div>
                <h3 className="font-semibold text-slate-900">Cambiar contraseña</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Usa una contraseña segura que no utilices en otros servicios.
                </p>
              </div>
              <Input
                label="Contraseña actual"
                type="password"
                autoComplete="current-password"
                required
                value={currentPassword}
                onChange={(event) =>
                  setCurrentPassword(event.target.value)
                }
              />
              <Input
                label="Nueva contraseña"
                type="password"
                autoComplete="new-password"
                required
                value={newPassword}
                onChange={(event) =>
                  setNewPassword(event.target.value)
                }
              />
              <div className="flex justify-end">
                <Button
                  type="submit"
                  size="sm"
                  disabled={busy}
                >
                  Cambiar contraseña
                </Button>
              </div>
            </form>

            <section className="bg-white border border-[var(--border)] rounded-xl p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)] space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-slate-900">Autenticación Multifactor (MFA · TOTP)</h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Segunda capa de verificación con códigos temporales de 30-60 segundos compatibles con Google Authenticator o Authy.
                  </p>
                </div>
                <span className={`shrink-0 inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${mfaEnabled ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                  {mfaEnabled ? 'Activo' : 'Inactivo'}
                </span>
              </div>

              {!mfaEnabled && !mfaSetup && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => void handleStartMfaSetup()}
                >
                  Configurar MFA
                </Button>
              )}
              {mfaSetup && (
                <form onSubmit={handleConfirmMfa} className="space-y-3 pt-1">
                  <p className="text-xs text-slate-600">
                    Ingresa esta clave secreta en Google Authenticator o Authy:
                  </p>
                  <code className="block p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono select-all break-all">
                    {mfaSetup.secret}
                  </code>
                  <label className="block text-xs font-medium text-slate-700">
                    Código de 6 dígitos
                    <input
                      className="block w-full border border-slate-200 rounded-lg p-2 mt-1 text-sm"
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="123456"
                      required
                      value={mfaCode}
                      onChange={(e) =>
                        setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                      }
                    />
                  </label>
                  <Button type="submit" size="sm" disabled={busy}>
                    Activar MFA
                  </Button>
                </form>
              )}
              {mfaEnabled && (
                <form onSubmit={handleDisableMfa} className="space-y-3 pt-1">
                  <label className="block text-xs font-medium text-slate-700">
                    Contraseña actual para desactivar MFA
                    <input
                      className="block w-full border border-slate-200 rounded-lg p-2 mt-1 text-sm"
                      type="password"
                      required
                      value={mfaDisablePassword}
                      onChange={(e) => setMfaDisablePassword(e.target.value)}
                    />
                  </label>
                  <Button type="submit" variant="outline" size="sm" disabled={busy}>
                    Desactivar MFA
                  </Button>
                </form>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
