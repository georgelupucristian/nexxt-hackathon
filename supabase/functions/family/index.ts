// family: the student invites a parent (a link with a token) or revokes one.
import { admin, appUrl, caller, cors, fail, json } from '../_shared/env.ts';
import { lei, MSG } from '../_shared/billing.ts';

const MIN_CAP = 1_000;
const MAX_CAP = 500_000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const user = await caller(req);
  if (!user) return fail(MSG.auth, 401);
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    // handled below as an unknown action
  }
  try {
    if (body.action === 'create') {
      const parentName = String(body.parent_name ?? '').trim();
      const num = Number(body.ratio_num ?? 1);
      const den = Number(body.ratio_den ?? 1);
      const cap = Number(body.monthly_cap_bani ?? 15_000);
      if (!parentName || parentName.length > 40) return fail('Add a name for your parent, up to 40 characters.');
      if (![num, den].every((x) => Number.isInteger(x) && x >= 1 && x <= 4)) return fail('The ratio has to be between 1:4 and 4:1.');
      if (!Number.isInteger(cap) || cap < MIN_CAP || cap > MAX_CAP) {
        return fail(`The monthly limit has to be between ${lei(MIN_CAP)} and ${lei(MAX_CAP)} lei.`);
      }
      const { data, error } = await admin
        .from('parent_links')
        .insert({ student_user_id: user.id, parent_name: parentName, ratio_num: num, ratio_den: den, monthly_cap_bani: cap })
        .select('id, token')
        .single();
      if (error) throw error;
      return json({ id: data.id, token: data.token, url: `${appUrl(req)}/p/${data.token}` });
    }

    if (body.action === 'revoke') {
      const id = String(body.id ?? '');
      if (!/^[0-9a-f-]{36}$/i.test(id)) return fail("We couldn't find this invite.", 404);
      const { data, error } = await admin
        .from('parent_links')
        .update({ status: 'revoked', revoked_at: new Date().toISOString() })
        .eq('id', id)
        .eq('student_user_id', user.id)
        .select('id');
      if (error) throw error;
      if (!data?.length) return fail("We couldn't find this invite.", 404);
      return json({ ok: true });
    }

    return fail(MSG.unknownAction);
  } catch (e) {
    console.error('[family] failed:', e);
    return fail(MSG.generic, 500);
  }
});
