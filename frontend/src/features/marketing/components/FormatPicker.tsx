import { useId } from 'react';
import { PUBLICATION_FORMATS, type PublicationFormat } from '../domain/types';

export function FormatPicker({ value, onChange }: { value: PublicationFormat; onChange: (value: PublicationFormat) => void }) {
  const name = useId();
  return <fieldset className="marketing-format-options"><legend>2. Elige el formato</legend>
    {PUBLICATION_FORMATS.map(format => <label key={format.id} className={`marketing-format ${value === format.id ? 'is-selected' : ''}`}>
      <input type="radio" name={name} checked={value === format.id} value={format.id} onChange={() => onChange(format.id)} />
      <span className={`marketing-format-icon is-${format.id}`} aria-hidden="true" />
      <span><strong>{format.label}</strong><span>{format.ratio}</span></span>
    </label>)}
  </fieldset>;
}
