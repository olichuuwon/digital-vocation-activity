import { useState } from 'react';
import { copy, flags, stages } from '../../content';
import { useGame } from '../../state/store';
import type { Mode, Stage } from '../../state/types';
import { useScreenHeading } from '../screenFocus';
import ui from '../ui.module.css';

const t = copy.home;
const l = copy.length;

/** Entry screen (§3.5.1). Group play arrives in M6.5. */
export function Home({
  facilitatorMode,
  onEnter,
  onLeaderboard,
}: {
  facilitatorMode: Mode | null;
  onEnter: () => void;
  onLeaderboard: () => void;
}) {
  // A finished run isn't resumed: its debrief is done (§3.1).
  const hasRun = useGame((s) => s.run !== null && !s.run.finishedAt);
  const startRunInStore = useGame((s) => s.startRun);
  const jumpToStage = useGame((s) => s.jumpToStage);
  // Chapter select (§8.3): after the first finish, replay a stage of the finished run from Home too.
  const canReplay = useGame((s) => s.chapterUnlocked && !!s.run?.finishedAt);
  const replayFrom = useGame((s) => s.replayFrom);
  const [replaying, setReplaying] = useState(false);
  const [picking, setPicking] = useState(false);
  // Feature flag (src/content/flags.json): after the length, pick a starting stage.
  const [stageFor, setStageFor] = useState<Mode | null>(null);
  const startRun = (mode: Mode, stage?: Stage) => {
    if (stage === undefined && flags.stageSelect) return setStageFor(mode);
    startRunInStore(mode);
    if (stage !== undefined && stage > 0) jumpToStage(stage);
    onEnter();
  };
  const headingRef = useScreenHeading<HTMLHeadingElement>(
    replaying ? t.replayStage : stageFor ? l.stageHeading : picking ? l.heading : t.title,
  );

  const playSolo = () => (facilitatorMode ? startRun(facilitatorMode) : setPicking(true));

  if (replaying) {
    return (
      <main className={ui.screen}>
        <h1 className={ui.hero} ref={headingRef} tabIndex={-1}>
          {t.replayStage}
        </h1>
        <div className={ui.actions}>
          {stages.map((st) => (
            <button
              key={st.stage}
              type="button"
              className={ui.btn}
              onClick={() => {
                replayFrom(st.stage as Stage);
                onEnter();
              }}
            >
              <span aria-hidden="true">{st.icon} </span>
              {st.stage}. {st.title}
            </button>
          ))}
          <button type="button" className={ui.btn} onClick={() => setReplaying(false)}>
            <span aria-hidden="true">←</span> {l.back}
          </button>
        </div>
      </main>
    );
  }

  if (stageFor) {
    return (
      <main className={ui.screen}>
        <h1 className={ui.hero} ref={headingRef} tabIndex={-1}>
          {l.stageHeading}
        </h1>
        <p className={ui.muted}>{l.devNote}</p>
        <div className={ui.actions}>
          <button type="button" className={`${ui.btn} ${ui.primary}`} onClick={() => startRun(stageFor, 0)}>
            {l.fromStart}
          </button>
          {stages.map((st) => (
            <button key={st.stage} type="button" className={ui.btn} onClick={() => startRun(stageFor, st.stage as Stage)}>
              <span aria-hidden="true">{st.icon} </span>
              {st.stage}. {st.title}
            </button>
          ))}
          <button type="button" className={ui.btn} onClick={() => startRun(stageFor, 5)}>
            <span aria-hidden="true">🚚 </span>
            {l.finale}
          </button>
          <button type="button" className={ui.btn} onClick={() => setStageFor(null)}>
            <span aria-hidden="true">←</span> {l.back}
          </button>
        </div>
      </main>
    );
  }

  if (picking) {
    return (
      <main className={ui.screen}>
        <h1 className={ui.hero} ref={headingRef} tabIndex={-1}>
          {l.heading}
        </h1>
        <div className={ui.actions}>
          <button type="button" className={`${ui.btn} ${ui.primary}`} onClick={() => startRun('booth')}>
            {l.booth} <span className={ui.detail}>{l.boothDetail}</span>
          </button>
          <button type="button" className={ui.btn} onClick={() => startRun('full')}>
            {l.full} <span className={ui.detail}>{l.fullDetail}</span>
          </button>
          <button type="button" className={ui.btn} onClick={() => setPicking(false)}>
            <span aria-hidden="true">←</span> {l.back}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className={ui.screen}>
      <div className={ui.hero}>
        <h1 ref={headingRef} tabIndex={-1}>
          {t.title}
        </h1>
        <p className={ui.muted}>{t.tagline}</p>
      </div>
      <div className={ui.actions}>
        {hasRun && (
          <button type="button" className={`${ui.btn} ${ui.primary}`} onClick={onEnter}>
            {t.resume}
          </button>
        )}
        <button type="button" className={`${ui.btn} ${hasRun ? '' : ui.primary}`} onClick={playSolo}>
          {hasRun ? t.newRun : t.playSolo}
        </button>
        {canReplay && (
          <button type="button" className={ui.btn} onClick={() => setReplaying(true)}>
            {t.replayStage}
          </button>
        )}
        <button type="button" className={ui.btn} aria-disabled="true">
          {t.createGroup} <span className={ui.detail}>{t.comingSoon}</span>
        </button>
        <button type="button" className={ui.btn} aria-disabled="true">
          {t.joinGroup} <span className={ui.detail}>{t.comingSoon}</span>
        </button>
        <button type="button" className={ui.btn} onClick={onLeaderboard}>
          {t.leaderboard}
        </button>
      </div>
    </main>
  );
}
