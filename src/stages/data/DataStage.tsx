import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useScreenHeading } from '../../app/screenFocus';
import { BriefingCard } from '../../components/BriefingCard';
import { HandOff } from '../../components/HandOff';
import { HintBox } from '../../components/HintBox';
import { RealityCheck } from '../../components/RealityCheck';
import { NewRuleCard, RulebookButton } from '../../components/Rulebook';
import { StarResult } from '../../components/StarResult';
import { Timer } from '../../components/Timer';
import { toast } from '../../components/toastStore';
import { TutorialOverlay } from '../../components/TutorialOverlay';
import ui from '../../components/components.module.css';
import { briefingFor, fill, levelsFor, realityCheck, stageContent } from '../../content';
import type { CardLevel, DataRecord } from '../../content/stage1Schema';
import { useGame } from '../../state/store';
import type { GameState } from '../../state/types';
import { Automate } from './Automate';
import { c, records, stage1 } from './content';
import s from './data.module.css';
import { FixPicker } from './FixPicker';
import {
  buildDeck,
  createLevelState,
  currentAnswer,
  dataAccuracy,
  dataStars,
  isRuleChosen,
  judgeOutlier,
  levelReducer,
  mulberry32,
  outcomeOf,
  outlierBonus,
  outlierHintLevel,
  SCORED_LEVEL_IDS,
  stageScore,
  STREAK_MIN,
  toDataScores,
  type Action,
  type CardResult,
  type LevelState,
  type OutlierJudgement,
} from './logic';
import { OutlierBoard } from './OutlierLevel';
import { stage1For, useStage1Progress } from './progress';
import { publish } from '../../net/group';
import { sc } from '../support/content';
import { S1, useCoop } from '../support/topics';
import { RecordCard, CardActions, type CardAction } from './RecordCard';

type Phase = 'briefing' | 'intro' | 'play' | 'reality' | 'automate' | 'result' | 'handoff';

const ruleShort = (r: number) => c.ruleShort[String(r) as keyof typeof c.ruleShort];

/**
 * Stage 1 "Clean the Data" (§4). Mounted once per level (App keys it by stage + level).
 * Rhythm (§2): Briefing → new-rule cards → level → … → Reality Check → automate tap → stars → hand-off.
 */
export function DataStage({ run, debug }: { run: GameState; debug: boolean }) {
  const stage = stageContent(1)!;
  const levels = levelsFor(stage, run.mode);
  const levelId = levels[run.levelIndex]?.id ?? 'data-tutorial';
  const isLast = run.levelIndex === levels.length - 1;
  const saved = stage1For(run.startedAt);
  const [phase, setPhaseState] = useState<Phase>(() =>
    isLast && saved.endPhase ? saved.endPhase : run.levelIndex === 0 ? 'briefing' : 'intro',
  );
  const [ruleChosen, setRuleChosen] = useState(saved.ruleChosen);
  const completeLevel = useGame((g) => g.completeLevel);
  const setPhase = (p: Phase, chosen?: boolean) => {
    if (p === 'reality' || p === 'automate' || p === 'result' || p === 'handoff')
      useStage1Progress.getState().setEnd(run.startedAt, p, chosen);
    setPhaseState(p);
  };

  const finishLevel = () => (isLast ? setPhase('reality') : completeLevel());

  if (phase === 'briefing') return <BriefingCard briefing={briefingFor(1)!} stage={stage} onGo={() => setPhase('intro')} />;

  if (phase === 'intro' || phase === 'play') {
    if (levelId === 'data-l3') {
      return <OutlierPlay run={run} intro={phase === 'intro'} onStart={() => setPhase('play')} onDone={finishLevel} />;
    }
    const level = stage1.levels.find((l) => l.id === levelId)!;
    return phase === 'intro' ? (
      <LevelIntro level={level} onStart={() => setPhase('play')} />
    ) : (
      <CardPlay run={run} level={level} debug={debug} onDone={finishLevel} />
    );
  }

  const progress = stage1For(run.startedAt);
  const handCleaned = progress.outcomes
    .filter((o) => (SCORED_LEVEL_IDS as readonly string[]).includes(o.levelId))
    .reduce((n, o) => n + o.results.length, 0);

  if (phase === 'reality')
    return (
      <RealityCheck
        check={realityCheck('data')}
        vars={{ handCleaned: handCleaned || 20 }}
        onDone={() => setPhase('automate')}
      />
    );

  if (phase === 'automate')
    return (
      <Automate
        options={stage1.automate.options}
        onDone={(pickedId) => {
          const chosen = isRuleChosen(stage1.automate.options, pickedId);
          setRuleChosen(chosen);
          setPhase('result', chosen);
        }}
      />
    );

  if (phase === 'result') {
    const accuracy = dataAccuracy(progress.outcomes);
    const score = stageScore({ accuracy, ruleChosen, outlier: run.mode === 'full' ? (progress.outlier ?? 0) : null });
    const stars = dataStars(score, stage1.stars);
    const scores = toDataScores(progress.outcomes, ruleChosen);
    const heading = [c.result.heading0, c.result.heading1, c.result.heading2, c.result.heading3][stars]!;
    const lines = [
      fill(c.result.accuracy, { pct: Math.round(scores.accuracy * 100) }),
      fill(c.result.fixed, { n: scores.fixedCount }),
      ...(ruleChosen ? [c.result.automated] : []),
    ];
    return (
      <StarResult
        stars={stars}
        heading={heading}
        lines={lines}
        onContinue={() => {
          useGame.getState().recordStage('data', scores, stars);
          setPhase('handoff');
        }}
      />
    );
  }

  return (
    <HandOff
      stage={stageContent(2)!}
      onReady={() => {
        // Stage done: a later replay (chapter select, M6) starts fresh, not at this hand-off.
        useStage1Progress.getState().setEnd(run.startedAt, null);
        completeLevel();
      }}
    />
  );
}

