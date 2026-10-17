import { nextPosition } from './progress';

describe('nextPosition', () => {
  it('goes from prologue to stage 1', () => {
    expect(nextPosition({ stage: 0, levelIndex: 0 })).toEqual({ stage: 1, levelIndex: 0 });
  });

  it('moves through Stage 1 levels, skipping bonus content', () => {
    // Stage 1 levels: tutorial, L1, L2
    expect(nextPosition({ stage: 1, levelIndex: 1 })).toEqual({ stage: 1, levelIndex: 2 });
    expect(nextPosition({ stage: 1, levelIndex: 2 })).toEqual({ stage: 2, levelIndex: 0 });
  });

  it('a replay plays the Stage 1 bonus level too', () => {
    expect(nextPosition({ stage: 1, levelIndex: 2, replays: 1 })).toEqual({ stage: 1, levelIndex: 3 });
    expect(nextPosition({ stage: 1, levelIndex: 3, replays: 1 })).toEqual({ stage: 2, levelIndex: 0 });
  });

  it('stage 4 leads to the finale, which is terminal', () => {
    expect(nextPosition({ stage: 4, levelIndex: 2 })).toEqual({ stage: 5, levelIndex: 0 });
    expect(nextPosition({ stage: 5, levelIndex: 0 })).toEqual({ stage: 5, levelIndex: 0 });
  });
});
