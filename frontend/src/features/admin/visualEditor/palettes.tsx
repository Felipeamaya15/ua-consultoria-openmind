export const EDITOR_PALETTES = [
  { name: 'Océano', primary: '#2563eb', secondary: '#eff6ff', accent: '#0ea5e9' },
  { name: 'Bosque', primary: '#15803d', secondary: '#f0fdf4', accent: '#84cc16' },
  { name: 'Ciruela', primary: '#7e22ce', secondary: '#faf5ff', accent: '#d946ef' },
  { name: 'Grafito', primary: '#1f2937', secondary: '#f3f4f6', accent: '#f97316' },
] as const;
export const PALETTE_PATHS = ['global.colors.primary','global.colors.secondary','global.colors.accent','global.colors.background','global.colors.text','global.colors.surface','global.colors.border','header.background','header.textColor','topBar.background','footer.background','footer.textColor'] as const;
export function paletteEdits(palette: typeof EDITOR_PALETTES[number]): Record<typeof PALETTE_PATHS[number], string> {
  return { 'global.colors.primary': palette.primary, 'global.colors.secondary': palette.secondary, 'global.colors.accent': palette.accent, 'global.colors.background': palette.secondary, 'global.colors.text': '#0f1623', 'global.colors.surface': '#ffffff', 'global.colors.border': palette.secondary, 'header.background': '#ffffff', 'header.textColor': '#0f1623', 'topBar.background': palette.primary, 'footer.background': palette.primary, 'footer.textColor': '#ffffff' };
}
export function PaletteControl({ onPalette, onReset }: { onPalette: (palette: typeof EDITOR_PALETTES[number]) => void; onReset: () => void }) {
  return <div className="ve-control"><strong>Encuentra tus colores</strong><p className="ve-hint">Paletas coordinadas para toda tu tienda. Después puedes personalizar cada color.</p><div className="ve-palettes">{EDITOR_PALETTES.map(palette => <button type="button" key={palette.name} aria-label={`Usar esta paleta: ${palette.name}`} onClick={() => onPalette(palette)}><div className="ve-palette-swatches" aria-hidden="true">{[palette.primary,palette.secondary,palette.accent].map((color,index) => <span key={index} style={{ background: color }} />)}</div><strong>{palette.name}</strong><small>Usar esta paleta</small></button>)}<button type="button" onClick={onReset}>Colores del diseño original ↺</button></div></div>;
}
