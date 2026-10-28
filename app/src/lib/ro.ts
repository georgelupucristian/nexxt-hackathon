/**
 * Romanian counts: "1 zi", "5 zile", "20 de zile", "105 zile", "120 de zile".
 * From 20 up, Romanian puts "de" between the number and the noun, unless the last two digits
 * are 01 to 19.
 */
export function plural(n: number, one: string, other: string): string {
  const abs = Math.abs(Math.trunc(n));
  if (abs === 1) return `${n} ${one}`;
  const lastTwo = abs % 100;
  const de = abs >= 20 && (lastTwo === 0 || lastTwo >= 20);
  return `${n} ${de ? 'de ' : ''}${other}`;
}
