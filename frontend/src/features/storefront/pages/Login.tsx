import { CommercialOptIn } from '../components/store/CommercialOptIn';
import { requestConsent } from '../services/commercialConsent';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useGoogleLogin } from '@react-oauth/google';
import { authService } from '../../auth/services/authService';
import { CaptchaWidget } from '../../auth/components/CaptchaWidget';
import { Button, Input, Alert, InstitutionalBadge } from '../components/ui';
import { useStore } from '../context/StoreContext';
import { useStorefrontTemplate } from '../hooks/useStorefrontTemplate';
import {
  MAX_EMAIL_LENGTH,
  MAX_NAME_LENGTH,
  MAX_PASSWORD_LENGTH,
  MAX_POSTAL_CODE_LENGTH,
  containsSqlOrControlInjection,
  escapeHtml,
  isValidEmail,
  isValidPersonName,
  isValidPostalCode,
} from '../../../shared/utils/security';

type AuthViewMode = 'login' | 'register' | 'forgot' | 'reset' | 'mfa';

export default function Login() {
  const { config } = useStore();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { route, templateNumber, isMinimal, isVisual, isCatalog } =
    useStorefrontTemplate();

  const initialResetToken = params.get('token') || '';
  const [mode, setMode] = useState<AuthViewMode>(() => {
    const modoParam = params.get('modo');
    if (modoParam === 'restablecer' && initialResetToken) return 'reset';
    if (modoParam === 'recuperar') return 'forgot';
    if (modoParam === 'registro') return 'register';
    return 'login';
  });

  const [email, setEmail] = useState('');
  const [commercial, setCommercial] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [captchaRefresh, setCaptchaRefresh] = useState(0);
  const [mfaToken, setMfaToken] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [mfaEmailMasked, setMfaEmailMasked] = useState('');
  const [resetToken, setResetToken] = useState(initialResetToken);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [messageVariant, setMessageVariant] = useState<'info' | 'success' | 'error'>('info');
  const [passwordErrors, setPasswordErrors] = useState<string[]>([]);

  useEffect(() => {
    const modoParam = params.get('modo');
    const tok = params.get('token') || '';
    if (modoParam === 'restablecer' && tok) {
      setResetToken(tok);
      setMode('reset');
    } else if (modoParam === 'registro') {
      setMode('register');
    }
  }, [params]);

  const getPasswordValidationErrors = (pwd: string): string[] => {
    const errors: string[] = [];
    if (!pwd || pwd.length < 8) {
      errors.push('Tener al menos 8 caracteres.');
    }
    if (pwd && pwd.length > MAX_PASSWORD_LENGTH) {
      errors.push(`No superar los ${MAX_PASSWORD_LENGTH} caracteres.`);
    }
    if (!/[A-Z]/.test(pwd)) {
      errors.push('Incluir al menos una letra mayúscula (A-Z).');
    }
    if (!/\d/.test(pwd)) {
      errors.push('Incluir al menos un número (0-9).');
    }
    if (!/[@$!%*?&#/._\-]/.test(pwd)) {
      errors.push('Incluir al menos un carácter especial (@, $, !, %, *, #, etc.).');
    }
    if (!/[a-z]/.test(pwd)) {
      errors.push('Incluir al menos una letra minúscula (a-z).');
    }
    return errors;
  };

  // 1. Hook oficial de Google
  const loginConGoogle = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      setLoading(true);
      try {
        const data = await authService.googleLogin(tokenResponse.access_token);
        authService.setSession(data.data.token);

        if (data.data.user.is_store_owner === true) {
          navigate('/emprendedor');
        } else {
          navigate(route());
        }
      } catch (err: any) {
        setMessageVariant('error');
        setMessage(err.mensaje || 'Error al iniciar sesión con Google');
      } finally {
        setLoading(false);
      }
    },
    onError: () => {
      setMessageVariant('error');
      setMessage('La autenticación con Google falló.');
    },
  });

  const redirectAuthenticatedUser = (user: any) => {
    if (user?.email === 'emprendedor@gmail.com' || user?.is_store_owner === true) {
      navigate('/emprendedor');
    } else {
      navigate(route());
    }
  };

  const handleSendMfaEmailCode = async () => {
    if (!mfaToken || loading) return;
    setLoading(true);
    setMessage('');
    try {
      const res = await authService.sendMfaEmailCode(mfaToken);
      setMessageVariant('success');
      setMessage(res.mensaje || 'Código temporal enviado a tu correo (expira en 60 segundos).');
    } catch (err: any) {
      setMessageVariant('error');
      setMessage(err?.mensaje || err?.message || 'No se pudo enviar el código temporal por correo.');
    } finally {
      setLoading(false);
    }
  };

  // 2. Formulario tradicional conectado a la API
  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      if (mode === 'forgot') {
        const cleanEmail = email.trim();
        if (!isValidEmail(cleanEmail)) {
          setMessageVariant('error');
          setMessage('Introduce un correo electrónico válido.');
          setLoading(false);
          return;
        }
        const res = await authService.requestPasswordReset(cleanEmail, Number(templateNumber) || 1);
        setMessageVariant('success');
        setMessage(
          res.mensaje ||
            'Hemos enviado un correo con el enlace para cambiar tu contraseña. Revisa tu bandeja de entrada.',
        );
        setLoading(false);
        return;
      }

      if (mode === 'reset') {
        const pErrors = getPasswordValidationErrors(password);
        if (pErrors.length > 0) {
          setPasswordErrors(pErrors);
          setLoading(false);
          return;
        }
        if (password !== confirmPassword) {
          setMessageVariant('error');
          setMessage('Las contraseñas ingresadas no coinciden.');
          setLoading(false);
          return;
        }
        const res = await authService.confirmPasswordReset(resetToken, password);
        setPassword('');
        setConfirmPassword('');
        setPasswordErrors([]);
        setMode('login');
        setMessageVariant('success');
        setMessage(res.mensaje || 'Tu contraseña ha sido actualizada. Inicia sesión con tu nueva clave.');
        setLoading(false);
        return;
      }

      if (mode === 'mfa') {
        const cleanedCode = mfaCode.replace(/\D/g, '');
        if (cleanedCode.length !== 6) {
          setMessageVariant('error');
          setMessage('Ingresa el código de 6 dígitos de tu aplicación autenticadora o correo.');
          setLoading(false);
          return;
        }
        const data = await authService.verifyMfa(mfaToken, cleanedCode);
        authService.setSession(data.data.token);
        redirectAuthenticatedUser(data.data.user);
        return;
      }

      // Validación estricta y sanitización contra SQLi / XSS en Login y Registro
      const cleanEmail = email.trim();
      if (!isValidEmail(cleanEmail) || containsSqlOrControlInjection(cleanEmail)) {
        setMessageVariant('error');
        setMessage('Correo electrónico inválido o con caracteres no permitidos.');
        setLoading(false);
        return;
      }

      if (!captchaToken || captchaAnswer.trim().length < 2) {
        setMessageVariant('error');
        setMessage('Por favor completa el código de seguridad CAPTCHA.');
        setLoading(false);
        return;
      }

      if (mode === 'register') {
        const pErrors = getPasswordValidationErrors(password);
        if (pErrors.length > 0) {
          setPasswordErrors(pErrors);
          setLoading(false);
          return;
        }
        if (postalCode.trim() && !isValidPostalCode(postalCode)) {
          setMessageVariant('error');
          setMessage('Código postal inválido: solo se permiten números y guiones.');
          setLoading(false);
          return;
        }
      }

      let data;
      if (mode === 'login') {
        data = await authService.login({
          username: cleanEmail,
          password,
          captcha_token: captchaToken,
          captcha_answer: captchaAnswer,
        });

        if (data?.data?.mfa_required) {
          setMfaToken(data.data.mfa_token);
          setMfaEmailMasked(data.data.email_masked || cleanEmail);
          setMfaCode('');
          setMode('mfa');
          setMessageVariant('info');
          setMessage(
            data.mensaje ||
              'Ingresa el código temporal de 6 dígitos de Google Authenticator / Authy o solicita uno a tu correo.',
          );
          setLoading(false);
          return;
        }
      } else {
        const trimmedName = name.trim();
        const nameParts = trimmedName.split(/\s+/);
        if (nameParts.length < 2) {
          setMessageVariant('error');
          setMessage('Nombre incompleto: Escribe tu nombre y apellido separados por un espacio.');
          setLoading(false);
          return;
        }
        if (!isValidPersonName(trimmedName)) {
          setMessageVariant('error');
          setMessage('Nombre inválido: Solo se permiten letras, espacios, apóstrofes y guiones (máximo 150 caracteres).');
          setLoading(false);
          return;
        }

        const first_name = escapeHtml(nameParts[0]);
        const last_name = escapeHtml(nameParts.slice(1).join(' '));
        const safeUsername = cleanEmail.split('@')[0].replace(/[^a-zA-Z0-9._@-]/g, '').slice(0, 150);

        data = await authService.register({
          username: safeUsername,
          email: cleanEmail,
          password,
          first_name,
          last_name,
          postal_code: postalCode.trim(),
          captcha_token: captchaToken,
          captcha_answer: captchaAnswer,
        });
      }

      authService.setSession(data.data.token);
      if (mode === 'register' && commercial) {
        let notice: string;
        try {
          notice = (await requestConsent(cleanEmail, templateNumber)).mensaje;
        } catch (e) {
          notice = 'Tu cuenta fue creada. ' + (e instanceof Error ? e.message : 'Reintenta la preferencia comercial.');
        }
        navigate(route('preferencias-comerciales'), { state: { notice } });
        return;
      }

      redirectAuthenticatedUser(data.data.user);
    } catch (err: any) {
      setCaptchaRefresh((prev) => prev + 1);
      setMessageVariant('error');

      const rawBackendPwdErrors =
        err?.new_password ||
        err?.password ||
        err?.error?.detalles?.new_password ||
        err?.error?.detalles?.password;

      const backendPwdErrors = rawBackendPwdErrors
        ? (Array.isArray(rawBackendPwdErrors) ? rawBackendPwdErrors : [String(rawBackendPwdErrors)]).map(String)
        : null;

      if (backendPwdErrors && backendPwdErrors.length > 0) {
        setPasswordErrors(backendPwdErrors);
      }

      const errorString = JSON.stringify(err).toLowerCase();
      const detalles = err?.error?.detalles || {};
      const codigo = err?.error?.codigo || '';

      if (codigo === 'LIMITE_INTENTOS_EXCEDIDO' || errorString.includes('5 intentos') || errorString.includes('demasiados intentos')) {
        setMessage(
          err?.mensaje ||
            'Has superado el límite de 5 intentos por minuto. Por seguridad, espera 1 minuto antes de volver a intentarlo.',
        );
      } else if (detalles?.captcha || errorString.includes('captcha')) {
        setMessage('El código CAPTCHA ingresado es incorrecto o expiró. Intenta con el nuevo código.');
      } else if (err?.mensaje) {
        setMessage(err.mensaje);
      } else if (backendPwdErrors && backendPwdErrors.length > 0) {
        setMessage(backendPwdErrors[0]);
      } else if (err?.last_name || detalles?.last_name || errorString.includes('last_name') || errorString.includes('blank')) {
        setMessage('Nombre incompleto: Escribe tu nombre y apellido separados por un espacio.');
      } else if (err?.email || detalles?.email || errorString.includes('email')) {
        setMessage('Error en el correo: El formato es inválido o ya está registrado.');
      } else if (err?.message) {
        setMessage(err.message);
      } else {
        setMessage('Error al procesar la solicitud. Revisa los datos ingresados.');
      }
    } finally {
      setLoading(false);
    }
  };

  const changeMode = () => {
    setMode((current) => (current === 'login' ? 'register' : 'login'));
    setMessage('');
    setCommercial(false);
    setPassword('');
    setConfirmPassword('');
    setPasswordErrors([]);
    setCaptchaRefresh((prev) => prev + 1);
  };

  const openForgotPassword = () => {
    setMode('forgot');
    setMessage('');
    setPassword('');
    setPasswordErrors([]);
  };

  const headerTitle =
    mode === 'login'
      ? 'Bienvenido de nuevo'
      : mode === 'register'
        ? 'Crear cuenta'
        : mode === 'forgot'
          ? 'Recuperar contraseña'
          : mode === 'reset'
            ? 'Nueva contraseña'
            : 'Verificación MFA';

  const renderFormFields = (helperTextClass: string, forgotLinkClass: string) => {
    if (mode === 'forgot') {
      return (
        <>
          <p className={`text-xs ${helperTextClass} leading-relaxed`}>
            Ingresa el correo electrónico asociado a tu cuenta y te enviaremos un enlace seguro para cambiar tu contraseña.
          </p>
          <Input
            label="Correo electrónico asociado"
            type="email"
            maxLength={MAX_EMAIL_LENGTH}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="correo@ejemplo.com"
            required
          />
          <div className="text-left">
            <button
              type="button"
              data-page-action="ghost"
              onClick={() => {
                setMode('login');
                setMessage('');
              }}
              className={forgotLinkClass}
            >
              ← Volver a iniciar sesión
            </button>
          </div>
        </>
      );
    }

    if (mode === 'reset') {
      return (
        <>
          <Input
            label="Nueva contraseña"
            type="password"
            maxLength={MAX_PASSWORD_LENGTH}
            value={password}
            onChange={(event) => {
              const val = event.target.value;
              setPassword(val);
              if (passwordErrors.length > 0) {
                setPasswordErrors(getPasswordValidationErrors(val));
              }
            }}
            placeholder="••••••••"
            autoComplete="new-password"
            required
          />
          <Input
            label="Confirmar nueva contraseña"
            type="password"
            maxLength={MAX_PASSWORD_LENGTH}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="••••••••"
            autoComplete="new-password"
            required
          />
          <div className="flex flex-col gap-2">
            <p className={`text-xs ${helperTextClass} leading-relaxed`}>
              La contraseña debe contener al menos 8 caracteres, números, caracteres especiales y mayúsculas.
            </p>
            {passwordErrors.length > 0 && (
              <Alert variant="error" title="La contraseña no cumple los requisitos:">
                <ul className="list-disc list-inside space-y-0.5 text-xs mt-1">
                  {passwordErrors.map((err, idx) => (
                    <li key={idx}>{err}</li>
                  ))}
                </ul>
              </Alert>
            )}
          </div>
        </>
      );
    }

    if (mode === 'mfa') {
      return (
        <>
          <p className={`text-xs ${helperTextClass} leading-relaxed`}>
            Introduce el código temporal de 6 dígitos generado por <strong>Google Authenticator / Authy</strong> (expira cada 30s) o solicita un código temporal a tu correo ({mfaEmailMasked}).
          </p>
          <Input
            label="Código de verificación MFA (6 dígitos)"
            value={mfaCode}
            onChange={(event) =>
              setMfaCode(event.target.value.replace(/\D/g, '').slice(0, 6))
            }
            placeholder="123456"
            inputMode="numeric"
            maxLength={6}
            autoComplete="one-time-code"
            required
          />
          <div className="flex items-center justify-between gap-2 text-xs">
            <button
              type="button"
              data-page-action="ghost"
              onClick={() => void handleSendMfaEmailCode()}
              disabled={loading}
              className={forgotLinkClass}
            >
              Enviar código al correo (60s)
            </button>
            <button
              type="button"
              data-page-action="ghost"
              onClick={() => {
                setMode('login');
                setMfaToken('');
                setMfaCode('');
                setMessage('');
              }}
              className={forgotLinkClass}
            >
              ← Volver
            </button>
          </div>
        </>
      );
    }

    return (
      <>
        {mode === 'register' && (
          <Input
            label="Nombre completo"
            maxLength={MAX_NAME_LENGTH}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="María González"
            required
          />
        )}

        <Input
          label="Correo electrónico"
          type="email"
          maxLength={MAX_EMAIL_LENGTH}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="correo@ejemplo.com"
          required
        />

        {mode === 'register' && (
          <Input
            label="Código postal (opcional)"
            maxLength={MAX_POSTAL_CODE_LENGTH}
            value={postalCode}
            onChange={(event) => {
              const allowed = event.target.value.replace(/[^0-9-]/g, '').slice(0, MAX_POSTAL_CODE_LENGTH);
              setPostalCode(allowed);
            }}
            placeholder="8320000"
            hint="Solo números y guiones"
          />
        )}

        <Input
          label="Contraseña"
          type="password"
          maxLength={MAX_PASSWORD_LENGTH}
          value={password}
          onChange={(event) => {
            const val = event.target.value;
            setPassword(val);
            if (passwordErrors.length > 0) {
              setPasswordErrors(getPasswordValidationErrors(val));
            }
          }}
          placeholder="••••••••"
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          required
        />

        {mode === 'register' && (
          <div className="flex flex-col gap-2">
            <p className={`text-xs ${helperTextClass} leading-relaxed`}>
              La contraseña debe contener al menos 8 caracteres, números, caracteres especiales y mayúsculas.
            </p>
            {passwordErrors.length > 0 && (
              <Alert variant="error" title="La contraseña no cumple los requisitos:">
                <ul className="list-disc list-inside space-y-0.5 text-xs mt-1">
                  {passwordErrors.map((err, idx) => (
                    <li key={idx}>{err}</li>
                  ))}
                </ul>
              </Alert>
            )}
          </div>
        )}

        <CaptchaWidget
          token={captchaToken}
          answer={captchaAnswer}
          onTokenChange={setCaptchaToken}
          onAnswerChange={setCaptchaAnswer}
          refreshTrigger={captchaRefresh}
          disabled={loading}
        />

        {mode === 'register' && (
          <CommercialOptIn checked={commercial} onChange={setCommercial} disabled={loading} />
        )}

        {mode === 'login' && (
          <div className="text-right -mt-1">
            <button
              data-page-action="ghost"
              type="button"
              onClick={openForgotPassword}
              className={forgotLinkClass}
            >
              ¿Olvidaste tu contraseña?
            </button>
          </div>
        )}
      </>
    );
  };

  const submitLabel = (withArrow: boolean) => {
    if (loading) return 'Procesando...';
    if (mode === 'forgot') return withArrow ? 'Enviar correo de recuperación →' : 'Enviar correo de recuperación';
    if (mode === 'reset') return withArrow ? 'Guardar nueva contraseña →' : 'Guardar nueva contraseña';
    if (mode === 'mfa') return withArrow ? 'Verificar código MFA →' : 'Verificar código MFA';
    if (mode === 'login') return withArrow ? 'Ingresar →' : 'Ingresar';
    return withArrow ? 'Crear cuenta →' : 'Crear cuenta';
  };

  if (isCatalog) {
    return (
      <div className="min-h-[76vh] bg-[var(--visual-page-panel-background)] text-[var(--visual-page-color)] flex items-center justify-center px-5 py-14 md:py-20">
        <div className="w-full max-w-[460px] mx-auto">
          <div data-login-header className="text-center mb-8 flex flex-col items-center">
            <div className="flex justify-center mb-5">
              <InstitutionalBadge />
            </div>

            <p className="text-[var(--primary)] text-[10px] font-black uppercase tracking-[0.16em] text-center">
              {config.name} · Tu cuenta
            </p>

            <h1 className="mt-3 text-[42px] md:text-[50px] leading-none tracking-[-0.045em] font-black text-center">
              {headerTitle}
            </h1>

            {(mode === 'login' || mode === 'register') && (
              <p className="mt-4 text-[13px] text-[var(--visual-page-color)]/60 text-center">
                {mode === 'login' ? '¿No tienes cuenta?' : '¿Ya tienes cuenta?'}{' '}
                <button
                  data-page-action="ghost"
                  type="button"
                  onClick={changeMode}
                  className="font-semibold text-[var(--primary)] hover:opacity-70 transition-opacity underline underline-offset-4"
                >
                  {mode === 'login' ? 'Regístrate' : 'Ingresar'}
                </button>
              </p>
            )}
          </div>

          <div data-page-panel data-visual-section="pagePanel" className="rounded-[16px] bg-[var(--visual-page-panel-background)] p-6 md:p-8 text-[var(--visual-page-color)] flex flex-col gap-5">
            {message && (
              <Alert variant={messageVariant}>
                {message}
              </Alert>
            )}

            {(mode === 'login' || mode === 'register') && (
              <>
                <button
                  data-page-action="outline"
                  type="button"
                  onClick={() => loginConGoogle()}
                  className="w-full h-12 flex items-center justify-center gap-3 border border-[var(--visual-global-border)]/20 bg-[var(--visual-page-panel-background)] rounded-[9px] text-[12px] font-semibold hover:border-[var(--visual-global-border)]/40 transition-colors"
                >
                  <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 0 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  Continuar con Google
                </button>

                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-[var(--visual-global-border)]/20" />
                  <span className="text-[11px] text-[var(--visual-page-color)]/50">o</span>
                  <div className="flex-1 h-px bg-[var(--visual-global-border)]/20" />
                </div>
              </>
            )}

            <form data-page-form onSubmit={handleSubmit} className="flex flex-col gap-4 text-left">
              {renderFormFields(
                'text-[var(--visual-page-color)]/75',
                'text-xs text-[var(--primary)] hover:underline transition-colors',
              )}

              <button
                data-visual-section="pageButton"
                data-page-action="primary"
                type="submit"
                disabled={loading}
                className="w-full h-12 rounded-[9px] bg-[var(--primary)] text-[var(--visual-page-color)] text-[12px] font-bold hover:bg-[var(--primary)] disabled:opacity-50 disabled:cursor-wait transition-colors"
              >
                {submitLabel(true)}
              </button>
            </form>

            <div className="text-center pt-1">
              <Link
                data-page-action="ghost"
                to={route()}
                className="text-[11px] uppercase tracking-[0.12em] text-[var(--visual-page-color)]/60 hover:text-[var(--primary)] transition-colors"
              >
                Continuar como invitado →
              </Link>
            </div>
          </div>

          <p className="text-center text-[11px] text-[var(--visual-page-color)]/45 mt-5">
            Compra de forma segura y sencilla.
          </p>
        </div>
      </div>
    );
  }

  if (isVisual) {
    return (
      <div className="min-h-[72vh] bg-[var(--visual-page-panel-background)] text-[var(--visual-page-color)] flex items-center justify-center px-5 md:px-8 py-14 md:py-20">
        <div className="w-full max-w-[460px] mx-auto">
          <div data-login-header className="text-center mb-8 flex flex-col items-center">
            <p className="mb-3 text-[9px] font-medium uppercase tracking-[0.18em] text-[var(--visual-page-color)] text-center">
              {config.name} · Tu cuenta
            </p>

            <h1 className="font-serif text-[42px] md:text-[50px] leading-none tracking-[-0.025em] text-center">
              {headerTitle}
            </h1>

            {(mode === 'login' || mode === 'register') && (
              <p className="mt-4 text-[13px] text-[var(--visual-page-color)] text-center">
                {mode === 'login' ? '¿No tienes cuenta?' : '¿Ya tienes cuenta?'}{' '}
                <button
                  data-page-action="outline"
                  type="button"
                  onClick={changeMode}
                  className="font-semibold text-[var(--visual-page-color)] border-b border-[var(--visual-global-border)] hover:opacity-50 transition-opacity"
                >
                  {mode === 'login' ? 'Regístrate' : 'Ingresar'}
                </button>
              </p>
            )}
          </div>

          <div data-page-panel data-visual-section="pagePanel" className="rounded-[10px] bg-[var(--visual-page-panel-background)] p-6 md:p-8 flex flex-col gap-5">
            {message && (
              <Alert variant={messageVariant}>
                {message}
              </Alert>
            )}

            {(mode === 'login' || mode === 'register') && (
              <>
                <button
                  data-page-action="outline"
                  type="button"
                  onClick={() => loginConGoogle()}
                  className="w-full h-12 flex items-center justify-center gap-3 border border-[var(--visual-global-border)]/15 bg-[var(--visual-page-panel-background)] rounded-[8px] text-[12px] font-semibold hover:border-[var(--visual-global-border)] transition-colors"
                >
                  <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 0 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  Continuar con Google
                </button>

                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-[var(--visual-global-border)]/15" />
                  <span className="text-[10px] text-[var(--visual-page-color)]">o</span>
                  <div className="flex-1 h-px bg-[var(--visual-global-border)]/15" />
                </div>
              </>
            )}

            <form data-page-form onSubmit={handleSubmit} className="flex flex-col gap-4 text-left">
              {renderFormFields(
                'text-[#77716e]',
                'text-[11px] text-[var(--visual-page-color)] hover:underline transition-colors',
              )}

              <button
                data-visual-section="pageButton"
                data-page-action="primary"
                type="submit"
                disabled={loading}
                className="w-full h-12 rounded-[8px] bg-[var(--visual-page-panel-background)] text-[var(--visual-page-color)] text-[12px] font-semibold hover:opacity-80 disabled:opacity-50 disabled:cursor-wait transition-opacity"
              >
                {submitLabel(true)}
              </button>
            </form>

            <div className="text-center pt-1">
              <Link
                data-page-action="ghost"
                to={route()}
                className="text-[10px] uppercase tracking-[0.12em] text-[var(--visual-page-color)] hover:underline transition-colors"
              >
                Continuar como invitado →
              </Link>
            </div>
          </div>

          <p className="text-center text-[10px] text-[var(--visual-page-color)] mt-5">
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
      <div className="w-full max-w-md mx-auto">
        <div
          data-login-header
          className={
            isMinimal
              ? 'text-center mb-7 flex flex-col items-center'
              : 'text-center mb-8 flex flex-col items-center'
          }
        >
          {!isMinimal && (
            <div className="flex justify-center mb-4">
              <InstitutionalBadge />
            </div>
          )}

          {isMinimal && (
            <p className="text-xs text-[var(--visual-page-color)] mb-2 text-center">
              {config.name}
            </p>
          )}

          <h1
            className={
              isMinimal
                ? 'text-3xl md:text-4xl font-semibold tracking-tight text-[var(--visual-page-color)] text-center'
                : 'text-2xl font-bold text-center'
            }
          >
            {headerTitle}
          </h1>

          {(mode === 'login' || mode === 'register') && (
            <p className="text-sm text-[var(--muted-foreground)] mt-2 text-center">
              {mode === 'login' ? '¿No tienes cuenta?' : '¿Ya tienes cuenta?'}{' '}
              <button
                data-page-action="ghost"
                type="button"
                onClick={changeMode}
                className={
                  isMinimal
                    ? 'text-[var(--primary)] font-semibold hover:opacity-60 transition-opacity underline underline-offset-4'
                    : 'text-[var(--primary)] font-semibold hover:underline'
                }
              >
                {mode === 'login' ? 'Regístrate' : 'Ingresar'}
              </button>
            </p>
          )}
        </div>

        <div
          data-page-panel
          data-visual-section="pagePanel"
          className={
            isMinimal
              ? 'bg-[var(--visual-page-panel-background)] border border-[var(--visual-global-border)]/5 rounded-[28px] p-6 md:p-8 flex flex-col gap-5'
              : 'bg-[var(--visual-page-panel-background)] border border-[var(--border)] rounded-2xl p-6 md:p-8 flex flex-col gap-5'
          }
        >
          {message && (
            <Alert variant={messageVariant}>
              {message}
            </Alert>
          )}

          {(mode === 'login' || mode === 'register') && (
            <>
              <button
                data-page-action="outline"
                type="button"
                onClick={() => loginConGoogle()}
                className={
                  isMinimal
                    ? 'w-full h-12 flex items-center justify-center gap-3 border border-[var(--visual-global-border)]/10 rounded-full text-sm font-medium hover:bg-[var(--visual-page-panel-background)] transition-colors'
                    : 'w-full h-11 flex items-center justify-center gap-3 border border-[var(--border)] rounded-xl py-2.5 text-sm font-medium hover:bg-[var(--muted)] transition-colors'
                }
              >
                <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 0 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Continuar con Google
              </button>

              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-[var(--border)]" />
                <span className="text-xs text-[var(--muted-foreground)]">o</span>
                <div className="flex-1 h-px bg-[var(--border)]" />
              </div>
            </>
          )}

          <form data-page-form onSubmit={handleSubmit} className="flex flex-col gap-4 text-left">
            {renderFormFields(
              'text-[var(--muted-foreground)]',
              isMinimal
                ? 'text-xs text-[var(--primary)] hover:opacity-60 transition-opacity'
                : 'text-xs text-[var(--primary)] hover:underline',
            )}

            {isMinimal ? (
              <button
                data-visual-section="pageButton"
                data-page-action="primary"
                type="submit"
                disabled={loading}
                className="w-full h-12 rounded-full bg-[var(--primary)] text-[var(--visual-page-color)] text-sm font-semibold hover:bg-[var(--primary)] disabled:opacity-60 disabled:cursor-wait transition-colors"
              >
                {submitLabel(false)}
              </button>
            ) : (
              <Button
                type="submit"
                variant="primary"
                size="lg"
                fullWidth
                loading={loading}
              >
                {submitLabel(false)}
              </Button>
            )}
          </form>

          <div className="text-center pt-1">
            <Link
              data-page-action="ghost"
              to={route()}
              className={
                isMinimal
                  ? 'text-xs text-[var(--visual-page-color)] hover:text-[var(--primary)] transition-colors'
                  : 'text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors'
              }
            >
              Continuar como invitado →
            </Link>
          </div>
        </div>

        <p className="text-center text-xs text-[var(--muted-foreground)] mt-5">
          Compra de forma segura y sencilla.
        </p>
      </div>
    </div>
  );
}
