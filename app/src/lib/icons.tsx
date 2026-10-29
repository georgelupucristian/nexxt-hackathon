// The app's single icon set: Phosphor, exposed under the names the code already used so screens
// don't need rewriting. Objects (flame, bell, coins, goals) use Phosphor's duotone weight: a solid
// shape with a soft tinted fill, which reads as drawn rather than as a thin generated outline.
// Controls (arrows, chevrons, ticks, plus, close) stay bold and single-colour so they read instantly.
import * as P from '@phosphor-icons/react';
import type { Icon as PhIcon, IconWeight } from '@phosphor-icons/react';
import type { CSSProperties, FC } from 'react';

export interface IconProps {
  size?: number | string;
  /** kept for the old API; Phosphor draws weight by style, so heavier strokes pick "bold" */
  strokeWidth?: number;
  weight?: IconWeight;
  color?: string;
  className?: string;
  style?: CSSProperties;
  'aria-hidden'?: boolean | 'true' | 'false';
  'aria-label'?: string;
}
export type LucideIcon = FC<IconProps>;

const make = (Icon: PhIcon, base: IconWeight = 'duotone'): LucideIcon => {
  const C: LucideIcon = ({ size = 20, strokeWidth, weight, color = 'currentColor', ...rest }) => (
    <Icon size={size} weight={weight ?? (strokeWidth && strokeWidth >= 2.6 ? 'bold' : base)} color={color} {...rest} />
  );
  return C;
};
// controls: one colour, bold
const ctl = (Icon: PhIcon) => make(Icon, 'bold');

export const AlertCircle = make(P.WarningCircle);
export const Archive = make(P.Archive);
export const ArchiveRestore = make(P.BoxArrowUp);
export const ArrowDownLeft = ctl(P.ArrowDownLeft);
export const ArrowLeft = ctl(P.ArrowLeft);
export const ArrowRight = ctl(P.ArrowRight);
export const ArrowUpRight = ctl(P.ArrowUpRight);
export const ArrowDown = ctl(P.ArrowDown);
export const ArrowUp = ctl(P.ArrowUp);
export const Bell = make(P.Bell);
export const BellOff = make(P.BellSlash);
export const CalendarCheck = make(P.CalendarCheck);
export const CalendarClock = make(P.CalendarBlank);
export const Check = ctl(P.Check);
export const CheckCircle2 = make(P.CheckCircle);
export const CircleCheck = CheckCircle2;
export const ChevronDown = ctl(P.CaretDown);
export const ChevronRight = ctl(P.CaretRight);
export const Clock = make(P.Clock);
export const Compass = make(P.Compass);
export const Eye = make(P.Eye);
export const EyeOff = make(P.EyeSlash);
export const Flag = make(P.Flag);
export const Flame = make(P.Fire, 'fill');
export const FlaskConical = make(P.TestTube);
export const HardDrive = make(P.HardDrives);
export const Home = make(P.House);
export const Info = make(P.Info);
export const LineChart = make(P.ChartLineUp);
export const ListOrdered = make(P.ListBullets);
export const Lock = make(P.LockSimple);
export const Minus = ctl(P.Minus);
export const MoreHorizontal = ctl(P.DotsThree);
export const PartyPopper = make(P.Confetti);
export const Pause = make(P.Pause);
export const Pencil = make(P.PencilSimple);
export const PenLine = make(P.PencilSimpleLine);
export const PiggyBank = make(P.PiggyBank);
export const Play = make(P.Play, 'fill');
export const Plus = ctl(P.Plus);
export const RefreshCw = ctl(P.ArrowsClockwise);
export const SlidersHorizontal = make(P.SlidersHorizontal);
export const Star = make(P.Star);
export const Target = make(P.Target);
export const Trash2 = make(P.Trash);
export const TrendingUp = make(P.TrendUp);
export const Unplug = make(P.LinkBreak);
export const User = make(P.User);
export const WifiOff = make(P.WifiSlash);
export const X = ctl(P.X);
export const XCircle = make(P.XCircle);
export const Laptop = make(P.Laptop);
export const Plane = make(P.AirplaneTakeoff);
export const LifeBuoy = make(P.Lifebuoy);
export const Coins = make(P.Coins);
export const Wallet = make(P.Wallet);
export const Sparkles = make(P.Sparkle);
export const Moon = make(P.Moon);
export const Trophy = make(P.Trophy);
export const Sprout = make(P.Plant);
export const Gift = make(P.Gift);
export const KeyRound = make(P.Key);
export const DoorOpen = make(P.Door);
export const Settings = make(P.Gear);
export const Hourglass = make(P.Hourglass);
export const Hand = make(P.Hand);
export const LogOut = make(P.SignOut);
export const BarChart3 = make(P.ChartBar);
export const CalendarDays = make(P.CalendarBlank);
export const UserRound = make(P.User);
export const ShieldCheck = make(P.ShieldCheck);
export const BookOpen = make(P.BookOpen);
export const LifeBuoyHelp = make(P.Headset);
export const Accessibility = make(P.PersonArmsSpread);
export const Link2 = make(P.LinkSimple);
export const Download = make(P.Download);
export const Question = make(P.Question);
// money in and out: a hand putting a coin in, a hand taking one out
export const Deposit = make(P.HandDeposit);
export const Withdraw = make(P.HandWithdraw);
export const ArrowCounterClockwise = ctl(P.ArrowCounterClockwise);
// sign-up: ages, where money comes from, notifications, the phone and the device unlock
export const Backpack = make(P.Backpack);
export const GraduationCap = make(P.GraduationCap);
export const Briefcase = make(P.Briefcase);
export const Family = make(P.UsersThree);
export const Lightning = make(P.Lightning);
export const Shuffle = make(P.Shuffle);
export const Phone = make(P.DeviceMobile);
export const Fingerprint = make(P.Fingerprint);
// friends, colonies and shared goals
export const Users = make(P.UsersThree);
export const UserPlus = make(P.UserPlus);
export const UserMinus = make(P.UserMinus);
export const Search = ctl(P.MagnifyingGlass);
export const Share = make(P.ShareNetwork);
export const Copy = make(P.Copy);
export const Ban = make(P.Prohibit);
export const HandHeart = make(P.HandHeart);
export const Coffee = make(P.Coffee);
export const Camera = make(P.Camera);
export const ChatText = make(P.ChatText);
export const WhatsApp = make(P.WhatsappLogo);
export const AddressBook = make(P.AddressBook);
export const Megaphone = make(P.HandsClapping);
export const SortIcon = ctl(P.ArrowsDownUp);
export const Circle = make(P.Circle);
export const Binoculars = make(P.Binoculars);
export const SignOutIcon = make(P.SignOut);
export const ImageIcon = make(P.ImageSquare);
