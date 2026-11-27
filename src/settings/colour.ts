/**
 * Colour maths for the colour picker (docs/customization-roadmap.md, C4).
 * Channels r, g, b are 0 to 255, alpha 0 to 1, hue 0 to 360 and the rest 0 to 1.
 * The picker keeps HSV as floats while a handle moves and only rounds when it
 * writes hex, so a hex value read into the picker comes back unchanged.
 */
export type Rgba = { r: number; g: number; b: number; a: number };
export type Hsv = { h: number; s: number; v: number };
export type Hsl = { h: number; s: number; l: number };

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** #rgb, #rrggbb or #rrggbbaa; null for anything else. */
export function parseHex(value: string): Rgba | null {
  const match = HEX.exec(value.trim());
  if (!match) return null;
  let digits = match[1];
  if (digits.length === 3) digits = digits.replace(/./g, (c) => c + c);
  const byte = (i: number) => Number.parseInt(digits.slice(i, i + 2), 16);
  return { r: byte(0), g: byte(2), b: byte(4), a: digits.length === 8 ? byte(6) / 255 : 1 };
}

const clampByte = (value: number) => Math.min(255, Math.max(0, Math.round(value)));
const hex2 = (value: number) => clampByte(value).toString(16).padStart(2, "0");

/** Lower-case #rrggbb, or #rrggbbaa when the colour is not fully opaque. */
export function toHex({ r, g, b, a }: Rgba): string {
  const alpha = Math.round(Math.min(1, Math.max(0, a)) * 255);
  return `#${hex2(r)}${hex2(g)}${hex2(b)}${alpha === 255 ? "" : hex2(alpha)}`;
}

/** A stored colour in its one spelling (#rrggbb or #rrggbbaa), or null. */
export function normalizeHex(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const rgba = parseHex(value);
  return rgba ? toHex(rgba) : null;
}

export function rgbToHsv({ r, g, b }: Pick<Rgba, "r" | "g" | "b">): Hsv {
  const [rr, gg, bb] = [r / 255, g / 255, b / 255];
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const d = max - min;
  return { h: hueOf(rr, gg, bb, max, d), s: max === 0 ? 0 : d / max, v: max };
}

export function hsvToRgb({ h, s, v }: Hsv): Pick<Rgba, "r" | "g" | "b"> {
  const f = (n: number) => {
    const k = (n + wrapHue(h) / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return { r: f(5) * 255, g: f(3) * 255, b: f(1) * 255 };
}

export function rgbToHsl({ r, g, b }: Pick<Rgba, "r" | "g" | "b">): Hsl {
  const [rr, gg, bb] = [r / 255, g / 255, b / 255];
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const d = max - min;
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { h: hueOf(rr, gg, bb, max, d), s, l };
}

export function hslToRgb({ h, s, l }: Hsl): Pick<Rgba, "r" | "g" | "b"> {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + wrapHue(h) / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return { r: f(0) * 255, g: f(8) * 255, b: f(4) * 255 };
}

function wrapHue(h: number): number {
  return ((h % 360) + 360) % 360;
}

function hueOf(r: number, g: number, b: number, max: number, d: number): number {
  if (d === 0) return 0;
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return wrapHue(h * 60);
}

/** The hex the picker writes for an HSV position and an alpha. */
export function hsvToHex(hsv: Hsv, a = 1): string {
  return toHex({ ...hsvToRgb(hsv), a });
}

export function hexToHsv(hex: string): (Hsv & { a: number }) | null {
  const rgba = parseHex(hex);
  return rgba ? { ...rgbToHsv(rgba), a: rgba.a } : null;
}
