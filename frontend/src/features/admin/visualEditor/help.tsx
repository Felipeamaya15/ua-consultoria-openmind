import { useId, useState } from 'react';

/** Text help usable with mouse, focus, touch and Escape; no media dependency. */
export function FieldHelp({ label, children }: { label: string; children: string }) {
  const id = useId();
  const [hover, setHover] = useState(false), [focus, setFocus] = useState(false), [pinned, setPinned] = useState(false), [dismissed, setDismissed] = useState(false);
  const visible = !dismissed && (hover || focus || pinned);
  return <span className="ve-help" onMouseEnter={() => { setHover(true); setDismissed(false); }} onMouseLeave={() => setHover(false)}>
    <button type="button" className="ve-help-button" aria-label={`Ayuda: ${label}`} aria-describedby={visible ? id : undefined} aria-expanded={visible} onFocus={() => { setFocus(true); setDismissed(false); }} onBlur={() => { setFocus(false); setPinned(false); }} onClick={() => { setPinned(!pinned); setDismissed(false); }} onKeyDown={event => { if (event.key === 'Escape') { setPinned(false); setDismissed(true); } }}>i</button>
    <span id={id} role="tooltip" hidden={!visible} className="ve-help-popover">{children}</span>
  </span>;
}
export const SECTION_HELP: Partial<Record<import('./sections').VisualSectionId, string>> = {
  hero: 'Define cuánto espacio ocupa la imagen principal al entrar a tu tienda.',
  heroCta: 'Personaliza el botón destacado que invita al cliente a ver tus productos.',
  categories: 'Define cómo se muestran y distribuyen las categorías de tu tienda.',
  productGrid: 'Controla cuántos productos aparecen por fila y el espacio entre ellos.',
  productCard: 'Cambia la apariencia de las cajas donde se muestran tus productos.',
  footer: 'Personaliza la distribución y colores de la sección inferior de tu tienda.',
  pageLayout: 'Personaliza el ancho, fondo y títulos de la página seleccionada. Cada página conserva sus propios ajustes.',
  pagePanel: 'Cambia la apariencia de los formularios y cajas de información sin cambiar su contenido ni funcionamiento.',
  pageField: 'Personaliza las casillas donde el cliente escribe o selecciona sus datos.',
  pageButton: 'Personaliza los botones principales de esta página. Las acciones y validaciones se conservan.',
};
export function InstitutionalNotice() {
  return <div className="ve-institutional-notice"><strong>Identidad institucional</strong><FieldHelp label="Identidad institucional">Este elemento forma parte de la identidad institucional de la plataforma y debe permanecer visible.</FieldHelp><p>Elemento obligatorio de la plataforma.</p></div>;
}
