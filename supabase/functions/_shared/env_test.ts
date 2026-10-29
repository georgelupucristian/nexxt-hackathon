// appUrl(req) as the deployed functions call it: env.ts reads APP_URL once when it loads, so each
// case loads a fresh copy of the module (the ?query makes it a new module) with its own APP_URL.
// The keys below are placeholders: nothing here talks to Stripe or Supabase.
import { assertEquals } from 'jsr:@std/assert@1.0.14';

Deno.env.set('STRIPE_SECRET_KEY', 'placeholder-not-a-key');
Deno.env.set('SUPABASE_URL', 'http://127.0.0.1:54321');
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'placeholder-not-a-key');

let copy = 0;
async function envWith(appUrl: string | null) {
  if (appUrl === null) Deno.env.delete('APP_URL');
  else Deno.env.set('APP_URL', appUrl);
  return await import(`./env.ts?copy=${++copy}`);
}
const from = (origin: string | null) => new Request('http://edge.local/payments', { method: 'POST', headers: origin ? { Origin: origin } : {} });

Deno.test('appUrl: the caller origin wins for localhost and *.vercel.app', async () => {
  const { appUrl } = await envWith('https://kip.example');
  assertEquals(appUrl(from('http://localhost:5173')), 'http://localhost:5173');
  assertEquals(appUrl(from('https://kip-pr-12.vercel.app')), 'https://kip-pr-12.vercel.app');
});

Deno.test('appUrl: a foreign origin, or none, gets APP_URL', async () => {
  const { appUrl } = await envWith('https://kip.example/');
  assertEquals(appUrl(from('https://evil.example')), 'https://kip.example');
  assertEquals(appUrl(from(null)), 'https://kip.example');
});

Deno.test('appUrl: a bad APP_URL falls back to the caller, then to the dev address', async () => {
  const { appUrl } = await envWith('localhost:5173');
  assertEquals(appUrl(from('http://localhost:5180')), 'http://localhost:5180');
  assertEquals(appUrl(from('https://evil.example')), 'http://localhost:5173');
});

Deno.test('appUrl: no APP_URL at all behaves like a bad one', async () => {
  const { appUrl } = await envWith(null);
  assertEquals(appUrl(from('https://evil.example')), 'http://localhost:5173');
});

Deno.test('bucharestDate is still exported from env.ts for the functions that import it there', async () => {
  const { bucharestDate } = await envWith('https://kip.example');
  assertEquals(bucharestDate(new Date('2026-10-27T22:00:00Z')), '2026-10-28');
});
