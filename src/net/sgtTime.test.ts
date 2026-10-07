import { formatBoardDate, formatSgtTime, parseTimestamp, sgtDate } from './sgtTime';

describe('formatSgtTime', () => {
  it('converts UTC to Singapore clock time (UTC+8)', () => {
    expect(formatSgtTime('2026-10-07T06:05:00Z')).toBe('14:05');
    expect(formatSgtTime('2026-10-07T15:59:59Z')).toBe('23:59');
    expect(formatSgtTime('2026-10-07T16:00:00Z')).toBe('00:00');
  });

  it('reads Postgres-style timestamps with microseconds and offsets', () => {
    expect(formatSgtTime('2026-10-07T12:34:56.123456+00:00')).toBe('20:34');
    expect(formatSgtTime('2026-10-07 12:34:56.5+00')).toBe('20:34');
    expect(formatSgtTime('2026-10-07T20:34:00+08:00')).toBe('20:34');
  });

  it('returns a placeholder for junk', () => {
    expect(formatSgtTime('not a time')).toBe('--:--');
    expect(Number.isNaN(parseTimestamp(''))).toBe(true);
  });
});

describe('sgtDate', () => {
  it('rolls over at midnight SGT, not UTC', () => {
    expect(sgtDate(new Date('2026-03-14T15:59:00Z'))).toBe('2026-03-14');
    expect(sgtDate(new Date('2026-03-14T16:00:00Z'))).toBe('2026-03-15');
    expect(sgtDate(new Date('2026-03-14T23:30:00Z'))).toBe('2026-03-15');
  });

  it('accepts epoch ms and handles month/year ends', () => {
    expect(sgtDate(Date.parse('2026-12-31T16:00:00Z'))).toBe('2027-01-01');
  });
});

describe('formatBoardDate', () => {
  it('formats ISO dates for the all-time board', () => {
    expect(formatBoardDate('2026-10-07')).toBe('7 Oct 2026');
    expect(formatBoardDate('bad')).toBe('bad');
  });
});
