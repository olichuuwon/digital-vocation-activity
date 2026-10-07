import { lazy, Suspense, useState, type ReactNode } from 'react';
import { BriefingCard } from '../../components/BriefingCard';
import { HandOff } from '../../components/HandOff';
import { HintBox } from '../../components/HintBox';
import { RealityCheck } from '../../components/RealityCheck';
import { NewRuleCard, RulebookButton } from '../../components/Rulebook';
import { StarResult } from '../../components/StarResult';
import { Timer } from '../../components/Timer';
import { ToastHost } from '../../components/Toast';
import { toast } from '../../components/toastStore';
import { TutorialOverlay, type Gesture } from '../../components/TutorialOverlay';
import { briefingFor, copy, realityChecks, stageContent, stages } from '../../content';
import type { RealityCheckContent } from '../../content/schemas';
import { hintLevel } from '../../state/hints';
import type { StarCount } from '../../state/types';
import { useScreenHeading } from '../screenFocus';
import ui from '../ui.module.css';

// Stage 2 art and content load only when the gallery opens.
const PictureGallery = lazy(() => import('../../stages/ai/PictureGallery'));

type Demo =
  | { kind: 'briefing'; stage: number }
  | { kind: 'reality'; id: RealityCheckContent['id'] }
  | { kind: 'stars'; stars: StarCount }
  | { kind: 'handoff'; group: boolean }
  | { kind: 'tutorial'; gesture: Gesture }
  | { kind: 'timer' }
  | { kind: 'rulebook' }
  | { kind: 'hints' }
  | { kind: 'pictures' };

/** `/dev/components` (M1 acceptance): every shared stage component with live content. */
export default function DevComponents() {
  const [demo, setDemo] = useState<Demo | null>(null);
  const back = () => setDemo(null);
  if (demo) {
    const shelled = ['tutorial', 'timer', 'rulebook', 'hints', 'pictures'].includes(demo.kind);
    return shelled ? (
      <DemoView demo={demo} onBack={back} />
    ) : (
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <DemoView demo={demo} onBack={back} />
      </main>
    );
  }
  return <Gallery onPick={setDemo} />;
}

function Gallery({ onPick }: { onPick: (d: Demo) => void }) {
  const headingRef = useScreenHeading<HTMLHeadingElement>(copy.components.devHeading);
  const item = (label: string, d: Demo) => (
    <li key={label}>
      <button type="button" className={ui.btn} style={{ width: '100%' }} onClick={() => onPick(d)}>
        {label}
      </button>
    </li>
  );
  const group = (title: string, items: ReactNode[]) => (
    <section aria-label={title} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <h2>{title}</h2>
      <ul role="list" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items}
      </ul>
    </section>
  );
  return (
    <main className={ui.screen}>
      <h1 ref={headingRef} tabIndex={-1}>
        {copy.components.devHeading}
      </h1>
      {group('Briefing', stages.map((s) => item(`${s.icon} ${s.title}`, { kind: 'briefing', stage: s.stage })))}
      {group('Reality Check', realityChecks.map((c) => item(`${c.heading}${c.needsApproval ? ' (needs approval)' : ''}`, { kind: 'reality', id: c.id })))}
      {group('Results and flow', [
        item('Stars: 0', { kind: 'stars', stars: 0 }),
        item('Stars: 3', { kind: 'stars', stars: 3 }),
        item('Hand-off (solo)', { kind: 'handoff', group: false }),
        item('Hand-off (group)', { kind: 'handoff', group: true }),
      ])}
      {group('In-level helpers', [
        item('Timer (12s)', { kind: 'timer' }),
        item('Tutorial: swipe right', { kind: 'tutorial', gesture: 'swipe-right' }),
        item('Tutorial: tap', { kind: 'tutorial', gesture: 'tap' }),
        item('Rulebook + new rule', { kind: 'rulebook' }),
        item('Hint ladder + toast', { kind: 'hints' }),
      ])}
      {group('Stage content', [item('Stage 2 pictures (all)', { kind: 'pictures' })])}
    </main>
  );
}

