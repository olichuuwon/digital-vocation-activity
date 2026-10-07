import { DEFAULT_SETTINGS, STORAGE_KEY, newRun, sanitisePersisted, useGame } from './store';

const initial = useGame.getState();

beforeEach(() => {
  localStorage.clear();
  useGame.setState(initial, true);
});

describe('game store', () => {
  it('starts a run at the prologue in the chosen mode', () => {
    useGame.getState().startRun('full');
    const run = useGame.getState().run!;
    expect(run.mode).toBe('full');
    expect(run.stage).toBe(0);
    expect(run.levelIndex).toBe(0);
  });

  it('persists progress to localStorage after each level', () => {
    useGame.getState().startRun('booth');
    useGame.getState().completeLevel(); // prologue → stage 1
    useGame.getState().completeLevel(); // stage 1 level 1
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(saved.state.run.stage).toBe(1);
    expect(saved.state.run.levelIndex).toBe(1);
  });

  it('rehydrates a saved run (resume)', async () => {
    useGame.getState().startRun('booth');
    useGame.getState().jumpToStage(3);
    const saved = localStorage.getItem(STORAGE_KEY)!;
    useGame.setState(initial, true);
    expect(useGame.getState().run).toBeNull();
    localStorage.setItem(STORAGE_KEY, saved);
    await useGame.persist.rehydrate();
    expect(useGame.getState().run?.stage).toBe(3);
  });

  it('keeps settings when quitting a run', () => {
    useGame.getState().updateSettings({ relaxed: true });
    useGame.getState().startRun('booth');
    useGame.getState().quitRun();
    expect(useGame.getState().run).toBeNull();
    expect(useGame.getState().settings.relaxed).toBe(true);
  });

  it('sound is off by default', () => {
    expect(useGame.getState().settings.sound).toBe(false);
  });
});

describe('recordStage', () => {
  it('saves scores and stars for one discipline and persists them', () => {
    useGame.getState().startRun('booth');
    useGame.getState().recordStage('data', { accuracy: 0.9, fixedCount: 3, ruleChosen: true }, 3);
    const run = useGame.getState().run!;
    expect(run.scores.data).toEqual({ accuracy: 0.9, fixedCount: 3, ruleChosen: true });
    expect(run.stars.data).toBe(3);
    expect(run.stars.ai).toBe(0);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).state.run.stars.data).toBe(3);
  });
});

describe('sanitisePersisted', () => {
  const good = () => JSON.parse(JSON.stringify({ run: newRun('booth', 1), bestFamilies: 5, settings: DEFAULT_SETTINGS }));

  it('keeps a valid save', () => {
    const s = sanitisePersisted(good());
    expect(s.run?.mode).toBe('booth');
    expect(s.bestFamilies).toBe(5);
  });

  it('falls back to default settings when settings are null', () => {
    expect(sanitisePersisted({ ...good(), settings: null }).settings).toEqual(DEFAULT_SETTINGS);
  });

  it('drops a run with an impossible stage or missing scores', () => {
    const bad = good();
    bad.run.stage = 9;
    expect(sanitisePersisted(bad).run).toBeNull();
    const noScores = good();
    delete noScores.run.scores;
    expect(sanitisePersisted(noScores).run).toBeNull();
  });

  it('clamps levelIndex to the last level of the stage', () => {
    const g = good();
    g.run.stage = 1;
    g.run.levelIndex = 99;
    expect(sanitisePersisted(g).run?.levelIndex).toBe(2); // booth stage 1 has 3 levels
  });

  it('handles junk input', () => {
    expect(sanitisePersisted(null)).toEqual({ run: null, chapterUnlocked: false, bestFamilies: 0, settings: DEFAULT_SETTINGS });
    expect(sanitisePersisted('oops').run).toBeNull();
  });

  it('a bad save in localStorage rehydrates to a usable state', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: { settings: null, run: { stage: 9 } }, version: 1 }));
    await useGame.persist.rehydrate();
    expect(useGame.getState().run).toBeNull();
    expect(useGame.getState().settings).toEqual(DEFAULT_SETTINGS);
  });

  it('does not persist the session-only relaxed flag', () => {
    useGame.setState({ relaxedThisSession: true });
    useGame.getState().startRun('booth');
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).state.relaxedThisSession).toBeUndefined();
  });
});

describe('finishRun / replayFrom (M6)', () => {
  beforeEach(() => useGame.setState({ run: null, bestFamilies: 300, chapterUnlocked: false }));

  it('records families, keeps the best, unlocks chapter select, marks the run finished', () => {
    useGame.getState().startRun('booth');
    useGame.getState().finishRun(820);
    const g = useGame.getState();
    expect(g.bestFamilies).toBe(820);
    expect(g.chapterUnlocked).toBe(true);
    expect(g.run!.finishedAt).toBeTypeOf('number');
    expect(g.run!.scores.finale.familiesReached).toBe(820);
    g.finishRun(500);
    expect(useGame.getState().bestFamilies).toBe(820);
  });

  it('replayFrom reopens the run at a stage, keeping scores', () => {
    useGame.getState().startRun('booth');
    useGame.getState().finishRun(700);
    useGame.getState().replayFrom(2);
    const r = useGame.getState().run!;
    expect(r.stage).toBe(2);
    expect(r.levelIndex).toBe(0);
    expect(r.finishedAt).toBeUndefined();
    expect(r.scores.finale.familiesReached).toBe(700);
  });
});
