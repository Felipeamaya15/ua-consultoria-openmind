import {
  useEffect,
  useState,
  type FormEvent,
} from 'react';
import { useNavigate } from 'react-router-dom';

import { authService } from '../../auth/services/authService';
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

  useEffect(() => {
    let active = true;
    setSessionStartedAt(authService.getSessionStartedAt());

    authService
      .getEntrepreneurProfile()
      .then((data) => {
        if (active) setEmail(data.email);
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

  function logout() {
    authService.logout();
    navigate(`${templatePaths[config.template]}/ingresar`, {
      replace: true,
    });
  }

  return (
    <div className="max-w-xl space-y-5">
      <div>
        <h2 className="font-semibold text-xl">
          Mi cuenta / Emprendedor
        </h2>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          Gestiona tus datos de acceso y la sesion activa del panel.
        </p>
      </div>

      {error && <Alert variant="error">{error}</Alert>}
      {success && <Alert variant="success">{success}</Alert>}

      {email === null ? (
        !error && <p role="status">Cargando cuenta...</p>
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
                    ).toLocaleString()}`
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
        </>
      )}
    </div>
  );
}
