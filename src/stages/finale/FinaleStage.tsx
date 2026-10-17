import { animate, m, useReducedMotion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAnnouncer, useScreenHeading } from '../../app/screenFocus';
import { Timer } from '../../components/Timer';
import { toastMs } from '../../components/toastStore';
import { buzz } from '../../app/haptics';
import ui from '../../components/components.module.css';
import { ReplayPicker } from '../../components/ReplayPicker';
import { copy, fill, stageContent, stages } from '../../content';
import { TEAMS, type Team } from '../../content/finaleSchema';
import { GroupRank } from '../../app/screens/GroupRank';
import { useGroup } from '../../net/group';
import { formatBoardDate, sgtDate } from '../../net/sgtTime';
import { useGame, useRelaxed } from '../../state/store';
import { levelSeconds } from '../../state/timer';
import type { GameState, Stage } from '../../state/types';
import { c as aiCopy } from '../ai/content';
import { stage2For } from '../ai/progress';
import { stage4Learned } from '../cloud/learned';
import { c as dataCopy } from '../data/content';
import { mulberry32 } from '../data/logic';
import { stage1For } from '../data/progress';
import { c as logicCopy } from '../logic/content';
import { c, finale, t } from './content';
import { dealIncidents, liveOpsFamilies, matchRanking, pipeline, rankFor, routeResult, type LiveItem, type RouteResult } from './logic';
import { finaleFor, useFinaleProgress } from './progress';
import s from './finale.module.css';

const nf = new Intl.NumberFormat('en-SG');
/** Finale progress belongs to one play-through: a chapter replay (run.replays) starts fresh. */
const finaleKey = (run: GameState) => run.startedAt * 100 + Math.min(99, run.replays ?? 0);
/** Rounded down, so 99.7% uptime never shows as a perfect 100%. */
const pct = (x: number) => Math.floor(x * 100 + 1e-9);
const TEAM_ICON: Record<Team, string> = { data: '📊', ai: '🧠', logic: '🧩', cloud: '☁️' };

/**
 * A caption under a big number: the number itself is shown big just above, so the caption
 * says it for screen readers only ("{n} families reached" reads "families reached" on screen).
 */
function UnderBigNumber({ template, n }: { template: string; n: string }) {
  const [before, after = ''] = template.split('{n}');
  return (
    <>
      {before}
      <span className="visually-hidden">{n} </span>
      {after.trimStart()}
    </>
  );
}

/**
 * Finale "Mission Live" (§8): pipeline reveal → Live Ops incidents → debrief. Progress is saved,
 * so a reload resumes where the player was and Live Ops can't be replayed for a better score.
 */
