import { motion } from 'motion/react';
import { Sheet, useToast } from './ui';
import { useStore } from '../data/store';
import type { Goal } from '../data/types';
import { goalLook, goalVars } from '../lib/goalLook';
import { GOAL_ICONS, goalIconKey } from '../lib/goalIcons';

/** A grid of icons to pick from for a goal; tapping one saves it straight away. */
export function GoalIconPicker({ goal, open, onClose }: { goal: Goal; open: boolean; onClose: () => void }) {
  const { updateGoal } = useStore();
  const toast = useToast();
  const current = goalIconKey(goal);
  const look = goalVars(goalLook(goal));

  return (
    <Sheet open={open} onClose={onClose} title="Pick an icon">
      <div className="iconpick" role="radiogroup" aria-label={`Icon for ${goal.name}`} style={look}>
        {Object.entries(GOAL_ICONS).map(([key, { label, Icon }]) => (
          <motion.button
            key={key}
            type="button"
            role="radio"
            aria-checked={key === current}
            aria-label={label}
            className="iconpick__item"
            whileTap={{ scale: 0.9 }}
            onClick={() => {
              updateGoal(goal.id, { icon: key });
              toast(`Icon is now: ${label.toLowerCase()}.`);
              onClose();
            }}
          >
            <span className="iconpick__tile">
              <Icon size={26} weight="duotone" />
            </span>
            <span className="iconpick__label">{label}</span>
          </motion.button>
        ))}
      </div>
    </Sheet>
  );
}
