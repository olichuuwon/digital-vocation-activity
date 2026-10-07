import { motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAnnouncer, useScreenHeading } from '../../app/screenFocus';
import { BriefingCard } from '../../components/BriefingCard';
import { HandOff } from '../../components/HandOff';
import { HintBox } from '../../components/HintBox';
import { RealityCheck } from '../../components/RealityCheck';
import { StarResult } from '../../components/StarResult';
import { Timer } from '../../components/Timer';
import { toast } from '../../components/toastStore';
import { TutorialOverlay } from '../../components/TutorialOverlay';
import ui from '../../components/components.module.css';
import { briefingFor, fill, levelsFor, realityCheck, stageContent } from '../../content';
import type { LogicLevel, LogicLevelId, Program } from '../../content/stage3Schema';
import { parseMap, robustness, runProgram, succeedsAll, type RunResult } from '../../sim/grid';
import { toPython } from '../../sim/python';
import { useGame, useRelaxed } from '../../state/store';
import { RELAXED_FACTOR } from '../../state/timer';
import type { GameState } from '../../state/types';
import { mulberry32 } from '../data/logic';
import { c, stage3, t } from './content';
import { GridMap } from './GridMap';
import { logicStars, nextAssist, SCORED_LEVEL_IDS, stageScore, toLogicScores, type LevelOutcome } from './logic';
import { blockCount, flatten, getBlock } from './program';
import { blockText, ICON } from './blocks';
import { ProgramEditor } from './ProgramEditor';
import { stage3For, useStage3Progress, type EndPhase } from './progress';
import s from './logic.module.css';

type Phase = 'briefing' | 'intro' | 'play' | EndPhase;

const levelById = (id: LogicLevelId) => stage3.levels.find((l) => l.id === id)!;
const levelName = (id: LogicLevelId) => stageContent(3)!.levels.find((l) => l.id === id)?.name ?? '';
/** Truck step pace while running. Slow enough to follow, quick enough to stay fun. */
const STEP_MS = 380;

/**
 * Stage 3 "Build the Logic" (§6). Mounted once per level (App keys it by stage + level).
 * Rhythm (§2): Briefing → intro → level → … → Reality Check → stars → hand-off.
 */
