import { copy } from '../content';
import type { HintLevel } from '../state/hints';
import s from './components.module.css';

const t = copy.components;

/** Shows nothing, the hint (after 2 fails) or the answer (after 3). Announced politely. */
export function HintBox({ level, hint, answer }: { level: HintLevel; hint: string; answer: string }) {
  return (
    <div role="status" data-testid="hint">
      {level !== 'none' && (
        <p className={s.hintBox}>
          <span aria-hidden="true">💡 </span>
          <strong>{level === 'hint' ? t.hint : t.answer}:</strong> {level === 'hint' ? hint : answer}
        </p>
      )}
    </div>
  );
}
