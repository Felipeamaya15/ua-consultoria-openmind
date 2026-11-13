import { useEffect, useState } from 'react';
import { authService } from '../services/authService';
import { Input } from '../../storefront/components/ui';

interface CaptchaWidgetProps {
  token: string;
  answer: string;
  onTokenChange: (token: string) => void;
  onAnswerChange: (answer: string) => void;
  refreshTrigger?: number;
  disabled?: boolean;
}

export function CaptchaWidget({
  answer,
  onTokenChange,
  onAnswerChange,
  refreshTrigger = 0,
  disabled = false,
}: CaptchaWidgetProps) {
  const [captchaImage, setCaptchaImage] = useState('');
  const [loadingCaptcha, setLoadingCaptcha] = useState(false);
  const [captchaError, setCaptchaError] = useState('');

  const loadCaptcha = async () => {
    setLoadingCaptcha(true);
    setCaptchaError('');
    try {
      const challenge = await authService.getCaptcha();
      setCaptchaImage(challenge.captcha_image);
      onTokenChange(challenge.captcha_token);
      onAnswerChange('');
    } catch {
      setCaptchaError('No se pudo cargar el CAPTCHA. Pulsa recargar.');
    } finally {
      setLoadingCaptcha(false);
    }
  };

  useEffect(() => {
    void loadCaptcha();
  }, [refreshTrigger]);

  return (
    <div
      data-captcha-widget="true"
      className="flex flex-col gap-2 p-3 rounded-xl border border-[var(--border)] bg-[var(--muted)]/30"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-[var(--foreground)]">
          Verificación de seguridad (CAPTCHA)
        </span>
        <button
          type="button"
          onClick={() => void loadCaptcha()}
          disabled={loadingCaptcha || disabled}
          className="text-xs font-medium text-[var(--primary)] hover:underline disabled:opacity-50"
          aria-label="Generar nuevo código CAPTCHA"
        >
          {loadingCaptcha ? 'Cargando...' : '↻ Otro código'}
        </button>
      </div>

      <div className="flex items-center gap-3">
        <div className="h-14 w-[190px] shrink-0 rounded-lg border border-[var(--border)] bg-white flex items-center justify-center overflow-hidden">
          {captchaImage ? (
            <img
              src={captchaImage}
              alt="Código de seguridad CAPTCHA"
              className="w-full h-full object-contain select-none"
            />
          ) : (
            <span className="text-xs text-[var(--muted-foreground)] px-2 text-center">
              {captchaError || 'Cargando desafío...'}
            </span>
          )}
        </div>

        <div className="flex-1">
          <Input
            label="Código de la imagen"
            value={answer}
            onChange={(event) => {
              const cleaned = event.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 8);
              onAnswerChange(cleaned);
            }}
            placeholder="Ej: 7K9P2"
            maxLength={8}
            autoComplete="off"
            disabled={disabled}
            required
          />
        </div>
      </div>
    </div>
  );
}
