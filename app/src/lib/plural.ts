/** English counts: "1 day", "2 days", "0 days". The caller passes both forms, so irregular nouns work too. */
export function plural(n: number, one: string, other: string): string {
  return `${n} ${Math.abs(n) === 1 ? one : other}`;
}
