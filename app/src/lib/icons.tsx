// The app's single icon set: Hugeicons (stroke-rounded), exposed under the names the code already
// used so screens didn't need rewriting. Rounded terminals and slightly softer geometry give Kept
// its own look instead of the default line icons every generated UI ships with.
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import * as H from '@hugeicons/core-free-icons';
import type { CSSProperties, FC } from 'react';

export interface IconProps {
  size?: number | string;
  strokeWidth?: number;
  color?: string;
  className?: string;
  style?: CSSProperties;
  'aria-hidden'?: boolean | 'true' | 'false';
  'aria-label'?: string;
}
export type LucideIcon = FC<IconProps>;

const make = (icon: IconSvgElement): LucideIcon => {
  const C: LucideIcon = ({ size = 20, strokeWidth = 1.8, color = 'currentColor', ...rest }) => (
    <HugeiconsIcon icon={icon} size={size} strokeWidth={strokeWidth} color={color} {...rest} />
  );
  return C;
};

export const AlertCircle = make(H.Alert02Icon);
export const Archive = make(H.Archive03Icon);
export const ArchiveRestore = make(H.ArchiveRestoreIcon);
export const ArrowDownLeft = make(H.ArrowDownLeft01Icon);
export const ArrowLeft = make(H.ArrowLeft01Icon);
export const ArrowRight = make(H.ArrowRight01Icon);
export const ArrowUpRight = make(H.ArrowUpRight01Icon);
export const Bell = make(H.Notification03Icon);
export const BellOff = make(H.NotificationOff03Icon);
export const CalendarCheck = make(H.CalendarCheckIn01Icon);
export const CalendarClock = make(H.Calendar03Icon);
export const Check = make(H.Tick02Icon);
export const CheckCircle2 = make(H.CheckmarkCircle02Icon);
export const CircleCheck = CheckCircle2;
export const ChevronDown = make(H.ArrowDown01Icon);
export const ChevronRight = make(H.ArrowRight01Icon);
export const Clock = make(H.Clock01Icon);
export const Compass = make(H.Compass01Icon);
export const Eye = make(H.ViewIcon);
export const EyeOff = make(H.ViewOffSlashIcon);
export const Flag = make(H.Flag02Icon);
export const Flame = make(H.Fire03Icon);
export const FlaskConical = make(H.TestTube01Icon);
export const HardDrive = make(H.HardDriveIcon);
export const Home = make(H.Home01Icon);
export const Info = make(H.InformationCircleIcon);
export const LineChart = make(H.ChartLineData01Icon);
export const ListOrdered = make(H.LeftToRightListBulletIcon);
export const Lock = make(H.SquareLock02Icon);
export const Minus = make(H.MinusSignIcon);
export const MoreHorizontal = make(H.MoreHorizontalIcon);
export const PartyPopper = make(H.PartyIcon);
export const Pause = make(H.PauseIcon);
export const Pencil = make(H.Edit02Icon);
export const PenLine = make(H.PencilEdit02Icon);
export const PiggyBank = make(H.PiggyBankIcon);
export const Play = make(H.PlayIcon);
export const Plus = make(H.Add01Icon);
export const RefreshCw = make(H.Refresh01Icon);
export const SlidersHorizontal = make(H.SlidersHorizontalIcon);
export const Star = make(H.StarIcon);
export const Target = make(H.Target02Icon);
export const Trash2 = make(H.Delete02Icon);
export const TrendingUp = make(H.ChartIncreaseIcon);
export const Unplug = make(H.Unlink01Icon);
export const User = make(H.UserIcon);
export const WifiOff = make(H.WifiOff01Icon);
export const X = make(H.Cancel01Icon);
export const XCircle = make(H.CancelCircleIcon);
// used by goal glyphs and section icons
export const Laptop = make(H.LaptopIcon);
export const Plane = make(H.AirplaneTakeOff01Icon);
export const LifeBuoy = make(H.LifebuoyIcon);
export const Coins = make(H.Coins01Icon);
export const Wallet = make(H.Wallet01Icon);
export const Sparkles = make(H.SparklesIcon);
export const Moon = make(H.Moon02Icon);
export const Sprout = make(H.Plant02Icon);
export const Gift = make(H.GiftIcon);
export const KeyRound = make(H.Key01Icon);
export const DoorOpen = make(H.Door01Icon);
export const Settings = make(H.Settings02Icon);
export const Hourglass = make(H.HourglassIcon);
export const Hand = make(H.Hand);
export const LogOut = make(H.Logout03Icon);
export const BarChart3 = make(H.ChartIncreaseIcon);
export const CalendarDays = make(H.Calendar03Icon);
export const UserRound = make(H.UserIcon);
export const ShieldCheck = make(H.Shield01Icon);
export const BookOpen = make(H.BookOpen01Icon);
export const LifeBuoyHelp = make(H.CustomerSupportIcon);
export const Accessibility = make(H.AccessIcon);
export const Link2 = make(H.Link01Icon);
export const Download = make(H.Download04Icon);
