import { useMemo, useReducer, useState } from 'react';
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
  const [phase, setPhase] = useState<Phase>(run.levelIndex === 0 ? 'briefing' : 'intro');
  const [ruleChosen, setRuleChosen] = useState(false);
  const completeLevel = useGame((g) => g.completeLevel);

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
          setRuleChosen(isRuleChosen(stage1.automate.options, pickedId));
          setPhase('result');
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

  return <HandOff stage={stageContent(2)!} onReady={completeLevel} />;
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

function toastFor(result: CardResult, streak: number) {
  const r = result.rule ?? 1;
  switch (result.kind) {
    case 'correct':
      if (streak >= STREAK_MIN) return toast(fill(c.toast.streak, { n: streak }), 'success');
      if (result.rule === 5) return toast(c.toast.outlierKept, 'success');
      return toast(c.toast.correct, 'success');
    case 'wrongKeep':
    case 'fixInsteadOfTrash':
      return toast(fill(c.toast.wrongKeep, { rule: r, short: ruleShort(r) }), 'error');
    case 'keepUnfixed':
      return toast(fill(c.toast.wrongKeep, { rule: 4, short: ruleShort(4) }), 'error');
    case 'wrongTrashValid':
    case 'fixInsteadOfKeep':
      return toast(c.toast.wrongTrashValid, 'error');
    case 'wrongTrashFixable':
      return toast(c.toast.wrongTrashFixable, 'error');
    case 'wrongFix':
      return toast(c.toast.wrongFix, 'error');
  }
}

function CardPlay({ run, level, debug, onDone }: { run: GameState; level: CardLevel; debug: boolean; onDone: () => void }) {
  const deck = useMemo(
    () => buildDeck(records, level, mulberry32(run.startedAt + run.levelIndex * 7919)),
    [level, run.startedAt, run.levelIndex],
  );
  const [state, dispatch] = useReducer(levelReducer, undefined, () => createLevelState(level, deck));
  const [fixing, setFixing] = useState(false);
  const [rulebookOpen, setRulebookOpen] = useState(false);
  const [tutorialSeen, setTutorialSeen] = useState(0);
  const headingRef = useScreenHeading<HTMLHeadingElement>(stageContent(1)!.levels.find((l) => l.id === level.id)!.name);
  const isTutorial = level.id === 'data-tutorial';
  const record: DataRecord | undefined = state.deck[state.index];
  const answer = currentAnswer(state);

  const decide = (action: Action) => {
    const next = levelReducer(state, { type: 'decide', action });
    dispatch({ type: 'decide', action });
    const result = next.results[next.results.length - 1];
    if (result) toastFor(result, next.streak);
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
  const hintText = fill(c.hint, { rule: answer?.rule ?? 1, short: ruleShort(answer?.rule ?? 1) });
  const answerText = fill(c.answer, {
    action: answer ? c.actions[answer.expected].toLowerCase() : '',
    rule: answer?.rule ?? 1,
  });

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
        <RulebookButton rulesInPlay={level.rules} newRuleId={level.newRules[level.newRules.length - 1]} onOpenChange={setRulebookOpen} />
      </div>
      {level.seconds !== null && (
        <Timer
          seconds={level.seconds}
          running={!rulebookOpen && !state.done}
          onExpire={() => {
            const next = levelReducer(state, { type: 'timeUp' });
            dispatch({ type: 'timeUp' });
            end(next);
          }}
        />
      )}
      {fixing ? (
        <FixPicker record={record} onPick={(i) => decide({ fix: i })} onCancel={() => setFixing(false)} />
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
          <CardActions allowFix={level.allowFix} onAction={onAction} />
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
  // Charts not reached before time-up count as 0 (chartCount stays the full set).
  const finish = (all: OutlierJudgement[]) => {
    useStage1Progress.getState().saveOutlier(run.startedAt, outlierBonus(all, o.charts.length));
    onDone();
  };
  if (intro) return <LevelIntro level={{ id: 'data-l3', newRules: o.newRules }} onStart={onStart} />;
  const chart = o.charts[i]!;
  const hint = outlierHintLevel(wrongTaps);
  return (
    <section className={s.level}>
      <div className={s.topRow}>
        <span className={s.progress}>
          {i + 1} / {o.charts.length}
        </span>
        <RulebookButton rulesInPlay={o.rules} />
      </div>
      <Timer seconds={o.seconds} onExpire={() => finish(judgements)} />
      <p className={ui.muted}>{c.outlier.instruction}</p>
      <HintBox
        level={hint}
        hint="People: 1–15. Water: 5–200 L. Only values outside those are errors."
        answer={`Errors: ${chart.errors.map((e) => chart.bars[e]!.value).join(', ')}`}
      />
      <OutlierBoard
        key={chart.id}
        chart={chart}
        onDone={(tapped) => {
          const j = judgeOutlier(chart, tapped);
          if (j.unusualTapped.length) toast(c.outlier.wrongTap, 'error');
          else if (j.misses.length) toast(c.outlier.missed, 'error');
          else toast(c.toast.correct, 'success');
          setWrongTaps((w) => w + j.falsePositives.length + j.misses.length);
          const next = [...judgements, j];
          setJudgements(next);
          if (i + 1 < o.charts.length) setI(i + 1);
          else finish(next);
        }}
      />
    </section>
  );
}
