import { act, fireEvent, render, screen } from '@testing-library/react';
import { realityCheck, rulebook, stageContent } from '../content';
import { useGame } from '../state/store';
import { HandOff } from './HandOff';
import { HintBox } from './HintBox';
import { RealityCheck } from './RealityCheck';
import { NewRuleCard, RulebookButton } from './Rulebook';
import { StarResult } from './StarResult';
import { Timer } from './Timer';

beforeEach(() => {
  useGame.setState({ relaxedThisSession: false, settings: { theme: 'system', sound: false, relaxed: false } });
});

describe('Timer', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance', 'Date'] }));
  afterEach(() => vi.useRealTimers());

  it('counts down and fires onExpire once', () => {
    const onExpire = vi.fn();
    render(<Timer seconds={3} onExpire={onExpire} />);
    expect(screen.getByRole('timer')).toHaveTextContent('0:03');
    act(() => void vi.advanceTimersByTime(1200));
    expect(screen.getByRole('timer')).toHaveTextContent('0:02');
    act(() => void vi.advanceTimersByTime(3000));
    expect(screen.getByRole('timer')).toHaveTextContent('0:00');
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('gives ×1.5 time in relaxed mode', () => {
    useGame.setState({ relaxedThisSession: true });
    render(<Timer seconds={40} />);
    expect(screen.getByRole('timer')).toHaveTextContent('1:00');
  });

  it('does not count time while the page was frozen (e.g. iOS screen lock)', () => {
    render(<Timer seconds={10} />);
    const real = performance.now.bind(performance);
    const spy = vi.spyOn(performance, 'now').mockImplementation(() => real() + 30_000);
    act(() => void vi.advanceTimersByTime(200));
    spy.mockRestore();
    act(() => void vi.advanceTimersByTime(200));
    expect(screen.getByRole('timer')).toHaveTextContent('0:10');
  });

  it('handles a zero-second timer without NaN and still fires onExpire', () => {
    const onExpire = vi.fn();
    render(<Timer seconds={0} onExpire={onExpire} />);
    act(() => void vi.advanceTimersByTime(400));
    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('timer').innerHTML).not.toContain('NaN');
  });

  it('does not count while paused', () => {
    render(<Timer seconds={5} running={false} />);
    act(() => void vi.advanceTimersByTime(3000));
    expect(screen.getByRole('timer')).toHaveTextContent('0:05');
    expect(screen.getByText('Paused')).toBeInTheDocument();
  });
});

describe('StarResult', () => {
  it('states the stars in text, not just icons', () => {
    render(<StarResult stars={2} heading="Nice" onContinue={() => {}} />);
    expect(screen.getByText('2 of 3 stars')).toBeInTheDocument();
  });
});

describe('RealityCheck', () => {
  it('steps through every card, then calls onDone', () => {
    const check = realityCheck('cloud-k8s');
    const onDone = vi.fn();
    render(<RealityCheck check={check} onDone={onDone} />);
    for (let i = 1; i < check.cards.length; i++) fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('Skip leaves straight away', () => {
    const onDone = vi.fn();
    render(<RealityCheck check={realityCheck('ai')} onDone={onDone} />);
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});

describe('HintBox', () => {
  it('shows nothing, then the hint, then the answer', () => {
    const { rerender } = render(<HintBox level="none" hint="H" answer="A" />);
    expect(screen.getByTestId('hint')).toBeEmptyDOMElement();
    rerender(<HintBox level="hint" hint="Look at rule 2" answer="Trash" />);
    expect(screen.getByTestId('hint')).toHaveTextContent('Look at rule 2');
    rerender(<HintBox level="answer" hint="Look at rule 2" answer="Trash" />);
    expect(screen.getByTestId('hint')).toHaveTextContent('Trash');
  });
});

describe('Rulebook', () => {
  it('lists only the rules in play and tags the new one', () => {
    render(<RulebookButton rulesInPlay={[1, 2]} newRuleId={2} />);
    const rules = screen.getAllByTestId('rule');
    expect(rules).toHaveLength(2);
    expect(rules[1]).toHaveTextContent('New rule');
    expect(rules[0]).not.toHaveTextContent('New rule');
  });

  it('new-rule card shows that rule', () => {
    render(<NewRuleCard ruleId={4} />);
    expect(screen.getByTestId('rule')).toHaveTextContent(rulebook.rules[3]!.title);
  });
});

describe('HandOff', () => {
  it('names the next main player in a group, and the next team when solo', () => {
    const stage = stageContent(3)!;
    const { rerender } = render(<HandOff stage={stage} nextName="Sam" onReady={() => {}} />);
    expect(screen.getByText(/Sam, you're the main player for Software Development/)).toBeInTheDocument();
    rerender(<HandOff stage={stage} onReady={() => {}} />);
    expect(screen.getByText(/Next team: Software Development/)).toBeInTheDocument();
  });
});
