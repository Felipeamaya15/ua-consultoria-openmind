import { CONSENT_TEXT } from '../../services/commercialConsent';
export function CommercialOptIn({checked, onChange, disabled = false}: {checked: boolean; onChange: (value: boolean) => void; disabled?: boolean}) {
  return <div className="my-4 text-sm">
    <label className="flex items-start gap-3"><input type="checkbox" className="mt-1 shrink-0" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} />
      <span>{CONSENT_TEXT}</span></label>
    <p className="mt-2 text-xs opacity-75">Opcional. Recibirás un enlace para confirmar el correo. Comprar, registrarte o aceptar cookies no autoriza publicidad.</p>
  </div>;
}
