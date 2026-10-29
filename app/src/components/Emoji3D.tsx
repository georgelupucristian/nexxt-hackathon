import {
  BarChart3,
  Bell,
  CalendarCheck,
  CalendarDays,
  CircleCheck,
  Coins,
  DoorOpen,
  FlaskConical,
  Flame,
  Gift,
  Hand,
  Home,
  Hourglass,
  KeyRound,
  Laptop,
  LifeBuoy,
  Lock,
  Moon,
  PartyPopper,
  PenLine,
  Plane,
  Settings,
  Sparkles,
  Sprout,
  Target,
  TrendingUp,
  UserRound,
  Wallet,
  type LucideIcon,
} from '@/lib/icons';
import type { GoalKind } from '../data/types';

// One icon language for the whole app: Lucide line icons at a single stroke weight. (This used to
// render 3D emoji; the names stay so every call site keeps working.)
export type EmojiName =
  | 'laptop' | 'plane' | 'buoy' | 'target' | 'fire' | 'coin' | 'moneybag' | 'calendar' | 'calendar2' | 'bell'
  | 'chart' | 'profile' | 'pencil' | 'testtube' | 'sparkles' | 'party' | 'house' | 'seedling' | 'growth'
  | 'check' | 'hourglass' | 'gear' | 'door' | 'sleep' | 'hand' | 'gift' | 'key' | 'lock';

const ICONS: Record<EmojiName, LucideIcon> = {
  laptop: Laptop,
  plane: Plane,
  buoy: LifeBuoy,
  target: Target,
  fire: Flame,
  coin: Coins,
  moneybag: Wallet,
  calendar: CalendarDays,
  calendar2: CalendarCheck,
  bell: Bell,
  chart: BarChart3,
  profile: UserRound,
  pencil: PenLine,
  testtube: FlaskConical,
  sparkles: Sparkles,
  party: PartyPopper,
  house: Home,
  seedling: Sprout,
  growth: TrendingUp,
  check: CircleCheck,
  hourglass: Hourglass,
  gear: Settings,
  door: DoorOpen,
  sleep: Moon,
  hand: Hand,
  gift: Gift,
  key: KeyRound,
  lock: Lock,
};

export const GOAL_EMOJI: Record<GoalKind, EmojiName> = {
  emergency: 'buoy',
  tech: 'laptop',
  travel: 'plane',
  custom: 'target',
};

export function Emoji3D({ name, size = 32, className = '' }: { name: EmojiName; size?: number; float?: boolean; delay?: number; className?: string }) {
  const Icon = ICONS[name];
  // line icons read larger than emoji at the same box size
  return <Icon size={Math.round(size * 0.72)} strokeWidth={2} className={`glyph ${className}`} aria-hidden />;
}