function DemoView({ demo, onBack }: { demo: Demo; onBack: () => void }) {
  switch (demo.kind) {
    case 'briefing':
      return <BriefingCard briefing={briefingFor(demo.stage)!} stage={stageContent(demo.stage)!} onGo={onBack} />;
    case 'reality': {
      const check = realityChecks.find((c) => c.id === demo.id)!;
      return <RealityCheck check={check} onDone={onBack} vars={{ handCleaned: 20, failing: 3 }} />;
    }
    case 'stars':
      return (
        <StarResult
          stars={demo.stars}
          heading={demo.stars === 3 ? 'Spotless data!' : 'Data still messy'}
          lines={['Accuracy 90%', '2 records fixed']}
          onContinue={onBack}
        />
      );
    case 'handoff':
      return <HandOff stage={stageContent(2)!} nextName={demo.group ? 'Alex' : undefined} onReady={onBack} />;
    case 'tutorial':
      return (
        <DemoShell title="Tutorial overlay" onBack={onBack}>
          <TutorialOverlay text="Swipe right to keep a record." gesture={demo.gesture} onDismiss={onBack}>
            <div className={ui.card}>Household #14 · Sector B · 4 people · 40 L</div>
          </TutorialOverlay>
        </DemoShell>
      );
    case 'timer':
      return <TimerDemo onBack={onBack} />;
    case 'rulebook':
      return (
        <DemoShell title="Rulebook" onBack={onBack}>
          <NewRuleCard ruleId={3} />
          <RulebookButton rulesInPlay={[1, 2, 3]} newRuleId={3} />
        </DemoShell>
      );
    case 'hints':
      return <HintsDemo onBack={onBack} />;
    case 'pictures':
      return (
        <DemoShell title="Stage 2 pictures" onBack={onBack}>
          <Suspense fallback={null}>
            <PictureGallery />
          </Suspense>
        </DemoShell>
      );
  }
}

function DemoShell({ title, onBack, children }: { title: string; onBack: () => void; children: ReactNode }) {
  const headingRef = useScreenHeading<HTMLHeadingElement>(title);
  return (
    <main className={ui.screen}>
      <h1 ref={headingRef} tabIndex={-1}>
        {title}
      </h1>
      {children}
      <div className={ui.actions}>
        <button type="button" className={ui.btn} onClick={onBack}>
          <span aria-hidden="true">←</span> Back to gallery
        </button>
      </div>
    </main>
  );
}

function TimerDemo({ onBack }: { onBack: () => void }) {
  const [running, setRunning] = useState(true);
  const [run, setRun] = useState(0);
  const [done, setDone] = useState(false);
  return (
    <DemoShell title="Timer" onBack={onBack}>
      <Timer key={run} seconds={12} running={running} onExpire={() => setDone(true)} />
      <p className={ui.muted}>{done ? 'onExpire fired.' : 'Relaxed mode (settings) makes this 18s.'}</p>
      <div style={{ display: 'flex', gap: 12 }}>
        <button type="button" className={ui.btn} onClick={() => setRunning((r) => !r)}>
          {running ? 'Pause' : 'Resume'}
        </button>
        <button
          type="button"
          className={ui.btn}
          onClick={() => {
            setDone(false);
            setRun((n) => n + 1);
          }}
        >
          Restart
        </button>
      </div>
    </DemoShell>
  );
}

function HintsDemo({ onBack }: { onBack: () => void }) {
  const [fails, setFails] = useState(0);
  return (
    <DemoShell title="Hint ladder" onBack={onBack}>
      <p className={ui.muted}>Fails: {fails}</p>
      <HintBox level={hintLevel(fails)} hint="Check the people count." answer="Trash it: 0 people breaks rule 2." />
      <div style={{ display: 'flex', gap: 12 }}>
        <button
          type="button"
          className={ui.btn}
          onClick={() => {
            setFails((f) => f + 1);
            toast('Rule 2: numbers must make sense', 'error');
          }}
        >
          Wrong answer
        </button>
        <button
          type="button"
          className={ui.btn}
          onClick={() => {
            setFails(0);
            toast('Correct!', 'success');
          }}
        >
          Right answer
        </button>
      </div>
      <ToastHost />
    </DemoShell>
  );
}
