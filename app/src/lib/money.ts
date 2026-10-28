import type { Bani } from '../data/types';

const fmt = new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtWhole = new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 0 });

/** 42050 -> "420,50 lei". Whole amounts drop the decimals to keep figures calm. */
export function formatLei(b: Bani, opts: { sign?: boolean; forceDecimals?: boolean } = {}): string {
  const abs = Math.abs(b);
  const body = abs % 100 === 0 && !opts.forceDecimals ? fmtWhole.format(abs / 100) : fmt.format(abs / 100);
  const sign = b < 0 ? '−' : opts.sign && b > 0 ? '+' : '';
  return `${sign}${body} lei`;
}

/** Split for display: big integer part, small decimals. */
export function splitLei(b: Bani): { int: string; dec: string } {
  const abs = Math.abs(b);
  return { int: fmtWhole.format(Math.floor(abs / 100)), dec: String(abs % 100).padStart(2, '0') };
}

/** Parse user input ("1.250,5", "1250.50", "1250") into bani. Returns null when not a valid amount. */
export function parseLei(raw: string): Bani | null {
  const s = raw.trim().replace(/\s|lei/gi, '');
  if (!s) return null;
  let norm = s;
  // Accept both "1.250,50" (ro) and "1,250.50" / "1250.50" (en).
  if (norm.includes(',') && norm.includes('.')) {
    norm = norm.lastIndexOf(',') > norm.lastIndexOf('.') ? norm.replace(/\./g, '').replace(',', '.') : norm.replace(/,/g, '');
  } else if (norm.includes(',')) {
    norm = norm.replace(',', '.');
  }
  if (!/^\d+(\.\d{0,2})?$/.test(norm)) return null;
  const value = Math.round(parseFloat(norm) * 100);
  return Number.isFinite(value) ? value : null;
}

export const MAX_AMOUNT: Bani = 10_000_000_00; // 10 million lei — anything above is almost certainly a typo
