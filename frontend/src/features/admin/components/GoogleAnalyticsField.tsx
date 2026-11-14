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
    <div className="space-y-2">
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
    <details className="text-sm"><summary className="cursor-pointer font-medium focus-visible:outline focus-visible:outline-2">¿Dónde encuentro este dato?</summary><p className="mt-2 text-[var(--muted-foreground)]">Mide visitas y eventos de tu tienda. En Google Analytics abre Administrador → Flujos de datos → selecciona tu flujo Web → ID de medición. El identificador GA4 suele comenzar con G-. No uses el ID numérico de la propiedad.</p></details>
    </div>
  );
}
