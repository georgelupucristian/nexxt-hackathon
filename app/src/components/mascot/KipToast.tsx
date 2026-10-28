// Kip pops up from the bottom with one thing to say, then gets out of the way.
// Adapted from Watermelon UI "Inline Toast" (ui.watermelon.sh/animated-components/inline-toast):
// the blur-morph between messages, the springy action button with a hover shine, and the
// draining timer bar for messages that dismiss themselves.
import { X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { todayKey } from '../../lib/dates';
import { Seal } from './Seal';
import { POKES, type Line } from './lines';

interface Props {
  line: Line;
  /** kind of message, used so a dismissed one stays dismissed for the day */
  topic: string;
  action?: { label: string; run: () => void };
  /** informational messages leave on their own after this long */
  autoHideMs?: number;
  hidden?: boolean;
}

export function KipToast({ line, topic, action, autoHideMs = 7000, hidden }: Props) {
  const key = `kept.kip.${todayKey()}.${topic}`;
  const [open, setOpen] = useState(false);
  const [poke, setPoke] = useState(-1);
  const [hover, setHover] = useState(false);
  // Kip says hi first, then settles into the pose that fits the message
  const [greeting, setGreeting] = useState(true);

  // arrive once the hub has finished assembling, unless dismissed earlier today
  useEffect(() => {
    if (sessionStorage.getItem(key)) return;
    const t = setTimeout(() => setOpen(true), 1500);
    return () => clearTimeout(t);
  }, [key]);

  useEffect(() => {
    if (!open) return;
    setGreeting(true);
    const t = setTimeout(() => setGreeting(false), 1700);
    return () => clearTimeout(t);
  }, [open]);

  const timed = !action;
  useEffect(() => {
    if (!open || !timed || hover) return;
    const t = setTimeout(() => setOpen(false), autoHideMs);
    return () => clearTimeout(t);
  }, [open, timed, hover, autoHideMs, poke]);

  const dismiss = () => {
    sessionStorage.setItem(key, '1');
    setOpen(false);
  };

  const shown = poke >= 0 ? POKES[poke % POKES.length] : line;
  const pose = greeting && poke < 0 ? 'wave' : shown.state;

  return (
    <AnimatePresence>
      {open && !hidden && (
        <motion.div
          className="kip-toast"
          role="status"
          aria-live="polite"
          initial={{ y: 140, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 140, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 26 }}
          onHoverStart={() => setHover(true)}
          onHoverEnd={() => setHover(false)}
        >
          <motion.div layout="position" className="kip-toast__card" transition={{ type: 'spring', stiffness: 260, damping: 24 }}>
            {/* Kip's own little scene: winter sky and an ice floe to stand on */}
            <button type="button" className="kip-toast__scene" onClick={() => setPoke((n) => n + 1)} aria-label="Kip, the Kept seal. Tap for a tip">
              <span className="kip-toast__floe" aria-hidden />
              <Seal state={pose} size={96} appear="pop" title="" />
            </button>
            <div className="kip-toast__body">
            {timed && !hover && (
              <motion.span key={`${shown.text}-timer`} className="kip-toast__timer" initial={{ scaleX: 1 }} animate={{ scaleX: 0 }} transition={{ duration: autoHideMs / 1000, ease: 'linear' }} aria-hidden />
            )}
            <p className="kip-toast__name">Kip</p>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.p
                key={shown.text}
                className="kip-toast__text"
                initial={{ opacity: 0, filter: 'blur(4px)', scale: 0.96 }}
                animate={{ opacity: 1, filter: 'blur(0px)', scale: 1 }}
                exit={{ opacity: 0, filter: 'blur(4px)', scale: 0.96 }}
                transition={{ type: 'spring', bounce: 0, duration: 0.4 }}
              >
                {shown.text}
              </motion.p>
            </AnimatePresence>
            {action && poke < 0 && (
              <motion.button
                type="button"
                className="kip-toast__action"
                onClick={() => {
                  dismiss();
                  action.run();
                }}
                whileHover={{ y: -1, scale: 1.03 }}
                whileTap={{ scale: 0.96 }}
                transition={{ type: 'spring', stiffness: 350, damping: 18 }}
              >
                <motion.span className="kip-toast__shine" initial={{ x: '-120%' }} whileHover={{ x: '120%' }} transition={{ duration: 0.6, ease: 'easeInOut' }} aria-hidden />
                <span>{action.label}</span>
              </motion.button>
            )}
            </div>
            <button type="button" className="kip-toast__close" onClick={dismiss} aria-label="Dismiss Kip">
              <X size={16} aria-hidden />
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
