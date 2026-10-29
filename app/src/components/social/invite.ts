// Personal invite links: kip's sign-up with the code in it. Whoever signs up through one starts
// with their 1-day Freeze, and the sender's recharges right away (rules.inviteFreezes).
import type { SocialUser } from '../../lib/social/types';
import { firstNameOf } from '../../lib/social/rules';

export const INVITE_REWARD = 'When a friend joins with your link, your 1-day Freeze recharges right away.';

export const inviteLink = (u: Pick<SocialUser, 'inviteCode'>) => `${window.location.origin}/start?invite=${encodeURIComponent(u.inviteCode)}`;

export const inviteText = (u: Pick<SocialUser, 'inviteCode' | 'name'>) =>
  `Join me on Kip. I'm saving a little at a time, and it's easier together. Sign up with my link and you start with a 1-day Freeze: ${inviteLink(u)} (${firstNameOf(u.name)})`;
