import { copy, levelsFor, stageContent } from '../../content';
import { useGame } from '../../state/store';
import type { GameState } from '../../state/types';
import { useScreenHeading } from '../screenFocus';
import ui from '../ui.module.css';

const t = copy.placeholder;

/** Stand-in for stages 0–5 until M2–M6 replace them. Lets the run, persistence and resume be tested end to end. */
export function StagePlaceholder({ run, onHome }: { run: GameState; onHome: () => void }) {
  const completeLevel = useGame((s) => s.completeLevel);
  const content = stageContent(run.stage);
  const levels = content ? levelsFor(content, run.mode) : [];
  const level = levels[run.levelIndex];
  const title = run.stage === 5 ? t.finale : content ? content.title : 'Prologue';
  const headingRef = useScreenHeading<HTMLHeadingElement>(
    level ? `${title}, level ${run.levelIndex + 1}` : title,
  );

  if (run.stage === 5) {
    return (
      <main className={ui.screen}>
        <h1 ref={headingRef} tabIndex={-1}>
          {t.finale}
        </h1>
        <p className={ui.muted}>{t.finaleNote}</p>
        <div className={ui.actions}>
          <button type="button" className={`${ui.btn} ${ui.primary}`} onClick={onHome}>
            {t.backHome}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className={ui.screen}>
      <h1 data-testid="stage-heading" ref={headingRef} tabIndex={-1}>
        {content && <span aria-hidden="true">{content.icon} </span>}
        {title}
      </h1>
      {content && (
        <p className={ui.muted} data-testid="level-label">
          {content.specialisation} · Level {run.levelIndex + 1} of {levels.length}: {level?.name}
        </p>
      )}
      <div className={ui.card}>
        <p className={ui.muted}>{t.note}</p>
      </div>
      <div className={ui.actions}>
        <button type="button" className={`${ui.btn} ${ui.primary}`} onClick={completeLevel}>
          {t.finishLevel}
        </button>
      </div>
    </main>
  );
}
