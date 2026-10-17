import { useState } from 'react';
import { ReplayPicker } from '../../components/ReplayPicker';
import { copy, fill } from '../../content';
import { groupCopy } from '../../content/groupSchema';
import { groupActions, groupAvailable, useGroup } from '../../net/group';
import { useGame } from '../../state/store';
import { useScreenHeading } from '../screenFocus';
import ui from '../ui.module.css';

const t = copy.home;

/** Entry screen (§3.5.1): Play solo, Play as a team (create or join), Leaderboard. */
export function Home({
  onEnter,
  onLeaderboard,
  onCreateGroup,
  onJoinGroup,
}: {
  onEnter: () => void;
  onLeaderboard: () => void;
  onCreateGroup: () => void;
  onJoinGroup: () => void;
}) {
  const group = useGroup();
  const groupName = group.snap.session?.name;
  // A finished run isn't resumed: its debrief is done (§3.1).
  const hasRun = useGame((s) => s.run !== null && !s.run.finishedAt);
  const startRun = useGame((s) => s.startRun);
  // Free play (§8.3): once a run is finished, replay any stage of it with the bonus levels.
  const canReplay = useGame((s) => !!s.run?.finishedAt);
  const replayFrom = useGame((s) => s.replayFrom);
  const [screen, setScreen] = useState<'main' | 'replay' | 'team'>('main');
  const headingRef = useScreenHeading<HTMLHeadingElement>(
    // The replay picker names its own screen.
    screen === 'replay' ? '' : screen === 'team' ? t.playTeam : t.title,
  );

  const playSolo = () => {
    startRun();
    onEnter();
  };

  if (screen === 'replay') {
    return (
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <ReplayPicker
          backLabel={t.back}
          onBack={() => setScreen('main')}
          onPick={(stage) => {
            replayFrom(stage);
            onEnter();
          }}
        />
      </main>
    );
  }

  if (screen === 'team') {
    return (
      <main className={ui.screen}>
        <h1 className={ui.hero} ref={headingRef} tabIndex={-1}>
          {t.playTeam}
        </h1>
        <p className={ui.muted}>{t.teamBody}</p>
        <div className={ui.actions}>
          {groupAvailable() ? (
            <>
              <button type="button" className={`${ui.btn} ${ui.primary}`} onClick={onCreateGroup}>
                {t.createGroup}
              </button>
              <button type="button" className={ui.btn} onClick={onJoinGroup}>
                {t.joinGroup}
              </button>
            </>
          ) : (
            <p className={ui.muted}>{groupCopy.home.unavailable}</p>
          )}
          <button type="button" className={ui.btn} onClick={() => setScreen('main')}>
            <span aria-hidden="true">←</span> {t.back}
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
      {group.inGroup && groupName ? (
        // In a team (e.g. after a reload): rejoin at the current stage, or leave.
        <div className={ui.actions}>
          <button type="button" className={`${ui.btn} ${ui.primary}`} onClick={onEnter}>
            {fill(groupCopy.home.backToGroup, { name: groupName })}
          </button>
          <button type="button" className={ui.btn} onClick={() => groupActions.leave()}>
            {groupCopy.home.leaveGroup}
          </button>
          <button type="button" className={ui.btn} onClick={onLeaderboard}>
            {t.leaderboard}
          </button>
        </div>
      ) : (
        <div className={ui.actions}>
          {hasRun && (
            <button type="button" className={`${ui.btn} ${ui.primary}`} onClick={onEnter}>
              {t.resume}
            </button>
          )}
          <button type="button" className={`${ui.btn} ${hasRun ? '' : ui.primary}`} onClick={playSolo}>
            {hasRun ? t.newRun : t.playSolo}
          </button>
          <button type="button" className={ui.btn} onClick={() => setScreen('team')}>
            {t.playTeam}
          </button>
          {canReplay && (
            <button type="button" className={ui.btn} data-testid="home-replay" onClick={() => setScreen('replay')}>
              <span aria-hidden="true">🔓 </span>
              {t.replayStage}
            </button>
          )}
          <button type="button" className={ui.btn} onClick={onLeaderboard}>
            {t.leaderboard}
          </button>
        </div>
      )}
    </main>
  );
}