export default function LogicStage({ run, debug }: { run: GameState; debug: boolean }) {
  const stage = stageContent(3)!;
  const levels = levelsFor(stage, run.mode);
  const levelId = (levels[run.levelIndex]?.id ?? 'logic-tutorial') as LogicLevelId;
  const isLast = run.levelIndex === levels.length - 1;
  const saved = stage3For(run.startedAt);
  const [phase, setPhaseState] = useState<Phase>(() =>
    isLast && saved.endPhase ? saved.endPhase : run.levelIndex === 0 ? 'briefing' : 'intro',
  );
  const completeLevel = useGame((g) => g.completeLevel);
  const setPhase = (p: Phase) => {
    if (p === 'reality' || p === 'result' || p === 'handoff') useStage3Progress.getState().setEnd(run.startedAt, p);
    setPhaseState(p);
  };
  const finishLevel = (outcome: LevelOutcome | null, program: Program | null) => {
    if (outcome) useStage3Progress.getState().saveLevel(run.startedAt, outcome, program);
    if (isLast) setPhase('reality');
    else completeLevel();
  };

  if (phase === 'briefing') return <BriefingCard briefing={briefingFor(3)!} stage={stage} onGo={() => setPhase('intro')} />;
  if (phase === 'intro') return <LevelIntro levelId={levelId} onStart={() => setPhase('play')} />;
  if (phase === 'play')
    return (
      <PlayLevel
        key={levelId}
        level={levelById(levelId)}
        // Ask the AI uses the player's Stage 2 model (§3.2). Never below the formula's floor of 0.5.
        modelAccuracy={Math.max(0.5, run.scores.ai.modelAccuracy)}
        debug={debug}
        onDone={finishLevel}
      />
    );

  const { outcomes, programs } = stage3For(run.startedAt);
  const all = Object.values(outcomes);
  const dealt = levels.filter((l) => (SCORED_LEVEL_IDS as readonly string[]).includes(l.id)).length;

  if (phase === 'reality') {
    const shown: Program =
      programs['logic-l3'] ?? programs['logic-l2'] ?? programs['logic-l1'] ?? programs['logic-tutorial'] ?? levelById('logic-l3').solution;
    const l3 = levelById('logic-l3');
    const tests = robustness(l3, programs['logic-l3'] ?? l3.solution, stage3.testMaps, mulberry32(run.startedAt), 1);
    return (
      <RealityCheck
        check={realityCheck('logic')}
        vars={{ failing: tests.failed }}
        visuals={{ 'blocks-to-python': <BlocksToPython program={shown} /> }}
        onDone={() => setPhase('result')}
      />
    );
  }

  if (phase === 'result') {
    const scores = toLogicScores(all);
    const stars = logicStars(stageScore(all, dealt), stage3.stars);
    const heading = [c.result.heading0, c.result.heading1, c.result.heading2, c.result.heading3][stars]!;
    const l3 = levelById('logic-l3');
    const tests = robustness(l3, programs['logic-l3'] ?? l3.solution, stage3.testMaps, mulberry32(run.startedAt), 1);
    const lines = [
      fill(c.result.solved, { n: scores.puzzlesSolved, total: dealt }),
      fill(c.result.hints, { n: scores.hintsUsed }),
      fill(c.result.blocks, { n: scores.extraBlocks }),
      fill(c.result.tests, { passed: tests.passed, total: stage3.testMaps }),
    ];
    return (
      <StarResult
        stars={stars}
        heading={heading}
        lines={lines}
        onContinue={() => {
          useGame.getState().recordStage('logic', scores, stars);
          setPhase('handoff');
        }}
      />
    );
  }

  return (
    <HandOff
      stage={stageContent(4)!}
      onReady={() => {
        // Stage done: a later replay (chapter select, M6) starts fresh, not at this hand-off.
        useStage3Progress.getState().setEnd(run.startedAt, null);
        completeLevel();
      }}
    />
  );
}

function LevelIntro({ levelId, onStart }: { levelId: LogicLevelId; onStart: () => void }) {
  const name = levelName(levelId);
  const headingRef = useScreenHeading<HTMLHeadingElement>(name);
  return (
    <section className={ui.screen}>
      <h1 ref={headingRef} tabIndex={-1}>
        {name}
      </h1>
      <p className={ui.body}>{c.levelIntro[levelId]}</p>
      <div className={ui.actions}>
        <button type="button" className={`${ui.btn} ${ui.primary}`} onClick={onStart}>
          Start
        </button>
      </div>
    </section>
  );
}

/** Reality Check card: the player's own blocks next to the same program in Python (§6.4). */
function BlocksToPython({ program }: { program: Program }) {
  const rows = flatten(program).filter((r) => r.kind !== 'end');
  const py = toPython(program);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8, width: '100%', fontSize: '0.8125rem' }}>
      <ul aria-hidden="true" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
        {rows.slice(0, 10).map((r, i) => (
          <li
            key={i}
            style={{
              marginLeft: r.depth * 14,
              background: 'var(--logic)',
              color: '#1a1200',
              borderRadius: 6,
              padding: '1px 8px',
              fontWeight: 700,
              alignSelf: 'flex-start',
            }}
          >
            {r.kind === 'label' ? c.blocks.otherwise : `${ICON[r.block!.op]} ${blockText(r.block!)}`}
          </li>
        ))}
      </ul>
      <p className="visually-hidden" id="python-label">
        {c.a11y.python}
      </p>
      <motion.pre
        aria-labelledby="python-label"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        style={{ margin: 0, fontSize: '0.8125rem', textAlign: 'left', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', background: 'var(--surface-2)', padding: 8, borderRadius: 8 }}
        data-testid="python"
      >
        {py.slice(0, 14).join('\n')}
      </motion.pre>
    </div>
  );
}

