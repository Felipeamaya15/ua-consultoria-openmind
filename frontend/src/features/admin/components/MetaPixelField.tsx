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
    <div className="space-y-2">
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
    <details className="text-sm"><summary className="cursor-pointer font-medium focus-visible:outline focus-visible:outline-2">¿Dónde encuentro este dato?</summary><p className="mt-2 text-[var(--muted-foreground)]">Mide visitas y conversiones para evaluar anuncios. En Meta abre el Administrador de eventos → Orígenes de datos → selecciona tu píxel → Configuración y copia el identificador del píxel, no el de la cuenta publicitaria.</p></details>
    </div>
  );
}
