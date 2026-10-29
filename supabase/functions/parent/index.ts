// parent: public, token-based page for a parent (no account). They see the goal, save a card
// once, and can stop matching at any time. verify_jwt is off for this function (config.toml).
import { admin, appUrl, cors, fail, json, stripe } from '../_shared/env.ts';
import { loadProfile, MSG, primaryGoal, rpc, simToday } from '../_shared/billing.ts';

const GONE = "This link isn't valid anymore. Ask them for a new one.";

interface Link {
  id: string;
  student_user_id: string;
  token: string;
  parent_name: string | null;
  ratio_num: number;
  ratio_den: number;
  monthly_cap_bani: number;
  stripe_customer_id: string | null;
  payment_method_id: string | null;
  status: 'pending' | 'active' | 'revoked';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    // handled below
  }
  try {
    const token = String(body.token ?? '');
    if (!token || token.length > 64) return fail(GONE, 404);
    const { data: link, error } = await admin.from('parent_links').select('*').eq('token', token).maybeSingle();
    if (error) throw error;
    if (!link) return fail(GONE, 404);

    switch (body.action) {
      case 'get':
        return await get(link as Link);
      case 'setup':
        return await setup(link as Link, appUrl(req));
      case 'stop':
        return await stop(link as Link);
      default:
        return fail(MSG.unknownAction);
    }
  } catch (e) {
    console.error('[parent] failed:', e);
    return fail(MSG.generic, 500);
  }
});

async function get(link: Link): Promise<Response> {
  const student = await loadProfile(link.student_user_id);
  if (!student) return fail(GONE, 404);
  const goal = await primaryGoal(link.student_user_id);
  const { data: bal } = await admin.from('balances').select('in_avans_bani').eq('user_id', link.student_user_id).maybeSingle();
  const matched = await rpc<number>('matched_this_month', { p_user: link.student_user_id, p_month: simToday(student) });
  return json({
    student_first_name: student.first_name,
    goal_name: goal?.name ?? null,
    in_avans_bani: Number(bal?.in_avans_bani ?? 0),
    target_bani: goal ? Number(goal.target_bani) : null,
    ratio_num: link.ratio_num,
    ratio_den: link.ratio_den,
    monthly_cap_bani: link.monthly_cap_bani,
    status: link.status,
    parent_name: link.parent_name,
    matched_this_month_bani: Number(matched ?? 0),
  });
}

/** Checkout in setup mode: saves the parent's card for later off-session matches. */
async function setup(link: Link, back: string): Promise<Response> {
  if (link.status === 'revoked') return fail(GONE, 410);
  let customerId = link.stripe_customer_id;
  if (!customerId) {
    const c = await stripe.customers.create({
      name: link.parent_name ?? undefined,
      preferred_locales: ['en'],
      metadata: { role: 'parent', parent_link_id: link.id, student_user_id: link.student_user_id },
    });
    customerId = c.id;
    const { error } = await admin.from('parent_links').update({ stripe_customer_id: customerId }).eq('id', link.id);
    if (error) throw error;
  }
  const session = await stripe.checkout.sessions.create({
    mode: 'setup',
    customer: customerId,
    payment_method_types: ['card'],
    metadata: { type: 'parent_setup', parent_link_id: link.id },
    setup_intent_data: { metadata: { type: 'parent_setup', parent_link_id: link.id } },
    locale: 'en',
    success_url: `${back}/p/${link.token}?setup=success`,
    cancel_url: `${back}/p/${link.token}`,
  });
  return json({ url: session.url });
}

/** Stops matching immediately. Money already matched stays in the goal. */
async function stop(link: Link): Promise<Response> {
  if (link.status !== 'revoked') {
    const { error } = await admin
      .from('parent_links')
      .update({ status: 'revoked', revoked_at: new Date().toISOString() })
      .eq('id', link.id);
    if (error) throw error;
  }
  return json({ ok: true });
}
