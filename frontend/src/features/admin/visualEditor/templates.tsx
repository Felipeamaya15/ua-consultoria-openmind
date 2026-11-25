import type { TemplateId } from '../data/mockAdminData';
import { VISUAL_PRESETS } from '../../storefront/visual/presets';

export const TEMPLATE_PERSONALITIES: Record<TemplateId, { description: string; personality: string }> = {
  editorial: { description: 'Colorida, moderna y dinámica', personality: 'Haz que tu marca destaque' },
  minimal: { description: 'Suave, cercana y fácil de recorrer', personality: 'Una experiencia acogedora' },
  visual: { description: 'Elegante y enfocada en fotografía', personality: 'Cuenta tu historia con imágenes' },
  catalog: { description: 'Oscura, premium y minimalista', personality: 'El producto es protagonista' },
};

export function TemplateGallery({ selected, onSelect }: { selected: TemplateId; onSelect: (id: TemplateId) => void }) {
  return <div className="ve-template-gallery">{Object.values(VISUAL_PRESETS).map(preset => {
    const detail = TEMPLATE_PERSONALITIES[preset.id];
    return <button type="button" key={preset.id} aria-pressed={selected === preset.id} onClick={() => onSelect(preset.id)}>
      <div aria-hidden="true" className={`ve-template-mini ve-template-${preset.id}`}><div className="ve-mini-header">Mi tienda <span>•••</span></div><div className="ve-mini-banner"><span>Tu próxima<br/>gran idea</span><i/></div><div className="ve-mini-products"><i/><i/><i/></div></div>
      <div className="ve-template-copy"><strong>{preset.name}</strong><span>{detail.description}</span><small>{detail.personality}</small><b>{selected === preset.id ? '✓ Plantilla seleccionada' : 'Probar esta plantilla →'}</b></div>
    </button>;
  })}<p className="ve-hint">Puedes probar y volver atrás. Guarda los cambios para aplicar tu elección.</p></div>;
}
