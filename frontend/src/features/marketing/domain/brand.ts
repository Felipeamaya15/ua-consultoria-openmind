import type { MarketingPalette } from './types';

function solidColor(value: string, fallback: string): string {
  if (!/^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.test(value)) return fallback;
  let hex = value.slice(1);
  if (hex.length <= 4) hex = [...hex].map(c => c + c).join('');
  const alpha = hex.length === 8 ? parseInt(hex.slice(6), 16) / 255 : 1;
  return '#' + [0, 2, 4].map(i => Math.round(parseInt(hex.slice(i, i + 2), 16) * alpha + 255 * (1 - alpha)).toString(16).padStart(2, '0')).join('');
}
export function foregroundFor(hex: string): string {
  const channels = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  const luminance = .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
  return (luminance + .05) / .05 >= 1.05 / (luminance + .05) ? '#000000' : '#ffffff';
}
export function marketingPalette(primary: string, secondary: string): MarketingPalette {
  const main = solidColor(primary, '#1a3a6b'), support = solidColor(secondary, '#eef1f8');
  return { primary: main, secondary: support, onPrimary: foregroundFor(main), onSecondary: foregroundFor(support) };
}
