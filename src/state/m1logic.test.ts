import { hintLevel } from './hints';
import { formatClock, levelSeconds, secondsLeft } from './timer';

describe('hint ladder', () => {
  it('shows a hint after 2 fails and the answer after 3', () => {
    expect(hintLevel(0)).toBe('none');
    expect(hintLevel(1)).toBe('none');
    expect(hintLevel(2)).toBe('hint');
    expect(hintLevel(3)).toBe('answer');
    expect(hintLevel(9)).toBe('answer');
  });
});

describe('timer helpers', () => {
  it('relaxed mode gives ×1.5 time, rounded up', () => {
    expect(levelSeconds(40, false)).toBe(40);
    expect(levelSeconds(40, true)).toBe(60);
    expect(levelSeconds(45, true)).toBe(68);
  });

  it('counts down in whole seconds and never goes negative', () => {
    expect(secondsLeft(40, 0)).toBe(40);
    expect(secondsLeft(40, 100)).toBe(40);
    expect(secondsLeft(40, 1000)).toBe(39);
    expect(secondsLeft(40, 39_999)).toBe(1);
    expect(secondsLeft(40, 41_000)).toBe(0);
  });

  it('formats m:ss', () => {
    expect(formatClock(45)).toBe('0:45');
    expect(formatClock(65)).toBe('1:05');
    expect(formatClock(-3)).toBe('0:00');
  });
});
