import { Input } from './ui';
import { validateGoogleAnalyticsId } from '../../storefront/services/googleAnalyticsService';

interface GoogleAnalyticsFieldProps {
  value: string;
  onChange: (value: string) => void;
}

/** Campo único para configurar el identificador de medición GA4 de la tienda. */
export function GoogleAnalyticsField({ value, onChange }: GoogleAnalyticsFieldProps) {
  const validation = validateGoogleAnalyticsId(value);

  return (
    <Input
      label="Identificador de Google Analytics (opcional)"
      placeholder="G-XXXXXXXXXX"
      hint="Usa el identificador de medición GA4 que comienza con G-."
      persistentHint
      value={value}
      maxLength={22}
      autoComplete="off"
      spellCheck={false}
      error={value.trim() && !validation.valid ? validation.error : undefined}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
