// Goal icons: every goal gets a Phosphor icon (duotone) that the student can change from a grid.
// The choice is stored on the goal (`goal.icon`, a key from GOAL_ICONS); without one, the goal's
// kind picks a sensible default.
import * as P from '@phosphor-icons/react';
import type { Icon as PhIcon } from '@phosphor-icons/react';
import type { Goal, GoalKind } from '../data/types';

export const GOAL_ICONS: Record<string, { label: string; Icon: PhIcon }> = {
  laptop: { label: 'Laptop', Icon: P.Laptop },
  phone: { label: 'Phone', Icon: P.DeviceMobile },
  headphones: { label: 'Headphones', Icon: P.Headphones },
  game: { label: 'Gaming', Icon: P.GameController },
  camera: { label: 'Camera', Icon: P.Camera },
  watch: { label: 'Watch', Icon: P.Watch },
  plane: { label: 'Travel', Icon: P.AirplaneTilt },
  train: { label: 'Train', Icon: P.Train },
  car: { label: 'Car', Icon: P.Car },
  bike: { label: 'Bike', Icon: P.Bicycle },
  scooter: { label: 'Scooter', Icon: P.Scooter },
  globe: { label: 'Erasmus', Icon: P.GlobeHemisphereEast },
  mountain: { label: 'Mountains', Icon: P.Mountains },
  tent: { label: 'Camping', Icon: P.Tent },
  beach: { label: 'Holiday', Icon: P.Umbrella },
  ticket: { label: 'Concert', Icon: P.Ticket },
  music: { label: 'Music', Icon: P.MusicNotes },
  guitar: { label: 'Guitar', Icon: P.Guitar },
  book: { label: 'Books', Icon: P.BookOpenText },
  grad: { label: 'Uni', Icon: P.GraduationCap },
  home: { label: 'Rent', Icon: P.House },
  couch: { label: 'Furniture', Icon: P.Couch },
  shirt: { label: 'Clothes', Icon: P.TShirt },
  sneaker: { label: 'Sneakers', Icon: P.Sneaker },
  gift: { label: 'Gift', Icon: P.Gift },
  heart: { label: 'Someone special', Icon: P.Heart },
  paw: { label: 'Pet', Icon: P.PawPrint },
  barbell: { label: 'Gym', Icon: P.Barbell },
  ball: { label: 'Sport', Icon: P.SoccerBall },
  palette: { label: 'Art', Icon: P.Palette },
  coffee: { label: 'Coffee', Icon: P.Coffee },
  pizza: { label: 'Food', Icon: P.Pizza },
  buoy: { label: 'Emergencies', Icon: P.Lifebuoy },
  shield: { label: 'Safety', Icon: P.ShieldCheck },
  piggy: { label: 'Savings', Icon: P.PiggyBank },
  star: { label: 'Dream', Icon: P.Star },
};

const BY_KIND: Record<GoalKind, string> = { tech: 'laptop', travel: 'plane', emergency: 'buoy', custom: 'piggy' };

export function goalIconKey(goal: Pick<Goal, 'kind'> & { icon?: string }): string {
  return goal.icon && GOAL_ICONS[goal.icon] ? goal.icon : BY_KIND[goal.kind];
}

export function GoalIcon({ goal, size = 20 }: { goal: Pick<Goal, 'kind'> & { icon?: string }; size?: number }) {
  const { Icon } = GOAL_ICONS[goalIconKey(goal)];
  return <Icon size={size} weight="duotone" aria-hidden />;
}
