export function uid(prefix = ''): string {
  const rand = crypto.getRandomValues(new Uint32Array(2));
  return `${prefix}${Date.now().toString(36)}${rand[0].toString(36)}${rand[1].toString(36)}`;
}
