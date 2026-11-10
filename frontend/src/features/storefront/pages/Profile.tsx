import { CustomerAccountNavigation } from '../components/store/CustomerAccountNavigation';
import { LoadingState } from '../../../shared/components/states';
import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { authService, type CustomerProfile, type MfaSetupData } from '../../auth/services/authService';
import { useStorefrontTemplate } from '../hooks/useStorefrontTemplate';

export default function Profile() {
  const { route } = useStorefrontTemplate();
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [mfaSetup, setMfaSetup] = useState<MfaSetupData | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaDisablePassword, setMfaDisablePassword] = useState('');

  useEffect(() => {
    let active = true;
    authService.getProfile().then(data => {
      if (active) setProfile(data);
      if (active && typeof authService.getMfaStatus === 'function') {
        authService.getMfaStatus().then(st => { if (active) setMfaEnabled(!!st?.mfa_enabled); }).catch(() => {});
      }
    })
      .catch(err => { if (active) setError(err instanceof Error ? err.message : 'No se pudo cargar el perfil.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function save(event: FormEvent, password = false) {
    event.preventDefault();
    if (busy || !profile) return;
    setBusy(true); setError(''); setSuccess('');
    try {
      if (password) {
        await authService.changePassword(currentPassword, newPassword);
        setCurrentPassword(''); setNewPassword('');
        setSuccess('Contraseña actualizada correctamente.');
      } else {
        setProfile(await authService.updateProfile(profile));
        setSuccess('Perfil guardado correctamente.');
      }
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo guardar.'); }
    finally { setBusy(false); }
  }

  async function handleStartMfaSetup() {
    if (busy || typeof authService.setupMfa !== 'function') return;
    setBusy(true); setError(''); setSuccess('');
    try {
      const setup = await authService.setupMfa();
      setMfaSetup(setup);
      setMfaCode('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar la configuración de MFA.');
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmMfa(event: FormEvent) {
    event.preventDefault();
    if (busy || typeof authService.enableMfa !== 'function') return;
    setBusy(true); setError(''); setSuccess('');
    try {
      await authService.enableMfa(mfaCode.trim());
      setMfaEnabled(true);
      setMfaSetup(null);
      setMfaCode('');
      setSuccess('Autenticación Multifactor (MFA - TOTP) activada correctamente.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Código TOTP inválido.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDisableMfa(event: FormEvent) {
    event.preventDefault();
    if (busy || typeof authService.disableMfa !== 'function') return;
    setBusy(true); setError(''); setSuccess('');
    try {
      await authService.disableMfa(mfaDisablePassword);
      setMfaEnabled(false);
      setMfaDisablePassword('');
      setSuccess('Autenticación Multifactor (MFA) desactivada.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo desactivar MFA.');
    } finally {
      setBusy(false);
    }
  }

  const inputClass = 'block w-full border rounded p-2 mt-1';
  return <main className="w-full p-6 space-y-6">
    <CustomerAccountNavigation />
    <h1 className="text-2xl font-semibold">Mi cuenta · Perfil</h1>
    <Link className="underline block" to={route('preferencias-comerciales')}>Consultar o retirar mi autorización comercial</Link>
    {loading && <LoadingState align="start" spacing="compact">Cargando perfil…</LoadingState>}
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {success && <p role="status" className="text-green-700">{success}</p>}
    {!loading && !profile && <Link data-page-action="ghost" to={route('ingresar')} className="underline">Iniciar sesión</Link>}
    {profile && <>
      <form data-page-form data-visual-section="pagePanel" data-page-panel onSubmit={event => save(event)} className="space-y-4">
        <fieldset disabled={busy} className="space-y-4">
          {(['first_name', 'last_name', 'email', 'phone'] as const).map(field => <label key={field} className="block">
            {{first_name: 'Nombre', last_name: 'Apellido', email: 'Email', phone: 'Teléfono'}[field]}
            <input data-visual-section="pageField" className={inputClass} type={field === 'email' ? 'email' : field === 'phone' ? 'tel' : 'text'}
              autoComplete={{first_name: 'given-name', last_name: 'family-name', email: 'email', phone: 'tel'}[field]}
              maxLength={field === 'phone' ? 20 : field === 'email' ? 254 : 150} required={field === 'email'}
              value={profile[field]} onChange={event => { setProfile({...profile, [field]: event.target.value}); setSuccess(''); }} />
          </label>)}
          <button data-page-action="outline" className="border rounded px-4 py-2" type="submit">{busy ? 'Guardando…' : 'Guardar perfil'}</button>
        </fieldset>
      </form>
      <form data-page-form data-visual-section="pagePanel" data-page-panel onSubmit={event => save(event, true)} className="space-y-4">
        <h2 className="text-xl font-semibold">Cambiar contraseña</h2>
        <fieldset disabled={busy} className="space-y-4">
          <label className="block">
            Contraseña actual
            <div className="relative">
              <input data-visual-section="pageField" className={`${inputClass} pr-10`} type={showCurrentPassword ? 'text' : 'password'} autoComplete="current-password" maxLength={128} required value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} />
              <button
                type="button"
                data-password-toggle="true"
                aria-label={showCurrentPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                title={showCurrentPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                onClick={() => setShowCurrentPassword(v => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-gray-700 focus:outline-none transition-colors cursor-pointer"
              >
                {showCurrentPassword ? (
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </label>
          <label className="block">
            Nueva contraseña
            <div className="relative">
              <input data-visual-section="pageField" className={`${inputClass} pr-10`} type={showNewPassword ? 'text' : 'password'} autoComplete="new-password" maxLength={128} required value={newPassword} onChange={e => setNewPassword(e.target.value)} />
              <button
                type="button"
                data-password-toggle="true"
                aria-label={showNewPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                title={showNewPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                onClick={() => setShowNewPassword(v => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-gray-700 focus:outline-none transition-colors cursor-pointer"
              >
                {showNewPassword ? (
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </label>
          <button data-page-action="outline" className="border rounded px-4 py-2" type="submit">Cambiar contraseña</button>
        </fieldset>
      </form>

      <section data-visual-section="pagePanel" data-page-panel className="border rounded p-4 space-y-3">
        <h2 className="text-xl font-semibold">Autenticación Multifactor (MFA · TOTP)</h2>
        <p className="text-sm opacity-80">
          Protege tu cuenta con una segunda capa de verificación compatible con Google Authenticator o Authy (códigos temporales de 30 a 60 segundos).
        </p>
        {!mfaEnabled && !mfaSetup && (
          <button data-page-action="outline" type="button" disabled={busy} onClick={() => void handleStartMfaSetup()} className="border rounded px-4 py-2">
            Configurar MFA (Google Authenticator / Authy)
          </button>
        )}
        {mfaSetup && (
          <form onSubmit={handleConfirmMfa} className="space-y-3">
            <p className="text-sm">
              1. Abre <strong>Google Authenticator</strong> o <strong>Authy</strong>, selecciona <em>Ingresar clave de configuración</em> (o URI TOTP) y añade esta clave secreta:
            </p>
            <code className="block p-2 bg-neutral-100 rounded text-sm font-mono select-all break-all">
              {mfaSetup.secret}
            </code>
            <p className="text-xs opacity-70 break-all">URI: {mfaSetup.otpauth_url}</p>
            <label className="block text-sm">
              2. Ingresa el código temporal de 6 dígitos generado por la aplicación:
              <input
                className={inputClass}
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="123456"
                required
                value={mfaCode}
                onChange={e => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              />
            </label>
            <div className="flex gap-2">
              <button data-page-action="outline" type="submit" disabled={busy} className="border rounded px-4 py-2">
                Activar MFA
              </button>
              <button type="button" onClick={() => setMfaSetup(null)} className="border rounded px-3 py-2 text-sm">
                Cancelar
              </button>
            </div>
          </form>
        )}
        {mfaEnabled && (
          <form onSubmit={handleDisableMfa} className="space-y-3">
            <p className="text-sm text-green-700 font-medium">✓ MFA está activo en tu cuenta.</p>
            <label className="block text-sm">
              Confirma tu contraseña actual para desactivar MFA:
              <input
                className={inputClass}
                type="password"
                required
                value={mfaDisablePassword}
                onChange={e => setMfaDisablePassword(e.target.value)}
              />
            </label>
            <button data-page-action="outline" type="submit" disabled={busy} className="border rounded px-4 py-2">
              Desactivar MFA
            </button>
          </form>
        )}
      </section>
    </>}
  </main>;
}
