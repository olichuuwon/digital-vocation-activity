import { animate, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { useScreenHeading } from '../../app/screenFocus';
import { Timer } from '../../components/Timer';
import { toast } from '../../components/toastStore';
import ui from '../../components/components.module.css';
import { fill, stageContent, stages } from '../../content';
import type { Team } from '../../content/finaleSchema';
import { formatBoardDate, sgtDate } from '../../net/sgtTime';
import { useGame } from '../../state/store';
import type { GameState, Stage } from '../../state/types';
import { c as aiCopy } from '../ai/content';
import { stage2For } from '../ai/progress';
import { stage4Learned } from '../cloud/learned';
import { c as dataCopy } from '../data/content';
import { mulberry32 } from '../data/logic';
import { stage1For } from '../data/progress';
import { c as logicCopy } from '../logic/content';
import { c, finale, t } from './content';
import { dealIncidents, liveOpsFamilies, matchRanking, pipeline, rankFor, routeResult, type DealtIncident } from './logic';
import { finaleFor, useFinaleProgress } from './progress';
import s from './finale.module.css';

const nf = new Intl.NumberFormat('en-SG');
const pct = (x: number) => Math.round(x * 100);
const TEAM_ICON: Record<Team, string> = { data: '📊', ai: '🧠', logic: '🧩', cloud: '☁️' };

/**
 * Finale "Mission Live" (§8): pipeline reveal → Live Ops incidents → debrief. Progress is saved,
 * so a reload resumes where the player was and Live Ops can't be replayed for a better score.
 */
export default function FinaleStage({ run, onHome, onLeaderboard }: { run: GameState; onHome: () => void; onLeaderboard: () => void }) {
  const saved = finaleFor(run.startedAt);
  const [phase, setPhaseState] = useState(saved.phase);
  const p = useMemo(() => pipeline(run), [run]);
  const patch = (x: Parameters<ReturnType<typeof useFinaleProgress.getState>['patch']>[1]) =>
    useFinaleProgress.getState().patch(run.startedAt, x);
  const go = (ph: typeof phase) => {
    patch({ phase: ph });
    setPhaseState(ph);
  };

  if (phase === 'reveal') return <Reveal p={p} onGo={() => go('intro')} />;
  if (phase === 'intro') return <LiveIntro onStart={() => go('live')} />;
  if (phase === 'live')
    return (
      <LiveOps
        run={run}
        base={p.families}
        onDone={(results) => {
          const families = liveOpsFamilies(p.families, results, finale.liveOps);
          const newBest = families > useGame.getState().bestFamilies;
          patch({ results, families, newBest, phase: 'debrief' });
          useGame.getState().finishRun(families);
          setPhaseState('debrief');
        }}
      />
    );
  return <Debrief run={run} onHome={onHome} onLeaderboard={onLeaderboard} />;
}

function CountUp({ to }: { to: number }) {
  const reduce = useReducedMotion();
  const [n, setN] = useState(reduce ? to : 0);
  useEffect(() => {
    if (reduce) return;
    const a = animate(0, to, { duration: Math.max(1, finale.revealSeconds - 6), ease: 'easeOut', onUpdate: (v) => setN(Math.round(v)) });
    return () => a.stop();
  }, [to, reduce]);
  return <>{nf.format(n)}</>;
}

/** §8.1: the chain of the player's own numbers, then the families counter. */
function Reveal({ p, onGo }: { p: ReturnType<typeof pipeline>; onGo: () => void }) {
  const headingRef = useScreenHeading<HTMLHeadingElement>(c.reveal.heading);
  const links: [string, string][] = [
    ['📊', fill(c.reveal.data, { pct: pct(p.data) })],
    ['🧠', fill(c.reveal.model, { pct: pct(p.model) })],
    ['🧩', fill(c.reveal.logic, { pct: pct(p.logic) })],
    ['☁️', fill(c.reveal.uptime, { pct: pct(p.uptime) })],
  ];
  return (
    <section className={ui.screen}>
      <h1 ref={headingRef} tabIndex={-1}>
        {c.reveal.heading}
      </h1>
      <p className={ui.body}>{c.reveal.intro}</p>
      <ol className={s.chain} data-testid="pipeline">
        {links.map(([icon, text], i) => (
          <motion.li key={text} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 + i * 0.8 }}>
            <span aria-hidden="true">{icon}</span> {text}
            {i < links.length - 1 && (
              <span className={s.arrow} aria-hidden="true">
                ↓
              </span>
            )}
          </motion.li>
        ))}
      </ol>
      <p className={s.bigNumber} aria-hidden="true">
        <CountUp to={p.families} />
      </p>
      <p className={ui.muted} style={{ textAlign: 'center' }}>
        {fill(c.reveal.families, { n: nf.format(p.families) })}
      </p>
      <div className={ui.actions}>
        <button type="button" className={`${ui.btn} ${ui.primary}`} onClick={onGo}>
          {c.reveal.go}
        </button>
      </div>
    </section>
  );
}

