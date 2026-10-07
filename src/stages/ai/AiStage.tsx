import { useEffect, useMemo, useReducer, useState } from 'react';
import { useScreenHeading } from '../../app/screenFocus';
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
import type { AiImage, Box, Label } from '../../content/stage2Schema';
import { useGame } from '../../state/store';
import type { GameState } from '../../state/types';
import {
  aiStars,
  auditCatch,
  auditCurrentAnswer,
  auditReducer,
  auditWrongDealt,
  boxHintLevel,
  boxScore,
  buildAuditSet,
  buildBoxDeck,
  buildLabelDeck,
  buildTutorialDeck,
  judgeBox,
  createAuditState,
  createLabelState,
  earlyGuessBonus,
  labelAccuracy,
  labelCurrentAnswer,
  labelOptions,
  labelReducer,
  mulberry32,
  stageScore,
  START_BOX,
  STREAK_MIN,
  toAiScores,
  type AuditKind,
  type AuditLevelState,
  type LabelLevelState,
  type Rng,
} from './logic';
import {
  coveredHint,
  coveredReducer,
  coveredResult,
  coveredShown,
  coveredTotal,
  createCoveredState,
  revealOrder,
  type CoveredResult,
} from '../../sim/reveal';
import { SceneArt } from './Art';
import { BoxDrawer } from './BoxDrawer';
import { c, images, imagesById, stage2, t } from './content';
import { useRelaxed } from '../../state/store';
import { RELAXED_FACTOR } from '../../state/timer';
import type { HintLevel } from '../../state/hints';
import { CoveredBoard } from './CoveredBoard';
import { FieldGuideButton } from './FieldGuide';
import { stage2For, useStage2Progress, type AiOutcome, type EndPhase } from './progress';
import s from './ai.module.css';

type Phase = 'briefing' | 'intro' | 'play' | EndPhase;
type LevelId = 'ai-tutorial' | 'ai-l1' | 'ai-l2' | 'ai-l3' | 'ai-l4';

const labelName = (l: Label) => c.labels[l];
const clueFor = (l: Label) => c.fieldGuide.entries[l];
const altFor = (img: AiImage, n: number, total: number) =>
  `${fill(c.imageAlt, { n, total, clue: clueFor(img.label) })}${img.variant === 'night' ? ` ${c.a11y.night}` : ''}`;
/** Where the item sits, for Draw the Box alt text ("bottom left"). */
function whereIs(img: AiImage): string {
  const [x, y, w, h] = img.box;
  const p = c.a11y.places;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const col = cx < 36 ? p.left : cx > 64 ? p.right : p.centre;
  const row = cy < 36 ? p.top : cy > 64 ? p.bottom : p.middle;
  return fill(c.a11y.where, { where: row === p.middle && col === p.centre ? p.centre : `${row} ${col}` });
}
/** What a screen reader hears after an answer: the next picture, then any new help (one live region). */
function spokenNext(next: string, help: HintLevel, hint: string, answer: string): string {
  const h = help === 'hint' ? `${t.hint}: ${hint}` : help === 'answer' ? `${t.answer}: ${answer}` : '';
  return [next, h].filter(Boolean).join(' ');
}
const pct = (x: number) => Math.round(x * 100);

/** A fresh shuffle per attempt, so replays vary (§4.4 spirit). */
function useAttemptRng(salt: number): Rng {
  const [seed] = useState(() => Date.now());
  return useMemo(() => mulberry32(seed + salt * 7919), [seed, salt]);
}

/** Options for every card up front, so a re-render never reshuffles the buttons. */
function useOptions(deck: readonly AiImage[], n: number, rng: Rng): Label[][] {
  return useMemo(() => deck.map((img) => labelOptions(img.label, n, stage2.confusable, rng)), [deck, n, rng]);
}

/**
 * Stage 2 "Teach the Machine to See" (§5). Mounted once per level (App keys it by stage + level).
 * Rhythm (§2): Briefing → intro → level → … → Reality Check → stars → hand-off.
 */
