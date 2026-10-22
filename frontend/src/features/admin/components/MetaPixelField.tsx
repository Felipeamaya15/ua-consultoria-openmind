import { Input } from './ui';
import { validatePixelId } from '../../storefront/services/metaPixelService';

interface MetaPixelFieldProps {
  value: string;
  onChange: (value: string) => void;
}

/** Campo único para configurar el identificador de Meta/Facebook Pixel. */
export function MetaPixelField({ value, onChange }: MetaPixelFieldProps) {
  const validation = validatePixelId(value);

  return (
    <Input
      label="Identificador de medición de Meta/Facebook (Pixel ID)"
      placeholder="Ej: 1234567890123456"
      hint="Identificador numérico de 9 a 16 dígitos de tu cuenta de anuncios de Meta/Facebook."
      persistentHint
      value={value}
      maxLength={16}
      inputMode="numeric"
      autoComplete="off"
      spellCheck={false}
      error={value.trim() && !validation.valid ? validation.error : undefined}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