type Assist = 'none' | 'hint' | 'answer';

const truckText = (tr: { x: number; y: number; dir: 'N' | 'E' | 'S' | 'W' }) =>
  fill(c.map.truck, { row: tr.y + 1, col: tr.x + 1, dir: c.map.facing[tr.dir] });

function tileName(ch: string, flood: string | null): string {
  if (ch === '.') return c.map.grass;
  if (ch === '#') return c.map.road;
  if (ch === 'D') return c.map.depot;
  if (ch === 'H') return c.map.house;
  if (ch === 'W' || ch === 'F' || ch === 'M') return `${c.map.house}, ${c.map.needs[ch]}`;
  if (ch === '~') return c.map.flooded;
  return flood === ch ? c.map.flooded : c.map.maybeFlooded;
}

function PlayLevel({
  level,
  modelAccuracy,
  debug,
  onDone,
}: {
  level: LogicLevel;
  modelAccuracy: number;
  debug: boolean;
  onDone: (o: LevelOutcome | null, program: Program | null) => void;
}) {
  const isTutorial = level.id === 'logic-tutorial';
  const isDebug = level.id === 'logic-l4';
  const map = useMemo(() => parseMap(level), [level]);
  const [seed] = useState(() => Date.now());
  const [program, setProgramState] = useState<Program>(() => level.prebuilt ?? []);
  const [edits, setEdits] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [failedRuns, setFailedRuns] = useState(0);
  const [answerShown, setAnswerShown] = useState(false);
  /** The run on screen: trace position, auto-play, and whether its result has been judged yet. */
  const [running, setRunning] = useState<{ result: RunResult; i: number; auto: boolean; judged: boolean } | null>(null);
  const [solved, setSolved] = useState<RunResult | null>(null);
  const [tutorialSeen, setTutorialSeen] = useState(!isTutorial);
  const headingRef = useScreenHeading<HTMLHeadingElement>(levelName(level.id));
  const announce = useAnnouncer((a) => a.announce);
  const relaxed = useRelaxed();
  // Relaxed mode (§10) slows the truck too, so there's time to follow it.
  const stepMs = relaxed ? Math.round(STEP_MS * RELAXED_FACTOR) : STEP_MS;
  const runBtnRef = useRef<HTMLButtonElement>(null);
  const assist: Assist = answerShown ? 'answer' : nextAssist(failedRuns);
  const used = blockCount(program);

  const setProgram = (p: Program) => {
    setProgramState(p);
    setRunning(null);
  };

  const outcome = (ok: boolean, res?: RunResult): LevelOutcome => ({
    levelId: level.id,
    solved: ok,
    assist: answerShown ? 'answer' : failedRuns >= 2 ? 'hint' : 'none',
    blocks: used,
    par: level.par,
    failedRuns,
    aiWrongDrops: res?.aiWrongDrops ?? 0,
  });

  /** Step mode speaks each block and where the truck is (the map alone isn't announced). */
  const sayStep = (result: RunResult, i: number) => {
    const st = result.trace[i];
    if (!st) return;
    const b = getBlock(program, st.addr);
    let text = fill(c.a11y.step, { block: b ? blockText(b) : '', truck: `${truckText(st.truck)}.` });
    if (st.event === 'deliver') text += ` ${c.a11y.delivered}`;
    announce(text);
  };

  const start = (auto: boolean) => {
    if (solved) return;
    if (level.blockLimit !== null && used > level.blockLimit) return toast(c.run.overLimit, 'error');
    const rng = mulberry32(seed + attempts * 131);
    const flood = level.floodGroups.length ? level.floodGroups[Math.floor(rng() * level.floodGroups.length)]! : null;
    const result = runProgram(level, program, { flood, modelAccuracy, rng });
    setAttempts((a) => a + 1);
    setRunning({ result, i: result.trace.length ? 0 : -1, auto, judged: false });
    if (!auto) sayStep(result, 0);
  };

  const finish = (result: RunResult) => {
    setRunning((r) => (r && r.result === result ? { ...r, judged: true } : r));
    if (result.ok && level.floodGroups.length > 0 && !succeedsAll(level, program)) {
      setFailedRuns((f) => f + 1);
      return toast(c.run.lucky, 'error');
    }
    if (result.ok) {
      setSolved(result);
      const msg = result.aiWrongDrops > 0 ? `${c.run.success} ${fill(c.run.aiWrong, { n: result.aiWrongDrops })}` : c.run.success;
      return toast(msg, result.aiWrongDrops > 0 ? 'info' : 'success');
    }
    setFailedRuns((f) => f + 1);
    const why = result.reason === 'tooLong' ? 'unfinished' : (result.reason as Exclude<RunResult['reason'], 'success' | 'tooLong'>);
    // New help is spoken with the failure (HintBox is quiet), so one live region speaks at a time.
    const help = nextAssist(failedRuns + 1);
    const spoken = help !== nextAssist(failedRuns) ? (help === 'hint' ? fill(c.hint, { text: c.levelHint[level.id] }) : c.answer) : '';
    const at = result.failAt !== undefined ? result.trace[result.failAt] : undefined;
    const atBlock = at ? getBlock(program, at.addr) : undefined;
    const where = at && atBlock ? fill(c.a11y.stoppedAt, { block: blockText(atBlock), truck: `${truckText(at.truck)}.` }) : '';
    toast(c.run[why], 'error', [where, spoken].filter(Boolean).join(' '));
  };

  // Auto-run: advance one trace step at a time, then judge the run.
  useEffect(() => {
    if (!running) return;
    const last = running.result.trace.length - 1;
    if (running.i >= last) {
      if (running.judged) return;
      // Let the last move animate, then judge. Run/Reset stay locked until then, so this can't be skipped.
      const id = setTimeout(() => finish(running.result), running.auto ? stepMs : 0);
      return () => clearTimeout(id);
    }
    if (!running.auto) return;
    const id = setTimeout(() => setRunning((r) => (r ? { ...r, i: r.i + 1 } : r)), stepMs);
    return () => clearTimeout(id);
    // finish is stable enough for this effect: it reads state through refs/setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  const step = () => {
    if (!running) {
      start(false);
      return;
    }
    const last = running.result.trace.length - 1;
    if (running.i < last) {
      setRunning({ ...running, i: running.i + 1, auto: false });
      sayStep(running.result, running.i + 1);
    }
  };

  const trace = running?.result.trace ?? [];
  const shownStep = running && running.i >= 0 ? trace[running.i] : undefined;
  const truck = shownStep?.truck ?? { x: map.depot.x, y: map.depot.y, dir: level.startDir };
  const delivered = new Set<string>();
  const wrong = new Set<string>();
  if (running)
    for (let k = 0; k <= running.i && k < trace.length; k++) {
      const st = trace[k]!;
      const h = st.house !== undefined ? map.houses[st.house] : undefined;
      if (h && st.event === 'deliver') delivered.add(`${h.x},${h.y}`);
      if (h && st.event === 'aiWrongDrop') {
        delivered.add(`${h.x},${h.y}`);
        wrong.add(`${h.x},${h.y}`);
      }
    }
  const done = running !== null && running.i >= trace.length - 1;
  const failed = done && running.judged && !running.result.ok;
  const failStep = failed && running.result.failAt !== undefined ? trace[running.result.failAt] : undefined;
  const isRunning = running !== null && !running.judged && (running.auto || done);
  const flood = running ? running.result.flood : null;
  const mapLabel = `${fill(c.map.label, { size: map.size })}. ${truckText(truck)}. ${fill(c.a11y.housesDone, {
    done: delivered.size,
    total: map.houses.length,
  })}`;
  const describeTile = (ch: string, x: number, y: number) => {
    const key = `${x},${y}`;
    let name = tileName(ch, flood);
    if (/[HWFM]/.test(ch) && delivered.has(key)) name = wrong.has(key) ? c.a11y.wrongSupply : c.map.delivered;
    if (truck.x === x && truck.y === y) name += ` (${fill(c.a11y.truckHere, { dir: c.map.facing[truck.dir] })})`;
    return name;
  };

  return (
    <section className={s.level}>
      <h1 className="visually-hidden" ref={headingRef} tabIndex={-1}>
        {levelName(level.id)}
      </h1>
      {level.seconds !== null && (
        <Timer
          seconds={level.seconds}
          running={!solved && !isRunning}
          onExpire={() => {
            toast(c.timeUp, 'info');
            onDone(isTutorial ? null : outcome(false), program);
          }}
        />
      )}
      <div className={s.mapWrap} data-flood={debug ? (flood ?? '') : undefined}>
        <GridMap
          grid={level.grid}
          flood={flood}
          truck={truck}
          delivered={delivered}
          wrongDrops={wrong}
          crashed={!!failStep}
          label={mapLabel}
          describedBy="map-rows"
        />
      </div>
      <ol className="visually-hidden" id="map-rows">
        {level.grid.map((row, y) => (
          <li key={y}>{fill(c.a11y.row, { n: y + 1, tiles: [...row].map((ch, x) => describeTile(ch, x, y)).join(', ') })}</li>
        ))}
      </ol>
      {!tutorialSeen && (
        <TutorialOverlay gesture="tap" text={c.editor.tutorialHint} onDismiss={() => setTutorialSeen(true)} />
      )}
      <HintBox quiet level={assist} hint={c.levelHint[level.id]} answer={c.answer} />
      <ProgramEditor
        program={program}
        onChange={setProgram}
        palette={level.palette}
        blockLimit={level.blockLimit}
        locked={isRunning || !!solved}
        activeAddr={shownStep?.addr ?? null}
        failedAddr={failStep?.addr ?? null}
        swap={isDebug ? { left: (level.maxEdits ?? 2) - edits, onSwap: () => setEdits((e) => e + 1) } : undefined}
      />
      {isDebug && <p className={ui.muted}>{fill(c.editor.editsLeft, { n: (level.maxEdits ?? 2) - edits })}</p>}
      <div className={s.runBar}>
        {solved ? (
          <button
            type="button"
            className={s.runBtn}
            data-primary="true"
            style={{ gridColumn: '1 / -1' }}
            onClick={() => onDone(isTutorial ? null : outcome(true, solved), program)}
          >
            {t.continue}
          </button>
        ) : (
          <>
            <button
              type="button"
              ref={runBtnRef}
              className={s.runBtn}
              data-primary="true"
              aria-disabled={isRunning || program.length === 0 || undefined}
              onClick={() => !isRunning && program.length > 0 && start(true)}
            >
              {isRunning ? c.run.running : `▶ ${c.run.run}`}
            </button>
            <button
              type="button"
              className={s.runBtn}
              aria-disabled={isRunning || program.length === 0 || undefined}
              onClick={() => !isRunning && program.length > 0 && step()}
            >
              {c.run.step}
            </button>
            {assist === 'answer' && !answerShown ? (
              <button
                type="button"
                className={s.runBtn}
                onClick={() => {
                  setAnswerShown(true);
                  setEdits(0);
                  setProgram(level.solution);
                  toast(c.answer, 'info');
                  // The button swaps for Reset: put focus on Run instead, so a second tap can't undo the answer.
                  requestAnimationFrame(() => runBtnRef.current?.focus());
                }}
              >
                {c.run.showAnswer}
              </button>
            ) : (
              <button
                type="button"
                className={s.runBtn}
                aria-disabled={isRunning || undefined}
                onClick={() => {
                  if (isRunning) return;
                  if (isDebug && running === null) {
                    setEdits(0);
                    setProgram(level.prebuilt ?? []);
                  } else setRunning(null);
                }}
              >
                {c.run.reset}
              </button>
            )}
          </>
        )}
      </div>
    </section>
  );
}