function LevelIntro({ level, onStart }: { level: CardLevel | { id: 'data-l3'; newRules: number[] }; onStart: () => void }) {
  const name = stageContent(1)!.levels.find((l) => l.id === level.id)?.name ?? '';
  const headingRef = useScreenHeading<HTMLHeadingElement>(name);
  return (
    <section className={ui.screen}>
      <h1 ref={headingRef} tabIndex={-1}>
        {name}
      </h1>
      <p className={ui.body}>{c.levelIntro[level.id]}</p>
      {level.newRules.map((r) => (
        <NewRuleCard key={r} ruleId={r} />
      ))}
      <div className={ui.actions}>
        <button type="button" className={`${ui.btn} ${ui.primary}`} onClick={onStart}>
          Start
        </button>
      </div>
    </section>
  );
}

function toastFor(result: CardResult, streak: number, next: string) {
  const r = result.rule ?? 1;
  switch (result.kind) {
    case 'correct':
      if (streak >= STREAK_MIN) return toast(fill(c.toast.streak, { n: streak }), 'success', next);
      if (result.rule === 5) return toast(c.toast.outlierKept, 'success', next);
      return toast(c.toast.correct, 'success', next);
    case 'wrongKeep':
    case 'fixInsteadOfTrash':
      return toast(fill(c.toast.wrongKeep, { rule: r, short: ruleShort(r) }), 'error', next);
    case 'keepUnfixed':
      return toast(fill(c.toast.wrongKeep, { rule: 4, short: ruleShort(4) }), 'error', next);
    case 'wrongTrashValid':
      if (result.rule === 5) return toast(fill(c.toast.wrongKeep, { rule: 5, short: ruleShort(5) }), 'error', next);
      return toast(c.toast.wrongTrashValid, 'error', next);
    case 'fixInsteadOfKeep':
      return toast(c.toast.wrongTrashValid, 'error', next);
    case 'wrongTrashFixable':
      return toast(c.toast.wrongTrashFixable, 'error', next);
    case 'wrongFix':
      return toast(c.toast.wrongFix, 'error', next);
  }
}

