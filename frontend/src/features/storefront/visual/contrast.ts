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

/** Composite supported hex alpha colors over the actual store surface. */
export function institutionalTextColor(background: string, surface = '#ffffff'): string {
  const rgb = (value: string): number[] | null => {
    if (!/^#[\da-f]{3,8}$/i.test(value) || ![4,5,7,9].includes(value.length)) return null;
    let hex = value.slice(1);
    if (hex.length <= 4) hex = hex.split('').map(c => c+c).join('');
    return [0,2,4].map(i => parseInt(hex.slice(i,i+2),16)).concat(hex.length === 8 ? parseInt(hex.slice(6,8),16)/255 : 1);
  };
  const base = rgb(surface) ?? [255,255,255,1];
  const front = rgb(background) ?? [...base.slice(0,3),0];
  const color = '#' + front.slice(0,3).map((channel,i) => Math.round(channel*front[3]+base[i]*(1-front[3])).toString(16).padStart(2,'0')).join('');
  return (contrastRatio('#ffffff',color) ?? 0) >= (contrastRatio('#000000',color) ?? 0) ? '#ffffff' : '#000000';
}
