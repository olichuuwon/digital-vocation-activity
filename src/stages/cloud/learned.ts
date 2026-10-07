import { fill } from '../../content';
import { c } from './content';

/** Stage 4's "What you learned" line for the debrief (§8.3). */
export function stage4Learned(manualUptime: number, autoUptime: number): string {
  // Rounded down, so 99.7% never reads as a perfect 100%.
  const pct = (x: number) => Math.floor(x * 100 + 1e-9);
  return fill(c.learned, { manual: pct(manualUptime), auto: pct(autoUptime) });
}