function CardPlay({ run, level, debug, onDone }: { run: GameState; level: CardLevel; debug: boolean; onDone: () => void }) {
  const [attemptSeed] = useState(() => Date.now());
  const deck = useMemo(
    () => buildDeck(records, level, mulberry32(attemptSeed + run.levelIndex * 7919)),
    [level, attemptSeed, run.levelIndex],
  );
  const [state, dispatch] = useReducer(levelReducer, undefined, () => createLevelState(level, deck));
  const [fixing, setFixing] = useState(false);
  const [rulebookOpen, setRulebookOpen] = useState(false);
  // When the fix picker closes (pick or Back), return focus to the Fix button (WCAG 2.4.3).
  const fixBtnRef = useRef<HTMLButtonElement>(null);
  const wasFixing = useRef(false);
  useEffect(() => {
    if (!fixing && wasFixing.current) fixBtnRef.current?.focus();
    wasFixing.current = fixing;
  }, [fixing]);
  const [tutorialSeen, setTutorialSeen] = useState(0);
  const headingRef = useScreenHeading<HTMLHeadingElement>(stageContent(1)!.levels.find((l) => l.id === level.id)!.name);
  const isTutorial = level.id === 'data-tutorial';
  const record: DataRecord | undefined = state.deck[state.index];
  const answer = currentAnswer(state);
  // Group mode (§3.5.2): the Rulebook, kept IDs and the right fix live on the support phones.
  const coop = useCoop();
  useEffect(() => {
    if (!coop) return;
    const byId = new Map(state.deck.map((r) => [r.id, r]));
    const kept = state.results
      .filter((r) => r.kind === 'wrongKeep' || r.kind === 'keepUnfixed' || (r.correct && r.expected !== 'trash'))
      .map((r) => byId.get(r.recordId)?.household)
      .filter((h): h is string => !!h);
    const fix = record?.fix && level.allowFix ? (record.fix.options[record.fix.correct] ?? null) : null;
    publish(S1, { kept: [...new Set(kept)], fix, rules: level.rules });
  }, [coop, state.index, state.results, state.deck, record, level]);
  useEffect(() => () => publish(S1, null), []);

  const decide = (action: Action) => {
    const next = levelReducer(state, { type: 'decide', action });
    dispatch({ type: 'decide', action });
    const result = next.results[next.results.length - 1];
    const upcoming = next.deck[next.index];
    const spoken =
      upcoming && !next.done
        ? fill(c.nextCard, { id: upcoming.household, n: next.index + 1, total: next.deck.length })
        : '';
    if (result) toastFor(result, next.streak, spoken);
    setFixing(false);
    if (next.done) end(next);
  };

  const end = (final: LevelState) => {
    if (!isTutorial) useStage1Progress.getState().saveLevel(run.startedAt, outcomeOf(final));
    if (final.endReason === 'timeUp') toast(c.timeUp, 'info');
    onDone();
  };

  const onAction = (a: CardAction) => {
    if (!record) return;
    if (a === 'fix') {
      if (record.fix && level.allowFix) setFixing(true);
      else decide({ fix: -1 });
      return;
    }
    decide(a);
  };

  if (!record) return null;

  const showTutorialHand = isTutorial && tutorialSeen <= state.index && state.index < 3;
  // Plain valid cards break no rule, so they get "keep it" help instead of a rule number.
  const hintText =
    answer?.rule == null ? c.hintKeep : fill(c.hint, { rule: answer.rule, short: ruleShort(answer.rule) });
  const fixOption = answer?.fixIndex !== undefined ? record.fix?.options[answer.fixIndex] : undefined;
  const answerText =
    answer?.rule == null
      ? c.answerKeep
      : fixOption
        ? fill(c.answerFix, { option: fixOption })
        : fill(c.answer, { action: c.actions[answer.expected].toLowerCase(), rule: answer.rule });

  return (
    <section className={s.level}>
      <h1 className="visually-hidden" ref={headingRef} tabIndex={-1}>
        {stageContent(1)!.levels.find((l) => l.id === level.id)!.name}
      </h1>
      <div className={s.topRow}>
        <span className={s.progress}>
          {state.index + 1} / {state.deck.length}
        </span>
        {state.streak >= STREAK_MIN && (
          <span className={s.streak}>
            <span aria-hidden="true">🔥 </span>
            {fill(c.toast.streak, { n: state.streak })}
          </span>
        )}
        {coop ? (
          <p className={s.progress} data-testid="ask-rulebook">
            <span aria-hidden="true">📘 </span>
            {sc.main.askRulebook}
          </p>
        ) : (
          <RulebookButton rulesInPlay={level.rules} newRuleId={level.newRules[level.newRules.length - 1]} onOpenChange={setRulebookOpen} />
        )}
      </div>
      {level.seconds !== null && (
        <Timer
          seconds={level.seconds}
          running={!(rulebookOpen && !coop) && !state.done}
          onExpire={() => {
            const next = levelReducer(state, { type: 'timeUp' });
            dispatch({ type: 'timeUp' });
            end(next);
          }}
        />
      )}
      {fixing ? (
        <FixPicker
          record={record}
          suggest={state.hint === 'answer' ? answer?.fixIndex : undefined}
          onPick={(i) => decide({ fix: i })}
          onCancel={() => setFixing(false)}
        />
      ) : (
        <>
          <div className={s.deck}>
            <RecordCard key={record.id} record={record} allowFix={level.allowFix} onAction={onAction} debug={debug} />
          </div>
          {showTutorialHand && answer && (
            <TutorialOverlay
              gesture={answer.expected === 'keep' ? 'swipe-right' : 'swipe-left'}
              text={answer.expected === 'keep' ? c.tutorialHint.keep : c.tutorialHint.trash}
              onDismiss={() => setTutorialSeen(state.index + 1)}
            />
          )}
          <HintBox level={state.hint} hint={hintText} answer={answerText} />
          <CardActions allowFix={level.allowFix} onAction={onAction} fixRef={fixBtnRef} />
        </>
      )}
    </section>
  );
}

