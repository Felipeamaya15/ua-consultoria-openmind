export const EDITOR_PALETTES = [
  { name: 'Océano', primary: '#2563eb', secondary: '#eff6ff', accent: '#0369a1' },
  { name: 'Bosque', primary: '#15803d', secondary: '#f0fdf4', accent: '#4d7c0f' },
  { name: 'Ciruela', primary: '#7e22ce', secondary: '#faf5ff', accent: '#a21caf' },
  { name: 'Grafito', primary: '#475569', secondary: '#f1f5f9', accent: '#0f766e' },
] as const;
export const PALETTE_PATHS = ['global.colors.primary','global.colors.secondary','global.colors.accent','global.colors.background','global.colors.text','global.colors.surface','global.colors.border','global.colors.alternate','global.colors.muted','global.colors.structural','global.colors.button','global.colors.buttonText','global.unlinkStructural','header.background','header.textColor','topBar.background','footer.background','footer.textColor'] as const;
export function paletteEdits(palette: typeof EDITOR_PALETTES[number]): Record<string, string> {
  return { 'global.colors.primary': palette.primary, 'global.colors.secondary': palette.secondary, 'global.colors.accent': palette.accent, 'global.colors.background': '#fafafa', 'global.colors.text': '#18202e', 'global.colors.surface': '#ffffff', 'global.colors.border': '#cdd4de', 'global.colors.alternate': palette.secondary, 'global.colors.muted': '#596579', 'global.colors.structural': palette.primary, 'global.colors.button': palette.primary, 'global.colors.buttonText': '#ffffff' };
}
export function PaletteControl({ onPalette, onReset }: { onPalette: (palette: typeof EDITOR_PALETTES[number]) => void; onReset: () => void }) {
  return <div className="ve-control"><strong>Encuentra tus colores</strong><p className="ve-hint">Paletas coordinadas para toda tu tienda. Después puedes personalizar cada color.</p><div className="ve-palettes">{EDITOR_PALETTES.map(palette => <button type="button" key={palette.name} aria-label={`Usar esta paleta: ${palette.name}`} onClick={() => onPalette(palette)}><div className="ve-palette-swatches" aria-hidden="true">{[palette.primary,palette.secondary,palette.accent].map((color,index) => <span key={index} style={{ background: color }} />)}</div><strong>{palette.name}</strong><small>Usar esta paleta</small></button>)}<button type="button" onClick={onReset}>Colores del diseño original ↺</button></div></div>;
}
