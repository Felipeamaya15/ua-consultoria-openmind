import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { matchesDemoCredentials, startDemoSession } from '../../admin/auth/demoSession';

import {
  Button,
  Input,
  Alert,
  InstitutionalBadge,
} from '../components/ui';

import { useStorefrontTemplate } from '../hooks/useStorefrontTemplate';

export default function Login() {
  const navigate = useNavigate();
  const { route, isMinimal, isVisual, isCatalog } =
    useStorefrontTemplate();

  const [mode, setMode] =
    useState<'login' | 'register'>('login');

  const [email, setEmail] = useState('');
  const [password, setPassword] =
    useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] =
    useState(false);
  const [message, setMessage] =
    useState('');

  const handleSubmit = async (
    event: FormEvent,
  ) => {
    event.preventDefault();

    setLoading(true);
    setMessage('');

    await new Promise((resolve) =>
      setTimeout(resolve, 1000),
    );

    setLoading(false);

    if (mode === 'login' && matchesDemoCredentials(email, password)) {
      try {
        startDemoSession();
        navigate('/emprendedor');
      } catch {
        setMessage('No se pudo iniciar la sesión demo. Habilita el almacenamiento de sesión del navegador.');
      }
      return;
    }

    setMessage(
      mode === 'register'
        ? 'Cuenta de ejemplo creada. El registro real se conectará más adelante.'
        : 'Ingreso de demostración completado.',
    );
  };

  const changeMode = () => {
    setMode((current) =>
      current === 'login'
        ? 'register'
        : 'login',
    );

    setMessage('');
    setPassword('');
  };


  if (isCatalog) {
    return (
      <div className="min-h-[76vh] bg-[#050505] text-white flex items-center justify-center px-5 py-14 md:py-20">
        <div className="w-full max-w-[460px]">
          <div className="text-center mb-8">
            <div className="flex justify-center mb-5">
              <InstitutionalBadge />
            </div>

            <p className="text-[#ff5a1f] text-[10px] font-black uppercase tracking-[0.16em]">
              Mi Tienda · Tu cuenta
            </p>

            <h1 className="mt-3 text-[42px] md:text-[50px] leading-none tracking-[-0.045em] font-black">
              {mode === 'login'
                ? 'Bienvenido de nuevo'
                : 'Crear cuenta'}
            </h1>

            <p className="mt-4 text-[13px] text-white/45">
              {mode === 'login'
                ? '¿No tienes cuenta?'
                : '¿Ya tienes cuenta?'}{' '}

              <button
                type="button"
                onClick={changeMode}
                className="font-semibold text-[#1683ff] hover:opacity-70 transition-opacity"
              >
                {mode === 'login'
                  ? 'Regístrate'
                  : 'Ingresar'}
              </button>
            </p>
          </div>

          <div className="rounded-[16px] bg-[#f5f5f3] p-6 md:p-8 text-[#151515] flex flex-col gap-5">
            {message && (
              <Alert variant="info">
                {message}
              </Alert>
            )}

            <button
              type="button"
              onClick={() =>
                setMessage(
                  'Acceso con Google simulado. No se conecta a una cuenta real.',
                )
              }
              className="h-12 flex items-center justify-center gap-3 border border-black/10 bg-white rounded-[9px] text-[12px] font-semibold hover:border-black/30 transition-colors"
            >
              <svg
                className="w-5 h-5"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 0 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>

              Continuar con Google
            </button>

            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-black/10" />
              <span className="text-[10px] text-black/35">o</span>
              <div className="flex-1 h-px bg-black/10" />
            </div>

            <form
              onSubmit={handleSubmit}
              className="flex flex-col gap-4 [&_label]:text-[#151515] [&_input]:text-[#151515]"
            >
              {mode === 'register' && (
                <Input
                  label="Nombre completo"
                  value={name}
                  onChange={(event) =>
                    setName(event.target.value)
                  }
                  placeholder="María González"
                  required
                />
              )}

              <Input
                label="Correo electrónico"
                type="email"
                value={email}
                onChange={(event) =>
                  setEmail(event.target.value)
                }
                placeholder="correo@ejemplo.com"
                required
              />

              <Input
                label="Contraseña"
                type="password"
                value={password}
                onChange={(event) =>
                  setPassword(event.target.value)
                }
                placeholder="••••••••"
                autoComplete={
                  mode === 'login'
                    ? 'current-password'
                    : 'new-password'
                }
                required
              />

              {mode === 'login' && (
                <div className="text-right -mt-2">
                  <button
                    type="button"
                    onClick={() =>
                      setMessage(
                        'Recuperación de contraseña de demostración. No se envían correos.',
                      )
                    }
                    className="text-[10px] text-black/45 hover:text-black transition-colors"
                  >
                    ¿Olvidaste tu contraseña?
                  </button>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full h-12 rounded-[9px] bg-[#1683ff] text-white text-[12px] font-bold hover:bg-[#3194f5] disabled:opacity-50 disabled:cursor-wait transition-colors"
              >
                {loading
                  ? 'Procesando...'
                  : mode === 'login'
                    ? 'Ingresar →'
                    : 'Crear cuenta →'}
              </button>
            </form>

            <div className="text-center pt-1">
              <Link
                to={route()}
                className="text-[10px] uppercase tracking-[0.12em] text-black/45 hover:text-[#1683ff] transition-colors"
              >
                Continuar como invitado →
              </Link>
            </div>
          </div>

          <p className="text-center text-[10px] text-white/30 mt-5">
            Compra de forma segura y sencilla.
          </p>
        </div>
      </div>
    );
  }

  if (isVisual) {
    return (
      <div className="min-h-[72vh] bg-white text-[#111111] flex items-center justify-center px-5 md:px-8 py-14 md:py-20">
        <div className="w-full max-w-[460px]">
          <div className="text-center mb-8">
            <p className="mb-3 text-[9px] font-medium uppercase tracking-[0.18em] text-[#77716e]">
              Velta · Tu cuenta
            </p>

            <h1 className="font-serif text-[42px] md:text-[50px] leading-none tracking-[-0.025em]">
              {mode === 'login'
                ? 'Bienvenido de nuevo'
                : 'Crear cuenta'}
            </h1>

            <p className="mt-4 text-[13px] text-[#77716e]">
              {mode === 'login'
                ? '¿No tienes cuenta?'
                : '¿Ya tienes cuenta?'}{' '}

              <button
                type="button"
                onClick={changeMode}
                className="font-semibold text-black border-b border-black hover:opacity-50 transition-opacity"
              >
                {mode === 'login'
                  ? 'Regístrate'
                  : 'Ingresar'}
              </button>
            </p>
          </div>

          <div className="rounded-[10px] bg-[#f1f1f0] p-6 md:p-8 flex flex-col gap-5">
            {message && (
              <Alert variant="info">
                {message}
              </Alert>
            )}

            <button
              type="button"
              onClick={() =>
                setMessage(
                  'Acceso con Google simulado. No se conecta a una cuenta real.',
                )
              }
              className="h-12 flex items-center justify-center gap-3 border border-black/15 bg-white rounded-[8px] text-[12px] font-semibold hover:border-black transition-colors"
            >
              <svg
                className="w-5 h-5"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 0 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>

              Continuar con Google
            </button>

            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-black/10" />
              <span className="text-[10px] text-[#8c8683]">
                o
              </span>
              <div className="flex-1 h-px bg-black/10" />
            </div>

            <form
              onSubmit={handleSubmit}
              className="flex flex-col gap-4"
            >
              {mode === 'register' && (
                <Input
                  label="Nombre completo"
                  value={name}
                  onChange={(event) =>
                    setName(event.target.value)
                  }
                  placeholder="María González"
                  required
                />
              )}

              <Input
                label="Correo electrónico"
                type="email"
                value={email}
                onChange={(event) =>
                  setEmail(event.target.value)
                }
                placeholder="correo@ejemplo.com"
                required
              />

              <Input
                label="Contraseña"
                type="password"
                value={password}
                onChange={(event) =>
                  setPassword(event.target.value)
                }
                placeholder="••••••••"
                autoComplete={
                  mode === 'login'
                    ? 'current-password'
                    : 'new-password'
                }
                required
              />

              {mode === 'login' && (
                <div className="text-right -mt-2">
                  <button
                    type="button"
                    onClick={() =>
                      setMessage(
                        'Recuperación de contraseña de demostración. No se envían correos.',
                      )
                    }
                    className="text-[10px] text-[#77716e] hover:text-black transition-colors"
                  >
                    ¿Olvidaste tu contraseña?
                  </button>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full h-12 rounded-[8px] bg-black text-white text-[12px] font-semibold hover:opacity-80 disabled:opacity-50 disabled:cursor-wait transition-opacity"
              >
                {loading
                  ? 'Procesando...'
                  : mode === 'login'
                    ? 'Ingresar →'
                    : 'Crear cuenta →'}
              </button>
            </form>

            <div className="text-center pt-1">
              <Link
                to={route()}
                className="text-[10px] uppercase tracking-[0.12em] text-[#77716e] hover:text-black transition-colors"
              >
                Continuar como invitado →
              </Link>
            </div>
          </div>

          <p className="text-center text-[10px] text-[#9a9491] mt-5">
            Compra de forma segura y sencilla.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={
        isMinimal
          ? 'min-h-[72vh] flex items-center justify-center px-4 md:px-8 py-14'
          : 'min-h-[80vh] flex items-center justify-center px-4 py-12'
      }
    >
      <div className="w-full max-w-md">
        <div
          className={
            isMinimal
              ? 'text-center mb-7'
              : 'text-center mb-8'
          }
        >
          {!isMinimal && (
            <div className="flex justify-center mb-4">
              <InstitutionalBadge />
            </div>
          )}

          {isMinimal && (
            <p className="text-xs text-gray-400 mb-2">
              Mi Tienda.
            </p>
          )}

          <h1
            className={
              isMinimal
                ? 'text-3xl md:text-4xl font-semibold tracking-tight text-[#171717]'
                : 'text-2xl font-bold'
            }
          >
            {mode === 'login'
              ? 'Bienvenido de nuevo'
              : 'Crear cuenta'}
          </h1>

          <p className="text-sm text-[var(--muted-foreground)] mt-2">
            {mode === 'login'
              ? '¿No tienes cuenta?'
              : '¿Ya tienes cuenta?'}{' '}

            <button
              type="button"
              onClick={changeMode}
              className={
                isMinimal
                  ? 'text-[#17213b] font-semibold hover:opacity-60 transition-opacity'
                  : 'text-[var(--primary)] font-semibold hover:underline'
              }
            >
              {mode === 'login'
                ? 'Regístrate'
                : 'Ingresar'}
            </button>
          </p>
        </div>

        <div
          className={
            isMinimal
              ? 'bg-white border border-black/5 rounded-[28px] p-6 md:p-8 flex flex-col gap-5'
              : 'bg-white border border-[var(--border)] rounded-2xl p-6 flex flex-col gap-4'
          }
        >
          {message && (
            <Alert variant="info">
              {message}
            </Alert>
          )}

          <button
            type="button"
            onClick={() =>
              setMessage(
                'Acceso con Google simulado. No se conecta a una cuenta real.',
              )
            }
            className={
              isMinimal
                ? 'h-12 flex items-center justify-center gap-3 border border-black/10 rounded-full text-sm font-medium hover:bg-gray-50 transition-colors'
                : 'flex items-center justify-center gap-3 border border-[var(--border)] rounded-xl py-2.5 text-sm font-medium hover:bg-[var(--muted)] transition-colors'
            }
          >
            <svg
              className="w-5 h-5"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 0 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>

            Continuar con Google
          </button>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-[var(--border)]" />
            <span className="text-xs text-[var(--muted-foreground)]">
              o
            </span>
            <div className="flex-1 h-px bg-[var(--border)]" />
          </div>

          <form
            onSubmit={handleSubmit}
            className="flex flex-col gap-4"
          >
            {mode === 'register' && (
              <Input
                label="Nombre completo"
                value={name}
                onChange={(event) =>
                  setName(event.target.value)
                }
                placeholder="María González"
                required
              />
            )}

            <Input
              label="Correo electrónico"
              type="email"
              value={email}
              onChange={(event) =>
                setEmail(event.target.value)
              }
              placeholder="correo@ejemplo.com"
              required
            />

            <Input
              label="Contraseña"
              type="password"
              value={password}
              onChange={(event) =>
                setPassword(event.target.value)
              }
              placeholder="••••••••"
              autoComplete={
                mode === 'login'
                  ? 'current-password'
                  : 'new-password'
              }
              required
            />

            {mode === 'login' && (
              <div className="text-right -mt-2">
                <button
                  type="button"
                  onClick={() =>
                    setMessage(
                      'Recuperación de contraseña de demostración. No se envían correos.',
                    )
                  }
                  className={
                    isMinimal
                      ? 'text-xs text-[#17213b] hover:opacity-60 transition-opacity'
                      : 'text-xs text-[var(--primary)] hover:underline'
                  }
                >
                  ¿Olvidaste tu contraseña?
                </button>
              </div>
            )}

            {isMinimal ? (
              <button
                type="submit"
                disabled={loading}
                className="w-full h-12 rounded-full bg-[#17213b] text-white text-sm font-semibold hover:bg-[#0f2a56] disabled:opacity-60 disabled:cursor-wait transition-colors"
              >
                {loading
                  ? 'Procesando...'
                  : mode === 'login'
                    ? 'Ingresar'
                    : 'Crear cuenta'}
              </button>
            ) : (
              <Button
                type="submit"
                variant="primary"
                size="lg"
                fullWidth
                loading={loading}
              >
                {mode === 'login'
                  ? 'Ingresar'
                  : 'Crear cuenta'}
              </Button>
            )}
          </form>

          <div className="text-center pt-1">
            <Link
              to={route()}
              className={
                isMinimal
                  ? 'text-xs text-gray-500 hover:text-[#17213b] transition-colors'
                  : 'text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors'
              }
            >
              Continuar como invitado →
            </Link>
          </div>
        </div>

        {isMinimal && (
          <p className="text-center text-[11px] text-gray-400 mt-5">
            Compra de forma segura y sencilla.
          </p>
        )}
      </div>
    </div>
  );
}
