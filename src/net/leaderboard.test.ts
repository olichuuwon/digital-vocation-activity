import {
  classifyError,
  isRetryable,
  LeaderboardError,
  parseBoard,
  parseHideResult,
  parseHostList,
  parseSubmitResult,
  runPayloadSchema,
} from './leaderboard';

const row = {
  rank: 1,
  id: 42,
  group_name: 'Swift Kingfisher',
  group_size: 3,
  mode: 'booth',
  families: 1050,
  finished_at: '2026-10-07T06:05:00.123456+00:00',
  board_date: '2026-10-07',
};

describe('parseBoard', () => {
  it('maps rows to camelCase', () => {
    expect(parseBoard([row])).toEqual([
      {
        rank: 1,
        id: 42,
        groupName: 'Swift Kingfisher',
        groupSize: 3,
        mode: 'booth',
        families: 1050,
        finishedAt: '2026-10-07T06:05:00.123456+00:00',
        boardDate: '2026-10-07',
      },
    ]);
    expect(parseBoard([])).toEqual([]);
  });

  it.each([
    ['not an array', { row }],
    ['families out of range', [{ ...row, families: 1201 }]],
    ['group size 5', [{ ...row, group_size: 5 }]],
    ['missing field', [{ ...row, group_name: undefined }]],
    ['bad date', [{ ...row, board_date: '07/10/2026' }]],
    ['unknown mode', [{ ...row, mode: 'quick' }]],
    ['null', null],
  ])('rejects %s', (_label, data) => {
    expect(() => parseBoard(data)).toThrow(LeaderboardError);
    try {
      parseBoard(data);
    } catch (e) {
      expect((e as LeaderboardError).kind).toBe('bad_response');
    }
  });

  it('ignores extra fields (never leaks them into the app)', () => {
    const [r] = parseBoard([{ ...row, duration_sec: 600 }]);
    expect(r).not.toHaveProperty('duration_sec');
  });
});

describe('other responses', () => {
  it('parses submit results', () => {
    expect(parseSubmitResult({ id: 7, rank_today: 3 })).toEqual({ id: 7, rankToday: 3 });
    expect(parseSubmitResult({ id: 7, rank_today: null })).toEqual({ id: 7, rankToday: null });
    expect(() => parseSubmitResult({ id: 'x' })).toThrow(LeaderboardError);
  });

  it('parses host list and hide results', () => {
    const list = parseHostList({
      status: 'ok',
      rows: [{ id: 1, group_name: 'A', group_size: 2, mode: 'full', families: 5, finished_at: row.finished_at, hidden: true }],
    });
    expect(list.rows[0]).toMatchObject({ id: 1, groupName: 'A', hidden: true });
    expect(parseHostList({ status: 'locked', rows: [] }).status).toBe('locked');
    expect(parseHideResult({ status: 'wrong_pin' })).toBe('wrong_pin');
    expect(() => parseHideResult({ status: 'maybe' })).toThrow(LeaderboardError);
  });
});

describe('classifyError', () => {
  it.each([
    [{ code: 'PT429', message: 'rate_limited' }, 'rate_limited'],
    [{ code: '22023', message: 'invalid_families' }, 'rejected'],
    [{ code: '23505', message: 'dup' }, 'rejected'],
    [{ code: '42501', message: 'permission denied' }, 'unavailable'],
    [{ code: 'PGRST202', message: 'function not found' }, 'unavailable'],
    [{ code: 'PGRST301', message: 'bad jwt' }, 'unavailable'],
    [{ code: '', message: 'TypeError: Failed to fetch' }, 'network'],
    [{ message: 'AbortError' }, 'network'],
  ] as const)('%j → %s', (err, kind) => {
    expect(classifyError(err)).toBe(kind);
  });

  it('only "rejected" is permanent', () => {
    expect(isRetryable('rejected')).toBe(false);
    expect(isRetryable('network')).toBe(true);
    expect(isRetryable('rate_limited')).toBe(true);
    expect(isRetryable('unavailable')).toBe(true);
  });
});

describe('runPayloadSchema', () => {
  const ok = {
    groupToken: '1b4e28ba-2fa1-4d3b-a3f5-ef19b5a7633b',
    groupName: '  Bold   Merlion ',
    groupSize: 4,
    mode: 'full',
    families: 1200,
    durationSec: 1500,
  };

  it('normalises the group name like the server does', () => {
    expect(runPayloadSchema.parse(ok).groupName).toBe('Bold Merlion');
  });

  it('rejects out-of-range values before they hit the network', () => {
    expect(runPayloadSchema.safeParse({ ...ok, families: 1201 }).success).toBe(false);
    expect(runPayloadSchema.safeParse({ ...ok, groupSize: 1 }).success).toBe(false);
    expect(runPayloadSchema.safeParse({ ...ok, groupName: 'x'.repeat(21) }).success).toBe(false);
    expect(runPayloadSchema.safeParse({ ...ok, groupToken: 'nope' }).success).toBe(false);
  });

  it('carries no nickname or device fields', () => {
    expect(Object.keys(runPayloadSchema.shape).sort()).toEqual(
      ['durationSec', 'families', 'groupName', 'groupSize', 'groupToken', 'mode'].sort(),
    );
  });
});
