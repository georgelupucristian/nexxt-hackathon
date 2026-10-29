// Where Stripe Checkout sends people back: our own app's address, never someone else's.
import { assertEquals } from 'jsr:@std/assert@1.0.14';
import { FALLBACK_APP_URL, returnUrl, webUrl } from './urls.ts';

const APP = 'https://kip.example';

Deno.test('the caller wins when it is localhost, 127.0.0.1 or a Vercel preview', () => {
  assertEquals(returnUrl('http://localhost:5173', APP), 'http://localhost:5173');
  assertEquals(returnUrl('http://localhost:4173', APP), 'http://localhost:4173');
  assertEquals(returnUrl('http://127.0.0.1:5173', APP), 'http://127.0.0.1:5173');
  assertEquals(returnUrl('https://kip-git-feat-avansul-team.vercel.app', APP), 'https://kip-git-feat-avansul-team.vercel.app');
});

Deno.test('the caller wins when it is the configured app itself', () => {
  assertEquals(returnUrl('https://kip.example', APP), APP);
});

Deno.test('a foreign origin is ignored', () => {
  assertEquals(returnUrl('https://evil.example', APP), APP);
  assertEquals(returnUrl('https://localhost.evil.example', APP), APP);
  assertEquals(returnUrl('https://vercel.app.evil.example', APP), APP);
  assertEquals(returnUrl('https://evilvercel.app', APP), APP);
  assertEquals(returnUrl('https://vercel.app', APP), APP);
});

Deno.test('an origin that is not http(s) is ignored', () => {
  assertEquals(returnUrl('null', APP), APP); // sandboxed iframes send the string "null"
  assertEquals(returnUrl('javascript:alert(1)', APP), APP);
  assertEquals(returnUrl('file:///etc/passwd', APP), APP);
  assertEquals(returnUrl('', APP), APP);
  assertEquals(returnUrl(null, APP), APP);
});

Deno.test('with no usable APP_URL the caller still wins if it is ours, else the dev address', () => {
  assertEquals(returnUrl('http://localhost:5174', null), 'http://localhost:5174');
  assertEquals(returnUrl('https://evil.example', null), FALLBACK_APP_URL);
  assertEquals(returnUrl(null, null), FALLBACK_APP_URL);
});

Deno.test('a bad APP_URL is not a URL Stripe would accept, so it is dropped', () => {
  assertEquals(webUrl('localhost:5173'), null); // no scheme: URL parses it as protocol "localhost:"
  assertEquals(webUrl('kip.example'), null);
  assertEquals(webUrl('ftp://kip.example'), null);
  assertEquals(webUrl('   '), null);
  assertEquals(webUrl(undefined), null);
  assertEquals(returnUrl('https://evil.example', webUrl('localhost:5173')), FALLBACK_APP_URL);
});

Deno.test('APP_URL is cleaned: spaces and the trailing slash go, a path stays', () => {
  assertEquals(webUrl(' https://kip.example/ '), 'https://kip.example');
  assertEquals(webUrl('https://kip.example/app/'), 'https://kip.example/app');
  assertEquals(webUrl('https://kip.example/?x=1#y'), 'https://kip.example');
});
