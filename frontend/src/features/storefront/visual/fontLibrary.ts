export const WEB_FONTS = {
  inter: ['Inter', 'Sans serif'], roboto: ['Roboto', 'Sans serif'], openSans: ['Open Sans', 'Sans serif'], lato: ['Lato', 'Sans serif'],
  montserrat: ['Montserrat', 'Sans serif'], poppins: ['Poppins', 'Sans serif'], nunito: ['Nunito', 'Sans serif'], raleway: ['Raleway', 'Sans serif'],
  merriweather: ['Merriweather', 'Serif'], playfair: ['Playfair Display', 'Serif'], libreBaskerville: ['Libre Baskerville', 'Serif'],
  oswald: ['Oswald', 'Display'], sourceSans: ['Source Sans 3', 'Sans serif'], workSans: ['Work Sans', 'Sans serif'], rubik: ['Rubik', 'Sans serif'],
  manrope: ['Manrope', 'Sans serif'], archivo: ['Archivo', 'Sans serif'], ubuntu: ['Ubuntu', 'Sans serif'], ptSans: ['PT Sans', 'Sans serif'],
  dmSans: ['DM Sans', 'Sans serif'], lora: ['Lora', 'Serif'], cormorant: ['Cormorant Garamond', 'Serif'], bitter: ['Bitter', 'Serif'],
  barlow: ['Barlow', 'Sans serif'], quicksand: ['Quicksand', 'Sans serif'], bebasNeue: ['Bebas Neue', 'Display'],
  dancingScript: ['Dancing Script', 'Manuscrita'], caveat: ['Caveat', 'Manuscrita'], pacifico: ['Pacifico', 'Manuscrita'],
  firaCode: ['Fira Code', 'Monoespaciada'], spaceMono: ['Space Mono', 'Monoespaciada'], inconsolata: ['Inconsolata', 'Monoespaciada'],
} as const;
export type WebFont = keyof typeof WEB_FONTS;
export const webFontStack = (key: WebFont) => `"${WEB_FONTS[key][0]}", ${WEB_FONTS[key][1] === 'Serif' ? 'Georgia, serif' : WEB_FONTS[key][1] === 'Monoespaciada' ? 'monospace' : 'sans-serif'}`;

/** One stylesheet per requested family and document. No catalog-wide downloads. */
export function loadFont(key: string, doc: Document) {
  const family = key === 'sans' ? 'Plus Jakarta Sans' : key === 'serif' ? 'DM Serif Display' : WEB_FONTS[key as WebFont]?.[0];
  if (!family || doc.querySelector(`link[data-openmind-font="${key}"]`)) return;
  const link = doc.createElement('link');
  link.rel = 'stylesheet'; link.dataset.openmindFont = key;
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}&display=swap`;
  link.addEventListener('error', () => link.remove(), {once:true});
  doc.head.appendChild(link);
}

export function loadVisualFonts(config: import('./types').VisualConfig, doc: Document) {
  const keys = new Set([config.global.typography.body, config.global.typography.heading]);
  for (const device of ['tablet', 'mobile'] as const) {
    const typography = config.responsive[device].global?.typography;
    if (typography?.body) keys.add(typography.body);
    if (typography?.heading) keys.add(typography.heading);
  }
  keys.forEach(key => loadFont(key, doc));
}
