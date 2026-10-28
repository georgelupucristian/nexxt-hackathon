import { motion } from 'motion/react';
import type { GoalKind } from '../data/types';

// Microsoft Fluent 3D emoji (MIT, github.com/microsoft/fluentui-emoji), stored in public/emoji.
// They share Kip's soft 3D look, which flat line icons never did.
export type EmojiName =
  | 'laptop' | 'plane' | 'buoy' | 'target' | 'fire' | 'coin' | 'moneybag' | 'calendar' | 'calendar2' | 'bell'
  | 'chart' | 'profile' | 'pencil' | 'testtube' | 'sparkles' | 'party' | 'house' | 'seedling' | 'growth'
  | 'check' | 'hourglass' | 'gear' | 'door' | 'sleep' | 'hand' | 'gift' | 'key' | 'lock';

export const GOAL_EMOJI: Record<GoalKind, EmojiName> = {
  emergency: 'buoy',
  tech: 'laptop',
  travel: 'plane',
  custom: 'target',
};

interface Props {
  name: EmojiName;
  size?: number;
  /** gentle idle bob, so icons on the hub feel alive */
  float?: boolean;
  delay?: number;
  className?: string;
}

export function Emoji3D({ name, size = 32, float, delay = 0, className = '' }: Props) {
  const img = <img src={`/emoji/${name}.png`} width={size} height={size} alt="" aria-hidden draggable={false} className={`emoji3d ${className}`} />;
  if (!float) return img;
  return (
    <motion.span
      className="emoji3d-wrap"
      animate={{ y: [0, -3, 0], rotate: [0, -3, 0] }}
      transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut', delay }}
    >
      {img}
    </motion.span>
  );
}
