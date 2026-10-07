import { fill } from '../../content';
import { c } from './content';

/** Stage 4's "What you learned" line for the debrief (§8.3). */
export function stage4Learned(manualUptime: number, autoUptime: number): string {
  return fill(c.learned, { manual: Math.round(manualUptime * 100), auto: Math.round(autoUptime * 100) });
}
