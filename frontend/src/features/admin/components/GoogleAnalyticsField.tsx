import { Input } from './ui';

interface GoogleAnalyticsFieldProps {
  value: string;
  onChange: (value: string) => void;
}

/** Campo único para configurar el identificador de medición GA4 de la tienda. */
export function GoogleAnalyticsField({ value, onChange }: GoogleAnalyticsFieldProps) {
  return (
    <Input
      label="Identificador de Google Analytics (opcional)"
      placeholder="G-XXXXXXXXXX"
      hint="Usa el identificador de medición GA4 que comienza con G-."
      persistentHint
      value={value}
      maxLength={15}
      autoComplete="off"
      spellCheck={false}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