function LiveIntro({ onStart }: { onStart: () => void }) {
  const headingRef = useScreenHeading<HTMLHeadingElement>(c.liveOps.heading);
  return (
    <section className={ui.screen}>
      <h1 ref={headingRef} tabIndex={-1}>
        {c.liveOps.heading}
      </h1>
      <p className={ui.body}>{fill(c.liveOps.intro, { s: finale.liveOps.secondsEach })}</p>
      <div className={ui.actions}>
        <button type="button" className={`${ui.btn} ${ui.primary}`} onClick={onStart}>
          {c.liveOps.start}
        </button>
      </div>
    </section>
  );
}

/** §8.2: route each incident to the right team before the timer runs out. */
function LiveOps({ run, base, onDone }: { run: GameState; base: number; onDone: (r: ReturnType<typeof routeResult>[]) => void }) {
  const saved = finaleFor(run.startedAt);
  const dealt: DealtIncident[] = useMemo(() => {
    if (saved.dealt.length) {
      const byId = new Map(finale.incidents.map((i) => [i.id, i]));
      const back = saved.dealt.map((id) => byId.get(id)).filter((x): x is DealtIncident => !!x);
      if (back.length) return back;
    }
    const d = dealIncidents(finale.incidents, finale.liveOps.count, mulberry32(run.startedAt + 77));
    useFinaleProgress.getState().patch(run.startedAt, { dealt: d.map((x) => x.id) });
    return d;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.startedAt]);
  const [results, setResults] = useState(saved.results);
  const [waiting, setWaiting] = useState(false);
  const headingRef = useScreenHeading<HTMLHeadingElement>(c.liveOps.heading);
  const i = results.length;
  const incident = dealt[i];
  const families = liveOpsFamilies(base, results, finale.liveOps);

  const route = (team: Team | null) => {
    if (!incident || waiting) return;
    const r = routeResult(incident, team);
    const next = [...results, r];
    setResults(next);
    useFinaleProgress.getState().patch(run.startedAt, { results: next });
    const teamName = c.teamButtons[incident.team];
    const why = c.incidents[incident.id]?.why ?? '';
    const msg =
      r === 'right'
        ? fill(c.liveOps.right, { n: finale.liveOps.reward })
        : fill(r === 'wrong' ? c.liveOps.wrong : c.liveOps.timeout, { team: teamName });
    const upcoming = dealt[next.length];
    const spoken = upcoming
      ? `${why} ${fill(c.liveOps.incidentOf, { n: next.length + 1, total: dealt.length })}: ${c.incidents[upcoming.id]?.text ?? ''}`
      : why;
    toast(`${msg} ${why}`, r === 'right' ? 'success' : 'error', spoken.replace(why, '').trim());
    setWaiting(true);
    setTimeout(() => {
      setWaiting(false);
      if (next.length >= dealt.length) onDone(next);
    }, finale.liveOps.gapMs);
  };

  if (!incident) return null;
  return (
    <section className={s.level}>
      <h1 className="visually-hidden" ref={headingRef} tabIndex={-1}>
        {c.liveOps.heading}
      </h1>
      <div className={s.stats}>
        <span>{fill(c.liveOps.incidentOf, { n: i + 1, total: dealt.length })}</span>
        <span data-testid="live-families">{fill(c.liveOps.families, { n: nf.format(families) })}</span>
      </div>
      <Timer key={`${incident.id}-${i}`} seconds={finale.liveOps.secondsEach} running={!waiting} onExpire={() => route(null)} />
      <motion.article
        key={incident.id}
        className={s.incident}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        data-testid="incident"
        data-team={new URLSearchParams(window.location.search).get('debug') === '1' ? incident.team : undefined}
      >
        <span aria-hidden="true">🚨 </span>
        {c.incidents[incident.id]?.text}
      </motion.article>
      <p className={s.question}>{c.liveOps.route}</p>
      <div className={s.teams} role="group" aria-label={c.liveOps.route}>
        {(['data', 'ai', 'logic', 'cloud'] as const).map((team) => (
          <button
            key={team}
            type="button"
            className={s.team}
            data-team={team}
            aria-disabled={waiting || undefined}
            onClick={() => route(team)}
          >
            <span aria-hidden="true">{TEAM_ICON[team]} </span>
            {c.teamButtons[team]}
          </button>
        ))}
      </div>
    </section>
  );
}

function learnedLines(run: GameState): string[] {
  const s1 = stage1For(run.startedAt).outcomes.filter((o) => o.levelId !== 'data-tutorial');
  const cleaned = s1.reduce((n, o) => n + o.results.length, 0) || 20;
  const o2 = stage2For(run.startedAt).outcomes;
  const labelled = (o2['ai-l1']?.points.length ?? 0) + (o2['ai-l2']?.points.filter((x) => x > 0).length ?? 0) || 20;
  return [
    fill(dataCopy.learned, { count: cleaned }),
    fill(aiCopy.learned, { count: labelled }),
    fill(logicCopy.learned, { count: run.scores.logic.puzzlesSolved }),
    stage4Learned(run.scores.cloud.manualUptime, run.scores.cloud.autoUptime),
  ];
}

