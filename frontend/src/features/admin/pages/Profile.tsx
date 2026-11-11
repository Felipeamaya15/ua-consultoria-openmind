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
        <>
          <section className="bg-white border rounded-xl p-5 space-y-3">
            <div>
              <h3 className="font-semibold">Sesion activa</h3>
              <p className="text-sm text-[var(--muted-foreground)] break-all">
                {email}
              </p>
              <p className="text-xs text-[var(--muted-foreground)]">
                {sessionStartedAt
                  ? `Inicio: ${new Date(
                      sessionStartedAt,
                    ).toLocaleString()} (expira tras 30 min de inactividad)`
                  : 'Inicio no registrado para esta sesion.'}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={logout}
            >
              Cerrar sesion
            </Button>
          </section>

          <form
            onSubmit={(event) => save(event)}
            className="bg-white border rounded-xl p-5 space-y-4"
          >
            <Input
              label="Correo electronico"
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
            <Button
              type="submit"
              disabled={busy}
            >
              Guardar correo
            </Button>
          </form>

          <form
            onSubmit={(event) => save(event, true)}
            className="bg-white border rounded-xl p-5 space-y-4"
          >
            <h3 className="font-semibold">Cambiar contrasena</h3>
            <Input
              label="Contrasena actual"
              type="password"
              autoComplete="current-password"
              required
              value={currentPassword}
              onChange={(event) =>
                setCurrentPassword(event.target.value)
              }
            />
            <Input
              label="Nueva contrasena"
              type="password"
              autoComplete="new-password"
              required
              value={newPassword}
              onChange={(event) =>
                setNewPassword(event.target.value)
              }
            />
            <Button
              type="submit"
              disabled={busy}
            >
              Cambiar contrasena
            </Button>
          </form>

          <section className="bg-white border rounded-xl p-5 space-y-3">
            <h3 className="font-semibold">Autenticacion Multifactor (MFA · TOTP)</h3>
            <p className="text-xs text-[var(--muted-foreground)]">
              Segunda capa de verificacion con codigos temporales de 30-60 segundos compatibles con Google Authenticator o Authy.
            </p>
            {!mfaEnabled && !mfaSetup && (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => void handleStartMfaSetup()}
              >
                Configurar MFA
              </Button>
            )}
            {mfaSetup && (
              <form onSubmit={handleConfirmMfa} className="space-y-3">
                <p className="text-xs">
                  Ingresa esta clave secreta en Google Authenticator o Authy:
                </p>
                <code className="block p-2 bg-neutral-100 rounded text-xs font-mono select-all break-all">
                  {mfaSetup.secret}
                </code>
                <label className="block text-xs font-medium">
                  Codigo de 6 digitos
                  <input
                    className="block w-full border rounded-lg p-2 mt-1 text-sm"
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
                <Button type="submit" disabled={busy}>
                  Activar MFA
                </Button>
              </form>
            )}
            {mfaEnabled && (
              <form onSubmit={handleDisableMfa} className="space-y-3">
                <p className="text-xs text-green-700 font-medium">
                  ✓ MFA activo en esta cuenta.
                </p>
                <label className="block text-xs font-medium">
                  Contrasena actual para desactivar MFA
                  <input
                    className="block w-full border rounded-lg p-2 mt-1 text-sm"
                    type="password"
                    required
                    value={mfaDisablePassword}
                    onChange={(e) => setMfaDisablePassword(e.target.value)}
                  />
                </label>
                <Button type="submit" variant="outline" disabled={busy}>
                  Desactivar MFA
                </Button>
              </form>
            )}
          </section>
        </>
      )}
    </div>
  );
}