function OutlierPlay({ run, intro, onStart, onDone }: { run: GameState; intro: boolean; onStart: () => void; onDone: () => void }) {
  const o = stage1.outlier;
  const [i, setI] = useState(0);
  const [judgements, setJudgements] = useState<OutlierJudgement[]>([]);
  const [wrongTaps, setWrongTaps] = useState(0);
  const [rulebookOpen, setRulebookOpen] = useState(false);
  const current = o.charts[i]!;
  const title = `${current.measure === 'people' ? c.outlier.chartPeople : c.outlier.chartWater} · ${fill(c.outlier.chartOf, { n: i + 1, total: o.charts.length })}`;
  // A new chart is a new screen: the heading takes focus so nobody is left on <body>.
  const headingRef = useScreenHeading<HTMLHeadingElement>(intro ? '' : title);
  // Charts not reached before time-up count as 0 (chartCount stays the full set).
  const finish = (all: OutlierJudgement[]) => {
    useStage1Progress.getState().saveOutlier(run.startedAt, outlierBonus(all, o.charts.length));
    onDone();
  };
  if (intro) return <LevelIntro level={{ id: 'data-l3', newRules: o.newRules }} onStart={onStart} />;
  const chart = current;
  const hint = outlierHintLevel(wrongTaps);
  return (
    <section className={s.level}>
      <h1 id="outlier-heading" ref={headingRef} tabIndex={-1} style={{ fontSize: '1.375rem' }}>
        {title}
      </h1>
      <div className={s.topRow}>
        <RulebookButton rulesInPlay={o.rules} onOpenChange={setRulebookOpen} />
      </div>
      <Timer seconds={o.seconds} running={!rulebookOpen} onExpire={() => finish(judgements)} />
      <p className={ui.muted}>{c.outlier.instruction}</p>
      <HintBox
        level={hint}
        hint={c.outlier.hintRange}
        answer={fill(c.outlier.answerErrors, { values: chart.errors.map((e) => chart.bars[e]!.value).join(', ') })}
      />
      <OutlierBoard
        key={chart.id}
        labelledBy="outlier-heading"
        chart={chart}
        onDone={(tapped) => {
          const j = judgeOutlier(chart, tapped);
          if (j.unusualTapped.length) toast(c.outlier.wrongTap, 'error');
          else if (j.misses.length) toast(c.outlier.missed, 'error');
          else toast(c.toast.correct, 'success');
          setWrongTaps((w) => w + Math.min(2, j.falsePositives.length + j.misses.length));
          const next = [...judgements, j];
          setJudgements(next);
          if (i + 1 < o.charts.length) setI(i + 1);
          else finish(next);
        }}
      />
    </section>
  );
}
