/** Small advisory check, not an automatic replacement of the chosen palette. */
export function contrastRatio(foreground: string, background: string): number | null {
  const luminance = (value: string) => {
    if (!/^#([\da-f]{3}|[\da-f]{6})$/i.test(value)) return null;
    const hex = value.slice(1).length === 3 ? value.slice(1).split('').map(c => c+c).join('') : value.slice(1);
    const rgb = [0,2,4].map(i => parseInt(hex.slice(i,i+2),16)/255).map(c => c <= .04045 ? c/12.92 : ((c+.055)/1.055)**2.4);
    return rgb[0]*.2126 + rgb[1]*.7152 + rgb[2]*.0722;
  };
  const a = luminance(foreground), b = luminance(background);
  return a === null || b === null ? null : (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
}
