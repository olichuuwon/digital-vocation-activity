import { nextPosition } from './progress';

describe('nextPosition', () => {
  it('goes from prologue to stage 1', () => {
    expect(nextPosition({ stage: 0, levelIndex: 0 }, 'booth')).toEqual({ stage: 1, levelIndex: 0 });
  });

  it('booth skips the Stage 1 bonus level', () => {
    // Stage 1 booth levels: tutorial, L1, L2
    expect(nextPosition({ stage: 1, levelIndex: 1 }, 'booth')).toEqual({ stage: 1, levelIndex: 2 });
    expect(nextPosition({ stage: 1, levelIndex: 2 }, 'booth')).toEqual({ stage: 2, levelIndex: 0 });
  });

  it('full includes the Stage 1 bonus level', () => {
    expect(nextPosition({ stage: 1, levelIndex: 2 }, 'full')).toEqual({ stage: 1, levelIndex: 3 });
    expect(nextPosition({ stage: 1, levelIndex: 3 }, 'full')).toEqual({ stage: 2, levelIndex: 0 });
  });

  it('stage 4 leads to the finale, which is terminal', () => {
    expect(nextPosition({ stage: 4, levelIndex: 2 }, 'booth')).toEqual({ stage: 5, levelIndex: 0 });
    expect(nextPosition({ stage: 5, levelIndex: 0 }, 'booth')).toEqual({ stage: 5, levelIndex: 0 });
  });
});