export default function AiStage({ run, debug }: { run: GameState; debug: boolean }) {
  const stage = stageContent(2)!;
  const levels = levelsFor(stage, run.mode);
  const levelId = (levels[run.levelIndex]?.id ?? 'ai-tutorial') as LevelId;
  const isLast = run.levelIndex === levels.length - 1;
  const saved = stage2For(run.startedAt);
  const [phase, setPhaseState] = useState<Phase>(() =>
    isLast && saved.endPhase ? saved.endPhase : run.levelIndex === 0 ? 'briefing' : 'intro',
  );
  const completeLevel = useGame((g) => g.completeLevel);
  const setPhase = (p: Phase) => {
    if (p === 'reality' || p === 'result' || p === 'handoff') useStage2Progress.getState().setEnd(run.startedAt, p);
    setPhaseState(p);
  };
  const finishLevel = (outcome?: AiOutcome) => {
    if (outcome) useStage2Progress.getState().saveLevel(run.startedAt, outcome);
    if (isLast) setPhase('reality');
    else completeLevel();
  };

  if (phase === 'briefing') return <BriefingCard briefing={briefingFor(2)!} stage={stage} onGo={() => setPhase('intro')} />;

  if (phase === 'intro') return <LevelIntro levelId={levelId} onStart={() => setPhase('play')} />;

  if (phase === 'play') {
    const salt = run.levelIndex + 1;
    switch (levelId) {
      case 'ai-tutorial':
      case 'ai-l1':
        return <LabelPlay levelId={levelId} salt={salt} debug={debug} onDone={finishLevel} />;
      case 'ai-l2':
        return <CoveredPlay salt={salt} debug={debug} onDone={finishLevel} />;
      case 'ai-l3':
        return <BoxPlay salt={salt} debug={debug} onDone={finishLevel} />;
      case 'ai-l4':
        return <AuditPlay salt={salt} debug={debug} onDone={finishLevel} />;
    }
  }

  const { outcomes } = stage2For(run.startedAt);
  const l1 = outcomes['ai-l1'];
  const l2 = outcomes['ai-l2'];
  const l3 = outcomes['ai-l3'];
  const l4 = outcomes['ai-l4'];
  // Pictures actually labelled (unanswered at time-up don't count).
  const labelled = (l1?.points.length ?? 0) + (l2?.points.filter((x) => x > 0).length ?? 0);

  if (phase === 'reality')
    return <RealityCheck check={realityCheck('ai')} vars={{ labelled }} onDone={() => setPhase('result')} />;

  if (phase === 'result') {
    const label = labelAccuracy(
      (l1?.points ?? []).map((points) => ({ points })),
      l1?.dealt ?? 0,
      l2?.points ?? [],
      l2?.dealt ?? 0,
    );
    const early = earlyGuessBonus(l2?.bonuses ?? [], l2?.dealt ?? 0);
    const audit = auditCatch(
      (l4?.kinds ?? []).map((kind, i) => ({ kind: kind as AuditKind, assist: (l4?.assists?.[i] ?? 'none') as HintLevel })),
      l4?.wrongDealt ?? 0,
    );
    const box = run.mode === 'full' ? boxScore(l3?.points ?? [], l3?.dealt ?? 0, stage2.box.perfect) : null;
    const stars = aiStars(stageScore({ labelAccuracy: label, early, audit, box }), stage2.stars);
    const scores = toAiScores({ labelAccuracy: label, early, audit }, run.scores.data.accuracy);
    const heading = [c.result.heading0, c.result.heading1, c.result.heading2, c.result.heading3][stars]!;
    const lines = [
      fill(c.result.labels, { pct: pct(label) }),
      fill(c.result.early, { pct: pct(early) }),
      fill(c.result.audit, { pct: pct(audit) }),
      ...(box !== null && l3 ? [fill(c.result.box, { pct: pct(l3.points.length ? l3.points.reduce((a, b) => a + b, 0) / l3.points.length : 0) })] : []),
      fill(c.result.model, { pct: pct(scores.modelAccuracy) }),
    ];
    return (
      <StarResult
        stars={stars}
        heading={heading}
        lines={lines}
        onContinue={() => {
          useGame.getState().recordStage('ai', scores, stars);
          setPhase('handoff');
        }}
      />
    );
  }

  return (
    <HandOff
      stage={stageContent(3)!}
      onReady={() => {
        // Stage done: a later replay (chapter select, M6) starts fresh, not at this hand-off.
        useStage2Progress.getState().setEnd(run.startedAt, null);
        completeLevel();
      }}
    />
  );
}

function levelName(id: LevelId) {
  return stageContent(2)!.levels.find((l) => l.id === id)?.name ?? '';
}