/** §8.3 debrief. The top card fits one 360×740 screen for a screenshot (name-free). */
function Debrief({ run, onHome, onLeaderboard }: { run: GameState; onHome: () => void; onLeaderboard: () => void }) {
  const saved = finaleFor(run.startedAt);
  const families = saved.families ?? run.scores.finale.familiesReached;
  const rank = rankFor(families, finale.ranks);
  const headingRef = useScreenHeading<HTMLHeadingElement>(c.debrief.heading);
  const [chapters, setChapters] = useState(false);
  const unlocked = useGame((g) => g.chapterUnlocked);
  const match = matchRanking(run);
  // finishedAt is set when Live Ops ends; fall back to the run start for old saves.
  const date = formatBoardDate(sgtDate(run.finishedAt ?? run.startedAt));

  if (chapters) return <ChapterSelect onBack={() => setChapters(false)} />;

  return (
    <section className={s.debrief}>
      <div className={s.card} data-testid="end-card">
        <h1 ref={headingRef} tabIndex={-1}>
          {c.debrief.heading}
        </h1>
        <p className={s.bigNumber} aria-hidden="true">
          {nf.format(families)}
        </p>
        <p className={s.of} data-testid="families">
          {fill(c.debrief.familiesOf, { n: nf.format(families) })}
        </p>
        <p className={s.rank}>{fill(c.debrief.rankLabel, { rank: c.debrief.ranks[rank] ?? rank })}</p>
        {saved.newBest && (
          <p className={s.best}>
            <span aria-hidden="true">🏆 </span>
            {c.debrief.newBest}
          </p>
        )}
        <ul className={s.stars} role="list">
          {stages.map((st) => (
            <li key={st.stage}>
              <span aria-hidden="true">{st.icon}</span> {st.short}{' '}
              <span role="img" aria-label={fill(t.starsLabel, { n: run.stars[st.discipline] })}>
                {'★'.repeat(run.stars[st.discipline])}
                {'☆'.repeat(3 - run.stars[st.discipline])}
              </span>
            </li>
          ))}
        </ul>
        <p className={ui.muted}>{fill(c.debrief.date, { date })}</p>
        <p className={s.solo}>{c.debrief.soloNote}</p>
      </div>

      <section aria-labelledby="match-h" className={s.block}>
        <h2 id="match-h">{c.debrief.matchHeading}</h2>
        <p className={ui.muted}>{c.debrief.matchIntro}</p>
        <ol className={s.match}>
          {match.map((m) => {
            const st = stageContent(stages.find((x) => x.discipline === m.team)!.stage)!;
            return (
              <li key={m.team}>
                <strong>
                  <span aria-hidden="true">{TEAM_ICON[m.team]} </span>
                  {st.specialisation}
                </strong>
                <span>{c.debrief.roles[m.team]}</span>
              </li>
            );
          })}
        </ol>
      </section>

      <section aria-labelledby="learned-h" className={s.block}>
        <h2 id="learned-h">{c.debrief.learnedHeading}</h2>
        <ul className={s.learned}>
          {learnedLines(run).map((l, i) => (
            <li key={i}>
              <span aria-hidden="true">{TEAM_ICON[(['data', 'ai', 'logic', 'cloud'] as const)[i]!]} </span>
              {l}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="why-h" className={s.block}>
        <h2 id="why-h">{c.debrief.whyHeading}</h2>
        {/* NEEDS OWNER APPROVAL (D14): src/content/finaleCopy.json debrief.why and roles */}
        {c.debrief.why.map((w) => (
          <div key={w.title} className={s.why}>
            <h3>{w.title}</h3>
            <p>{w.body}</p>
          </div>
        ))}
      </section>

      <div className={s.buttons}>
        <button type="button" className={`${ui.btn} ${ui.primary}`} onClick={onHome}>
          {c.debrief.playAgain}
        </button>
        {unlocked && (
          <button type="button" className={ui.btn} onClick={() => setChapters(true)}>
            {c.debrief.replayStage}
          </button>
        )}
        <button type="button" className={ui.btn} onClick={onLeaderboard}>
          {c.debrief.leaderboard}
        </button>
      </div>
    </section>
  );
}

/** Chapter select (§8.3): replay from any stage; the run continues from there to the finale. */
function ChapterSelect({ onBack }: { onBack: () => void }) {
  const headingRef = useScreenHeading<HTMLHeadingElement>(c.debrief.chapterHeading);
  const replayFrom = useGame((g) => g.replayFrom);
  return (
    <section className={ui.screen}>
      <h1 ref={headingRef} tabIndex={-1}>
        {c.debrief.chapterHeading}
      </h1>
      <p className={ui.muted}>{c.debrief.chapterIntro}</p>
      <div className={ui.actions}>
        {stages.map((st) => (
          <button
            key={st.stage}
            type="button"
            className={ui.btn}
            onClick={() => {
              useFinaleProgress.getState().patch(-1, {});
              replayFrom(st.stage as Stage);
            }}
          >
            <span aria-hidden="true">{st.icon} </span>
            {st.title}
          </button>
        ))}
        <button type="button" className={ui.btn} onClick={onBack}>
          <span aria-hidden="true">← </span>
          {c.debrief.home}
        </button>
      </div>
    </section>
  );
}