export default function FinaleStage({
  run,
  onHome,
  onLeaderboard,
  onReplay,
}: {
  run: GameState;
  onHome: () => void;
  onLeaderboard: () => void;
  /** Free play: replay one stage solo on this phone (a team member leaves the team first). */
  onReplay: (stage: Stage) => void;
}) {
  const saved = finaleFor(finaleKey(run));
  const [phase, setPhaseState] = useState(saved.phase);
  const p = useMemo(() => pipeline(run), [run]);
  // A finished run always shows its debrief: a teammate's phone (its local finale progress never
  // saw the earlier phases) and the end of a one-stage replay.
  const patch = (x: Parameters<ReturnType<typeof useFinaleProgress.getState>['patch']>[1]) =>
    useFinaleProgress.getState().patch(finaleKey(run), x);
  const go = (ph: typeof phase) => {
    patch({ phase: ph });
    setPhaseState(ph);
  };

  if (run.finishedAt && phase !== 'debrief') return <Debrief run={run} onHome={onHome} onLeaderboard={onLeaderboard} onReplay={onReplay} />;
  // One tap from the reveal into Live Ops: the reveal also says how Live Ops works. ('intro' is
  // an older saved phase, shown as the reveal.)
  if (phase === 'reveal' || phase === 'intro') return <Reveal p={p} logicPlayed={played(run).logic} onGo={() => go('live')} />;
  if (phase === 'live')
    return (
      <LiveOps
        run={run}
        base={p.families}
        onDone={(results) => {
          const families = liveOpsFamilies(p.families, results, finale.liveOps);
          const newBest = families > useGame.getState().bestFamilies;
          patch({ results, families, newBest, phase: 'debrief' });
          useGame.getState().finishRun(families, results.filter((r) => r === 'right').length);
          setPhaseState('debrief');
        }}
      />
    );
  return <Debrief run={run} onHome={onHome} onLeaderboard={onLeaderboard} onReplay={onReplay} />;
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
function Reveal({ p, logicPlayed, onGo }: { p: ReturnType<typeof pipeline>; logicPlayed: boolean; onGo: () => void }) {
  const relaxed = useRelaxed();
  const reduce = useReducedMotion();
  const headingRef = useScreenHeading<HTMLHeadingElement>(c.reveal.heading);
  const links: [string, string][] = [
    ['📊', fill(c.reveal.data, { pct: pct(p.data) })],
    ['🧠', fill(c.reveal.model, { pct: pct(p.model) })],
    // Display only: the formula still uses logicScore (1 with no hints), but "100%" for a stage
    // nobody played would mislead.
    ['🧩', logicPlayed ? fill(c.reveal.logic, { pct: pct(p.logic) }) : c.reveal.notPlayed],
    ['☁️', fill(c.reveal.uptime, { pct: pct(p.uptime) })],
  ];
  return (
    <section className={ui.screen}>
      <h1 ref={headingRef} tabIndex={-1}>
        {c.reveal.heading}
      </h1>
      <p className={ui.body}>{c.reveal.intro}</p>
      <ol className={s.chain} data-testid="pipeline" role="list">
        {links.map(([icon, text], i) => (
          <m.li key={text} initial={reduce ? false : { opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 + i * 0.8 }}>
            <span aria-hidden="true">{icon}</span> {text}
            {i < links.length - 1 && (
              <span className={s.arrow} aria-hidden="true">
                ↓
              </span>
            )}
          </m.li>
        ))}
      </ol>
      <p className={s.bigNumber} aria-hidden="true">
        <CountUp to={p.families} />
      </p>
      <p className={ui.muted} style={{ textAlign: 'center' }}>
        <UnderBigNumber template={c.reveal.families} n={nf.format(p.families)} />
      </p>
      <p className={ui.body} data-testid="liveops-intro">
        <span aria-hidden="true">🚨 </span>
        {fill(c.liveOps.intro, { s: levelSeconds(finale.liveOps.secondsEach, relaxed) })}
      </p>
      <div className={ui.actions}>
        <button type="button" className={`${ui.btn} ${ui.primary}`} onClick={onGo}>
          {c.liveOps.start}
        </button>
      </div>
    </section>
  );
}

/** §8.2: route each incident to the right team before the timer runs out. */
function LiveOps({ run, base, onDone }: { run: GameState; base: number; onDone: (r: ReturnType<typeof routeResult>[]) => void }) {
  const saved = finaleFor(finaleKey(run));
  const dealt: LiveItem[] = useMemo(() => {
    if (saved.dealt.length) {
      const byId = new Map<string, LiveItem>(finale.incidents.map((i) => [i.id, i]));
      const back = saved.dealt.map((id) => byId.get(id)).filter((x): x is LiveItem => !!x);
      if (back.length) return back;
    }
    // A chapter replay deals a different set, so answers can't be memorised for a better best.
    const rng = mulberry32(run.startedAt + 77 + (run.replays ?? 0) * 1009);
    const d = dealIncidents(finale.incidents, finale.liveOps.count, rng);
    useFinaleProgress.getState().patch(finaleKey(run), { dealt: d.map((x) => x.id) });
    return d;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.startedAt]);
  const relaxed = useRelaxed();
  const announce = useAnnouncer((a) => a.announce);
  const [results, setResults] = useState(saved.results);
  /** Feedback for the incident just routed, shown in place (a toast would cover the next incident). */
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string; why: string } | null>(null);
  /** The item already settled (guards a route and a time-out landing together). */
  const settled = useRef(-1);
  /** Ends the feedback pause (timer or the Next button), whichever comes first. */
  const advance = useRef<(() => void) | null>(null);
  const headingRef = useScreenHeading<HTMLHeadingElement>(c.liveOps.heading);
  // While feedback shows, keep the incident just answered on screen (also for the last one).
  const shown = feedback ? Math.max(0, results.length - 1) : results.length;
  const incident = dealt[shown];
  const families = liveOpsFamilies(base, results, finale.liveOps);
  const itemText = (it: LiveItem) => c.incidents[it.id]?.text ?? '';
  const incidentLabel = (n: number) => `${fill(c.liveOps.incidentOf, { n: n + 1, total: dealt.length })}: ${itemText(dealt[n]!)}`;

  // On arrival: speak the first incident, or, after a reload during the last feedback gap, finish
  // straight away (every incident is already routed; the debrief was the next step).
  useEffect(() => {
    if (results.length >= dealt.length) onDone(results);
    else announce(incidentLabel(results.length));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const settle = (r: RouteResult) => {
    if (!incident || feedback || settled.current === shown) return;
    settled.current = shown;
    const next = [...results, r];
    setResults(next);
    useFinaleProgress.getState().patch(finaleKey(run), { results: next });
    const teamName = c.teamButtons[incident.team];
    const why = c.incidents[incident.id]?.why ?? '';
    const text =
      r === 'right'
        ? fill(c.liveOps.right, { n: finale.liveOps.reward })
        : fill(r === 'wrong' ? c.liveOps.wrong : c.liveOps.timeout, { team: teamName });
    setFeedback({ ok: r === 'right', text, why });
    buzz(r === 'right' ? 'success' : 'error');
    const last = next.length >= dealt.length;
    // Spoken: verdict, then the next incident (the "why" stays on screen). The gap lasts long
    // enough to hear it (relaxed ×1.5), so the next timer never starts mid-sentence.
    const spoken = `${r === 'right' ? t.toastSuccess : t.toastError} ${text} ${last ? c.liveOps.done : incidentLabel(next.length)}`;
    announce(spoken);
    // Capped at 4 s (×1.5 relaxed) so the run doesn't drag; +30 s is there if more is needed.
    const gap = Math.max(finale.liveOps.gapMs * (relaxed ? 1.5 : 1), Math.min(4000 * (relaxed ? 1.5 : 1), toastMs(spoken, relaxed) * 0.5));
    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      clearTimeout(id);
      advance.current = null;
      setFeedback(null);
      if (last) onDone(next);
    };
    const id = setTimeout(go, gap);
    advance.current = go;
  };
  const route = (team: Team | null) => {
    if (incident) settle(routeResult({ id: incident.id, team: incident.team }, team));
  };

  if (!incident) return null;
  return (
    <section className={s.level}>
      <h1 className="visually-hidden" ref={headingRef} tabIndex={-1}>
        {c.liveOps.heading}
      </h1>
      <div className={s.stats}>
        <span>{fill(c.liveOps.incidentOf, { n: shown + 1, total: dealt.length })}</span>
        <span data-testid="live-families">{fill(c.liveOps.families, { n: nf.format(families) })}</span>
      </div>
      <Timer
        key={`${incident.id}-${shown}`}
        seconds={finale.liveOps.secondsEach}
        running={!feedback}
        showPaused={false}
        announceAt={[0]}
        extendable={false}
        urgentAt={3}
        onExpire={() => route(null)}
      />
      <m.article
        key={incident.id}
        className={s.incident}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        data-testid="incident"
        data-team={new URLSearchParams(window.location.search).get('debug') === '1' ? incident.team : undefined}
      >
        <span aria-hidden="true">🚨 </span>
        {itemText(incident)}
      </m.article>
      {feedback ? (
        // Already spoken via the announcer; shown here for sighted players.
        <div className={s.feedback} data-ok={feedback.ok} aria-hidden="true" data-testid="feedback">
          <strong>
            {feedback.ok ? '✓ ' : '✗ '}
            {feedback.text}
          </strong>
          {feedback.why && <span>{feedback.why}</span>}
        </div>
      ) : (
        <p className={s.question}>{c.liveOps.route}</p>
      )}
      {feedback && (
        <button type="button" className={`${ui.btn} ${ui.primary}`} data-testid="next-incident" onClick={() => advance.current?.()}>
          {results.length >= dealt.length ? c.liveOps.finish : c.liveOps.next}
        </button>
      )}
      <div className={s.teams} role="group" aria-label={c.liveOps.route} data-waiting={feedback ? true : undefined}>
        {TEAMS.map((team) => (
          <button key={team} type="button" className={s.team} data-team={team} onClick={() => route(team)}>
            <span aria-hidden="true">{TEAM_ICON[team]} </span>
            {c.teamButtons[team]}
          </button>
        ))}
      </div>
    </section>
  );
}

/** Which stages this run actually played (a ?debug jump can skip some). */
function played(run: GameState): Record<Team, boolean> {
  const s1 = stage1For(run.startedAt).outcomes.filter((o) => o.levelId !== 'data-tutorial');
  const o2 = stage2For(run.startedAt).outcomes;
  return {
    data: s1.length > 0 || run.stars.data > 0,
    ai: Object.keys(o2).length > 0 || run.stars.ai > 0,
    logic: run.scores.logic.puzzlesSolved > 0 || run.stars.logic > 0 || run.scores.logic.hintsUsed > 0,
    cloud: run.scores.cloud.autoUptime > 0 || run.scores.cloud.manualUptime > 0,
  };
}

/** One line per stage from the player's real numbers; a skipped stage says so (never invent). */
function learnedLines(run: GameState): string[] {
  const p = played(run);
  const s1 = stage1For(run.startedAt).outcomes.filter((o) => o.levelId !== 'data-tutorial');
  const cleaned = s1.reduce((n, o) => n + o.results.length, 0);
  const o2 = stage2For(run.startedAt).outcomes;
  const labelled = (o2['ai-l1']?.points.length ?? 0) + (o2['ai-l2']?.points.filter((x) => x > 0).length ?? 0);
  return [
    // A teammate's phone has no local counts for a stage someone else played.
    p.data ? (cleaned ? fill(dataCopy.learned, { count: cleaned }) : dataCopy.learnedTeam) : c.debrief.skipped,
    p.ai ? (labelled ? fill(aiCopy.learned, { count: labelled }) : aiCopy.learnedTeam) : c.debrief.skipped,
    p.logic ? fill(logicCopy.learned, { count: run.scores.logic.puzzlesSolved }) : c.debrief.skipped,
    p.cloud ? stage4Learned(run.scores.cloud.manualUptime, run.scores.cloud.autoUptime) : c.debrief.skipped,
  ];
}

/** §8.3 debrief. The top card fits one 360×740 screen for a screenshot (name-free). */
function Debrief({
  run,
  onHome,
  onLeaderboard,
  onReplay,
}: {
  run: GameState;
  onHome: () => void;
  onLeaderboard: () => void;
  onReplay: (stage: Stage) => void;
}) {
  const saved = finaleFor(finaleKey(run));
  const families = saved.families ?? run.scores.finale.familiesReached;
  const rank = rankFor(families, finale.ranks);
  const headingRef = useScreenHeading<HTMLHeadingElement>(c.debrief.heading);
  const [chapters, setChapters] = useState(false);
  const match = matchRanking(run);
  // finishedAt is set when Live Ops ends; fall back to the run start for old saves.
  const date = formatBoardDate(sgtDate(run.finishedAt ?? run.startedAt));
  const group = useGroup();
  const canReplay = !group.active || !!group.snap.result;

  if (chapters)
    return (
      <ReplayPicker
        onPick={onReplay}
        backLabel={c.debrief.back}
        onBack={() => {
          setChapters(false);
          // Back on the results: put focus on the button that opened the picker (2.4.3).
          requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-testid="replay-stage"]')?.focus());
        }}
      />
    );

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
          <UnderBigNumber template={c.debrief.familiesOf} n={nf.format(families)} />
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
        {/* Group mode (§8.3): the leaderboard rank reveal replaces the solo note. */}
        {group.active ? <GroupRank /> : <p className={s.solo}>{c.debrief.soloNote}</p>}
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
        {/* NEEDS OWNER APPROVAL: src/content/finaleCopy.json debrief.why and roles */}
        {c.debrief.why.map((w) => (
          <div key={w.title} className={s.why}>
            <h3>{w.title}</h3>
            <p>{w.body}</p>
          </div>
        ))}
      </section>

      {/* Free play: every phone, solo or team. A team waits for its leaderboard result first,
          since picking a stage leaves the team. */}
      {canReplay && (
        <p className={s.more} data-testid="more-teaser">
          <span aria-hidden="true">🔓 </span>
          {copy.replay.teaser}
        </p>
      )}
      <div className={s.buttons}>
        {/* The replay (there's more!) leads; a new run starts over from the beginning. */}
        {canReplay && (
          <button type="button" className={`${ui.btn} ${ui.primary}`} data-testid="replay-stage" onClick={() => setChapters(true)}>
            {copy.home.replayStage}
          </button>
        )}
        <button type="button" className={`${ui.btn} ${canReplay ? '' : ui.primary}`} onClick={onHome}>
          {c.debrief.playAgain}
        </button>
        <button type="button" className={ui.btn} onClick={onLeaderboard}>
          {c.debrief.leaderboard}
        </button>
      </div>
    </section>
  );
}