function LevelIntro({ levelId, onStart }: { levelId: LevelId; onStart: () => void }) {
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

/** Level heading (visually hidden) + progress, streak and the field guide. */
function LevelTop({
  levelId,
  n,
  total,
  streak,
  onGuide,
}: {
  levelId: LevelId;
  n: number;
  total: number;
  streak?: number;
  onGuide: (open: boolean) => void;
}) {
  const headingRef = useScreenHeading<HTMLHeadingElement>(levelName(levelId));
  return (
    <>
      <h1 className="visually-hidden" ref={headingRef} tabIndex={-1}>
        {levelName(levelId)}
      </h1>
      <div className={s.topRow}>
        <span className={s.progress}>
          {n} / {total}
        </span>
        {streak !== undefined && streak >= STREAK_MIN && (
          <span className={s.streak}>
            <span aria-hidden="true">🔥 </span>
            {fill(c.toast.streak, { n: streak })}
          </span>
        )}
        <FieldGuideButton onOpenChange={onGuide} />
      </div>
    </>
  );
}

function LabelButtons({
  options,
  onPick,
  suggested,
  disabled = [],
}: {
  options: readonly Label[];
  onPick: (l: Label) => void;
  suggested?: Label | null;
  disabled?: readonly Label[];
}) {
  return (
    <div className={s.options} role="group" aria-label={c.question}>
      {/* Keyed by slot so the focused button survives the next picture (WCAG 2.4.3). Ruled-out
          options use aria-disabled, not disabled, so focus never drops to <body>. */}
      {options.map((l, i) => {
        const isSuggested = suggested === l;
        const off = disabled.includes(l);
        return (
          <button
            key={i}
            type="button"
            className={s.option}
            data-label={l}
            data-suggested={isSuggested || undefined}
            aria-disabled={off || undefined}
            onClick={() => !off && onPick(l)}
          >
            {isSuggested && <span aria-hidden="true">✓ </span>}
            {labelName(l)}
            {isSuggested && <span className="visually-hidden"> {c.a11y.suggested}</span>}
            {off && <span className="visually-hidden"> {c.a11y.ruledOut}</span>}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------------------
// Tutorial + L1 "Build the Training Set"
// ---------------------------------------------------------------------------------------

function LabelPlay({
  levelId,
  salt,
  debug,
  onDone,
}: {
  levelId: 'ai-tutorial' | 'ai-l1';
  salt: number;
  debug: boolean;
  onDone: (o?: AiOutcome) => void;
}) {
  const tutorial = levelId === 'ai-tutorial';
  const rng = useAttemptRng(salt);
  const deck = useMemo(
    () =>
      tutorial
        ? buildTutorialDeck(images, stage2.tutorial.count, rng)
        : buildLabelDeck(images, stage2.label.count, rng),
    [tutorial, rng],
  );
  const options = useOptions(deck, tutorial ? stage2.tutorial.options : stage2.label.options, rng);
  const [state, dispatch] = useReducer(labelReducer, deck, createLabelState);
  const [guideOpen, setGuideOpen] = useState(false);
  const [tutorialSeen, setTutorialSeen] = useState(false);
  const img = state.deck[state.index];
  const answer = labelCurrentAnswer(state);

  const end = (final: LabelLevelState) => {
    if (final.endReason === 'timeUp') toast(c.timeUp, 'info');
    onDone(tutorial ? undefined : { levelId: 'ai-l1', dealt: final.deck.length, points: final.results.map((r) => r.points) });
  };

  const pick = (label: Label) => {
    const next = labelReducer(state, { type: 'answer', label });
    dispatch({ type: 'answer', label });
    const r = next.results[next.results.length - 1]!;
    const upcoming = next.deck[next.index];
    const spoken =
      upcoming && !next.done
        ? spokenNext(
            altFor(upcoming, next.index + 1, next.deck.length),
            next.hint,
            fill(c.hint, { clue: clueFor(upcoming.label) }),
            fill(c.answer, { label: labelName(upcoming.label) }),
          )
        : '';
    if (r.correct) toast(next.streak >= STREAK_MIN ? fill(c.toast.streak, { n: next.streak }) : c.toast.correct, 'success', spoken);
    else toast(fill(c.toast.wrong, { label: labelName(r.expected) }), 'error', spoken);
    if (next.done) end(next);
  };

  if (!img) return null;
  return (
    <section className={s.level}>
      <LevelTop levelId={levelId} n={state.index + 1} total={state.deck.length} streak={state.streak} onGuide={setGuideOpen} />
      {!tutorial && (
        <Timer
          seconds={stage2.label.seconds}
          running={!guideOpen && !state.done}
          onExpire={() => {
            const next = labelReducer(state, { type: 'timeUp' });
            dispatch({ type: 'timeUp' });
            end(next);
          }}
        />
      )}
      <div className={s.frame} key={img.id} data-testid="ai-image" data-label={debug ? img.label : undefined}>
        <SceneArt image={img} title={altFor(img, state.index + 1, state.deck.length)} />
      </div>
      <p className={s.question}>{c.question}</p>
      {tutorial && !tutorialSeen && (
        <TutorialOverlay gesture="tap" text={c.tutorialHint} onDismiss={() => setTutorialSeen(true)} />
      )}
      <HintBox
        quiet
        level={state.hint}
        hint={fill(c.hint, { clue: clueFor(img.label) })}
        answer={fill(c.answer, { label: labelName(img.label) })}
      />
      <LabelButtons
        options={options[state.index] ?? []}
        onPick={pick}
        suggested={state.hint === 'answer' ? answer : null}
      />
    </section>
  );
}

// ---------------------------------------------------------------------------------------
// L2 "Covered Up"
// ---------------------------------------------------------------------------------------

const TICK_MS = 100;

function CoveredPlay({ salt, debug, onDone }: { salt: number; debug: boolean; onDone: (o?: AiOutcome) => void }) {
  // Relaxed mode (§10) slows the tiles too, not just the clock. Early bonus counts tiles, so it stays fair.
  const relaxed = useRelaxed();
  const [cfg] = useState(() =>
    relaxed ? { ...stage2.covered, revealEveryMs: Math.round(stage2.covered.revealEveryMs * RELAXED_FACTOR) } : stage2.covered,
  );
  const rng = useAttemptRng(salt);
  const deck = useMemo(() => buildLabelDeck(images, cfg.count, rng), [cfg.count, rng]);
  const options = useOptions(deck, cfg.options, rng);
  const orders = useMemo(() => deck.map(() => revealOrder(cfg.grid, rng)), [deck, cfg.grid, rng]);
  const [index, setIndex] = useState(0);
  const [cs, setCs] = useState(() => createCoveredState(deck[0]!, cfg));
  const [results, setResults] = useState<CoveredResult[]>([]);
  const [guideOpen, setGuideOpen] = useState(false);
  const [finished, setFinished] = useState(false);
  const img = deck[index];
  const settingsOpen = useGame((g) => g.settingsOpen);
  const running = !guideOpen && !finished && !settingsOpen;

  // Tiles lift on a steady clock; paused while the field guide is open or the tab is hidden.
  useEffect(() => {
    if (!running) return;
    let last = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      const dt = Math.min(now - last, 500);
      last = now;
      if (document.hidden) return;
      setCs((st) => coveredReducer(st, { type: 'tick', elapsedMs: st.elapsedMs + dt }));
    }, TICK_MS);
    return () => clearInterval(id);
  }, [running, index]);

  const end = (all: CoveredResult[]) => {
    setFinished(true);
    onDone({ levelId: 'ai-l2', dealt: deck.length, points: all.map((r) => r.points), bonuses: all.map((r) => r.bonus) });
  };

  const guess = (label: Label) => {
    const next = coveredReducer(cs, { type: 'guess', label });
    if (next === cs) return;
    if (!next.solved) {
      setCs(next);
      const help = coveredHint(next);
      const announceHelp = help !== coveredHint(cs);
      toast(
        c.covered.wrongTile,
        'error',
        announceHelp
          ? spokenNext('', help, fill(c.hint, { clue: clueFor(next.label) }), fill(c.answer, { label: labelName(next.label) }))
          : '',
      );
      return;
    }
    const r = coveredResult(next);
    const all = [...results, r];
    setResults(all);
    const upcoming = deck[index + 1];
    const spoken = upcoming ? altFor(upcoming, index + 2, deck.length) : '';
    toast(r.bonus >= 0.5 && r.wrongGuesses === 0 ? c.covered.early : c.toast.correct, 'success', spoken);
    if (!upcoming) return end(all);
    setIndex(index + 1);
    setCs(createCoveredState(upcoming, cfg, next.charges));
  };

  if (!img) return null;
  const shown = coveredShown(cs);
  const total = coveredTotal(cs);
  const hint = coveredHint(cs);
  const wrongGuesses = cs.guessed.filter((g) => g !== img.label);
  return (
    <section className={s.level}>
      <LevelTop levelId="ai-l2" n={index + 1} total={deck.length} onGuide={setGuideOpen} />
      <Timer
        seconds={cfg.seconds}
        running={running}
        onExpire={() => {
          // The image on screen when time runs out counts as unanswered (0); unseen ones too.
          const all = [...results, coveredResult(cs)];
          toast(c.timeUp, 'info');
          end(all);
        }}
      />
      <CoveredBoard
        key={img.id}
        image={img}
        title={altFor(img, index + 1, deck.length)}
        grid={cfg.grid}
        order={orders[index] ?? []}
        shown={shown}
      />
      <p className={s.credit}>{c.covered.instruction}</p>
      <div className={s.revealRow} data-testid="covered-label" data-label={debug ? img.label : undefined}>
        <span className={ui.muted}>
          {shown >= total ? c.covered.allShown : fill(c.covered.tilesLeft, { n: total - shown })}
        </span>
        <button
          type="button"
          className={s.revealBtn}
          aria-disabled={cs.charges <= 0 || shown >= total || undefined}
          onClick={() => setCs((st) => coveredReducer(st, { type: 'reveal' }))}
        >
          <span aria-hidden="true">👁️ </span>
          {c.covered.reveal} ({fill(c.covered.revealLeft, { n: cs.charges })})
        </button>
      </div>
      <HintBox
        quiet
        level={hint}
        hint={fill(c.hint, { clue: clueFor(img.label) })}
        answer={fill(c.answer, { label: labelName(img.label) })}
      />
      <LabelButtons
        options={options[index] ?? []}
        onPick={guess}
        suggested={hint === 'answer' ? img.label : null}
        disabled={wrongGuesses}
      />
    </section>
  );
}

// ---------------------------------------------------------------------------------------
// Bonus L3 "Draw the Box"
// ---------------------------------------------------------------------------------------

function BoxPlay({ salt, debug, onDone }: { salt: number; debug: boolean; onDone: (o?: AiOutcome) => void }) {
  const cfg = stage2.box;
  const rng = useAttemptRng(salt);
  const deck = useMemo(() => buildBoxDeck(images, cfg.count, rng), [cfg.count, rng]);
  const [index, setIndex] = useState(0);
  const [box, setBox] = useState<Box>(START_BOX);
  const [ious, setIous] = useState<number[]>([]);
  const [misses, setMisses] = useState(0);
  const [guideOpen, setGuideOpen] = useState(false);
  const [finished, setFinished] = useState(false);
  const img = deck[index];
  const hint = boxHintLevel(misses);

  const end = (all: number[]) => {
    setFinished(true);
    onDone({ levelId: 'ai-l3', dealt: deck.length, points: all });
  };

  const lock = () => {
    if (!img) return;
    const { iou, grade } = judgeBox(box, img.box, cfg);
    // Tracing the shown answer (§2 "answer with reduced score") earns at most half credit.
    const all = [...ious, hint === 'answer' ? Math.min(iou, cfg.perfect / 2) : iou];
    setIous(all);
    if (grade === 'miss') setMisses((m) => m + 1);
    const upcoming = deck[index + 1];
    const spoken = upcoming
      ? spokenNext(
          `${fill(c.box.findLabel, { label: labelName(upcoming.label) })}. ${altFor(upcoming, index + 2, deck.length)} ${whereIs(upcoming)}`,
          boxHintLevel(misses + (grade === 'miss' ? 1 : 0)),
          c.box.hint,
          c.box.answer,
        )
      : '';
    toast(fill(c.box[grade], { pct: pct(iou) }), grade === 'miss' ? 'error' : 'success', spoken);
    if (!upcoming) return end(all);
    setIndex(index + 1);
    setBox(START_BOX);
  };

  if (!img) return null;
  return (
    <section className={s.level}>
      <LevelTop levelId="ai-l3" n={index + 1} total={deck.length} onGuide={setGuideOpen} />
      <Timer
        seconds={cfg.seconds}
        running={!guideOpen && !finished}
        onExpire={() => {
          toast(c.timeUp, 'info');
          end(ious);
        }}
      />
      <p className={s.question}>{fill(c.box.findLabel, { label: labelName(img.label) })}</p>
      <p className={s.credit}>{c.box.instruction}</p>
      <div data-truth={debug ? img.box.join(',') : undefined} data-testid="box-level" style={{ display: 'contents' }}>
        <BoxDrawer
          key={img.id}
          image={img}
          title={`${altFor(img, index + 1, deck.length)} ${whereIs(img)}`}
          box={box}
          onChange={setBox}
          truth={hint === 'answer' ? img.box : undefined}
        />
      </div>
      <HintBox quiet level={hint} hint={c.box.hint} answer={c.box.answer} />
      <p className={s.credit}>{c.box.credit}</p>
      <div className={ui.actions} style={{ position: 'sticky', bottom: 0, background: 'var(--bg)', padding: '8px 0' }}>
        <button type="button" className={`${ui.btn} ${ui.primary}`} onClick={lock}>
          {c.box.lock}
        </button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------------------
// L4 "Audit the AI"
// ---------------------------------------------------------------------------------------

function AuditPlay({ salt, debug, onDone }: { salt: number; debug: boolean; onDone: (o?: AiOutcome) => void }) {
  const cfg = stage2.audit;
  const rng = useAttemptRng(salt);
  const items = useMemo(() => buildAuditSet(cfg.pool, imagesById, cfg, rng), [cfg, rng]);
  const [state, dispatch] = useReducer(auditReducer, items, (it) => createAuditState(it, imagesById));
  const [guideOpen, setGuideOpen] = useState(false);
  const item = state.items[state.index];
  const img = item ? imagesById.get(item.imageId) : undefined;
  const answer = auditCurrentAnswer(state);

  const end = (final: AuditLevelState) => {
    if (final.endReason === 'timeUp') toast(c.timeUp, 'info');
    onDone({
      levelId: 'ai-l4',
      dealt: final.items.length,
      points: [],
      kinds: final.results.map((r) => r.kind),
      assists: final.results.map((r) => r.assist),
      wrongDealt: auditWrongDealt(final),
    });
  };

  const judge = (verdict: 'right' | 'flag') => {
    if (!item || !img) return;
    const next = auditReducer(state, { type: 'judge', verdict });
    dispatch({ type: 'judge', verdict });
    const r = next.results[next.results.length - 1]!;
    const upcoming = next.items[next.index];
    const upImg = upcoming && !next.done ? imagesById.get(upcoming.imageId) : undefined;
    const spoken =
      upcoming && upImg
        ? spokenNext(
            `${altFor(upImg, next.index + 1, next.items.length)} ${fill(c.audit.says, { label: labelName(upcoming.predicted) })}, ${fill(c.audit.confidence, { pct: pct(upcoming.confidence) })}.`,
            next.hint,
            c.audit.hint,
            fill(c.audit.answer, { predicted: labelName(upcoming.predicted), label: labelName(upImg.label) }),
          )
        : '';
    const vars = { label: labelName(img.label), predicted: labelName(item.predicted) };
    const msg = { caught: c.audit.caught, missed: fill(c.audit.missed, vars), falseFlag: c.audit.falseFlag, trusted: c.audit.trusted }[r.kind];
    toast(msg, r.correct ? 'success' : 'error', spoken);
    if (next.done) end(next);
  };

  if (!item || !img) return null;
  return (
    <section className={s.level}>
      <LevelTop levelId="ai-l4" n={state.index + 1} total={state.items.length} streak={state.streak} onGuide={setGuideOpen} />
      <Timer
        seconds={cfg.seconds}
        running={!guideOpen && !state.done}
        onExpire={() => {
          const next = auditReducer(state, { type: 'timeUp' });
          dispatch({ type: 'timeUp' });
          end(next);
        }}
      />
      <div
        className={s.frame}
        key={item.id}
        data-testid="audit-image"
        data-wrong={debug ? String(state.wrong[state.index]) : undefined}
      >
        <SceneArt image={img} title={altFor(img, state.index + 1, state.items.length)} />
      </div>
      <p className={s.prediction} data-testid="prediction">
        <span>{fill(c.audit.says, { label: labelName(item.predicted) })}</span>
        <span className={s.conf}>{fill(c.audit.confidence, { pct: pct(item.confidence) })}</span>
      </p>
      <p className={ui.muted} style={{ margin: 0 }}>
        {c.audit.instruction}
      </p>
      <HintBox
        quiet
        level={state.hint}
        hint={c.audit.hint}
        answer={fill(c.audit.answer, { predicted: labelName(item.predicted), label: labelName(img.label) })}
      />
      <div className={s.verdicts}>
        {(['right', 'flag'] as const).map((v) => (
          <button
            key={v}
            type="button"
            className={s.verdict}
            data-kind={v}
            data-suggested={state.hint === 'answer' && answer === v ? true : undefined}
            onClick={() => judge(v)}
          >
            {state.hint === 'answer' && answer === v && <span aria-hidden="true">✓ </span>}
            <span aria-hidden="true">{v === 'right' ? '👍 ' : '🚩 '}</span>
            {v === 'right' ? c.audit.right : c.audit.flag}
          </button>
        ))}
      </div>
    </section>
  );
}
