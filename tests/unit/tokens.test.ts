import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(process.cwd(), 'src/ui/styles/app.css'), 'utf8');

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`missing ${selector}`);
  const body = css.slice(start, css.indexOf('}', start));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g))
    out[m[1] as string] = (m[2] as string).toLowerCase();
  return out;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const light = block(':root');
const dark = { ...light, ...block(":root[data-theme='dark']") };

describe.each([
  ['light', light],
  ['dark', dark],
])('%s theme contrast', (_name, t) => {
  const pairs: [string, string, number][] = [
    ['ink', 'paper', 4.5],
    ['ink', 'surface', 4.5],
    ['ink', 'surface-2', 4.5],
    ['ink-muted', 'paper', 4.5],
    ['ink-muted', 'surface', 4.5],
    ['ink-muted', 'surface-2', 4.5],
    ['on-accent', 'focus', 4.5],
    ['on-accent', 'short', 4.5],
    ['on-accent', 'long', 4.5],
    ['focus', 'surface', 4.5],
    ['short', 'surface', 4.5],
    ['long', 'surface', 4.5],
    ['focus', 'focus-soft', 4.5],
    ['ink', 'focus-soft', 4.5],
    ['danger', 'surface', 4.5],
    ['paper', 'danger', 4.5],
    ['paper', 'ink', 4.5],
    ['line', 'surface', 1.2],
  ];
  it.each(pairs)('%s on %s ≥ %s:1', (fg, bg, min) => {
    const a = t[fg];
    const b = t[bg];
    expect(a, fg).toBeDefined();
    expect(b, bg).toBeDefined();
    expect(contrast(a as string, b as string)).toBeGreaterThanOrEqual(min);
  });
});
