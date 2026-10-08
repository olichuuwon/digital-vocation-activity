import { mulberry32 } from '../../stages/data/logic';
import { CODE_ALPHABET, generateCode, normaliseCode } from './codes';
import { allGeneratedNames, checkGroupName, checkNickname, generateNames, isBlocked } from './moderation';
import { MAX_MESSAGE_CHARS, newer, parseEntryData, parseMessage, parsePresence, PROTOCOL } from './protocol';
import { dealCards, mainFor, moveMember, nextMainCandidate, nominalMainIndex, shuffled, stagesLedBy, supportsFor } from './rotation';

describe('group codes', () => {
  it('are 4 characters with no I, O, 0 or 1', () => {
    const rand = mulberry32(7);
    for (let i = 0; i < 500; i++) {
      const c = generateCode(rand);
      expect(c).toMatch(/^[A-Z2-9]{4}$/);
      expect(c).not.toMatch(/[IO01]/);
    }
    expect(CODE_ALPHABET).toHaveLength(32);
  });

  it('never spell a blocked word', () => {
    // A generator that would spell F-U-C-K first, then something clean.
    let i = 0;
    const bad = ['F', 'U', 'C', 'K', 'K', '7', 'Q', 'M'].map((ch) => (CODE_ALPHABET.indexOf(ch) + 0.5) / 32);
    i = 0;
    expect(generateCode(() => bad[i++ % bad.length]!)).toBe('K7QM');
  });

  it('normalise typed codes', () => {
    expect(normaliseCode(' k7qm ')).toBe('K7QM');
    expect(normaliseCode('k7-qm')).toBe('K7QM');
    expect(normaliseCode('K7Q')).toBeNull();
    expect(normaliseCode('K7QO')).toBeNull(); // O isn't used
    expect(normaliseCode('K1QM')).toBeNull();
  });
});

describe('moderation', () => {
  it.each([
    'fuck',
    'F U C K',
    'fuuuuck squad',
    'Sh1t Happens',
    '$hit',
    'Kan Ni Na',
    'KNN',
    'c b',
    'C.B.',
    'Pukimak',
    'ch33bye',
    'Lan Jiao Team',
    'Nabeh',
    'Big Cocks',
    'sohai',
    'Ass',
    'bitches',
  ])('blocks %j', (name) => expect(isBlocked(name)).toBe(true));

  it.each([
    'Swift Kingfisher',
    'Grass Hoppers',
    'Peacock Power',
    'Class Act',
    'Snorkeling Squad',
    'Crisis Crew',
    'Thorny Otter',
    'Bass Boosters',
    'Cockatoo Crew',
    'Scrapers',
    'Team 404',
    'Kanbo', // not "kan"
  ])('allows %j', (name) => expect(isBlocked(name)).toBe(false));

  it('checks group names and nicknames', () => {
    expect(checkGroupName('')).toBe('empty');
    expect(checkGroupName('   ')).toBe('empty');
    expect(checkGroupName('A'.repeat(21))).toBe('tooLong');
    expect(checkGroupName('  Bold   Merlion ')).toBeNull();
    expect(checkGroupName('Bold​Merlion')).toBe('blocked');
    expect(checkGroupName('Holy shit')).toBe('blocked');
    expect(checkNickname('A'.repeat(17))).toBe('tooLong');
    expect(checkNickname('Mei')).toBeNull();
    // No numbers at all (owner decision), including other scripts' digits.
    expect(checkGroupName('Team 4455')).toBe('digits');
    expect(checkGroupName('Squad 7')).toBe('digits');
    expect(checkNickname('Mei2')).toBe('digits');
    expect(checkNickname('Mei٣')).toBe('digits');
  });

  it('generates distinct, clean names that fit 20 characters', () => {
    const all = allGeneratedNames();
    expect(all.length).toBeGreaterThan(500);
    for (const n of all) {
      expect(n.length).toBeLessThanOrEqual(20);
      expect(isBlocked(n)).toBe(false);
    }
    const picks = generateNames(3, mulberry32(3));
    expect(new Set(picks).size).toBe(3);
    for (const p of picks) expect(all).toContain(p);
  });
});

describe('rotation', () => {
  const r = ['a', 'b', 'c', 'd'];
  it('rotates the main phone each stage and wraps (§3.5.2)', () => {
    // Player 1 (the IC) opens with the prologue and plays the finale; stages 1–4 start from P2.
    expect([0, 1, 2, 3, 4, 5].map((s) => mainFor(s as 1, r))).toEqual(['a', 'b', 'c', 'd', 'a', 'a']);
    expect([0, 1, 2, 3, 4, 5].map((s) => mainFor(s as 1, ['a', 'b', 'c']))).toEqual(['a', 'b', 'c', 'a', 'b', 'a']);
    expect([0, 1, 2, 3, 4, 5].map((s) => mainFor(s as 1, ['a', 'b']))).toEqual(['a', 'b', 'a', 'b', 'a', 'a']);
    expect(nominalMainIndex(0, 3)).toBe(0);
  });

  it('a takeover beats the rotation for that stage only', () => {
    expect(mainFor(2, r, { 2: 'd' })).toBe('d');
    expect(mainFor(3, r, { 2: 'd' })).toBe('d');
    expect(mainFor(1, r, { 2: 'd' })).toBe('b');
  });

  it('lists the stages each member leads (lobby)', () => {
    expect(stagesLedBy(0, 3)).toEqual([3, 5]);
    expect(stagesLedBy(1, 3)).toEqual([1, 4]);
    expect(stagesLedBy(2, 3)).toEqual([2]);
    expect(stagesLedBy(0, 2)).toEqual([2, 4, 5]);
    expect(stagesLedBy(1, 2)).toEqual([1, 3]);
    expect([0, 1, 2, 3].map((i) => stagesLedBy(i, 4))).toEqual([[4, 5], [1], [2], [3]]);
  });

  it('orders supports after the main phone and skips the gone', () => {
    expect(supportsFor(r, 'b')).toEqual(['c', 'd', 'a']);
    expect(supportsFor(r, 'b', (id) => id === 'd')).toEqual(['c', 'a']);
    expect(nextMainCandidate(r, 'b', (id) => id !== 'c')).toBe('d');
    expect(nextMainCandidate(r, 'd', () => true)).toBe('a');
    expect(nextMainCandidate(['a', 'b'], 'a', () => false)).toBeNull();
  });

  it('deals support cards: all to one support, one each to 2–3', () => {
    const cards = ['rulebook', 'scanner', 'fixkit'];
    expect(dealCards(cards, 1, 0)).toEqual(cards);
    expect(dealCards(cards, 3, 0)).toEqual(['rulebook']);
    expect(dealCards(cards, 3, 2)).toEqual(['fixkit']);
    expect(dealCards(cards, 2, 0)).toEqual(['rulebook', 'fixkit']);
    expect(dealCards(cards, 2, 1)).toEqual(['scanner']);
    // More phones than cards: share, so nobody is idle.
    expect(dealCards(['a', 'b'], 3, 2)).toEqual(['a']);
    expect(dealCards(cards, 2, null)).toEqual([]);
    expect(dealCards([], 2, 0)).toEqual([]);
  });

  it('moves and shuffles members', () => {
    expect(moveMember(r, 1, -1)).toEqual(['b', 'a', 'c', 'd']);
    expect(moveMember(r, 3, 1)).toEqual(r);
    const s = shuffled(r, mulberry32(9));
    expect([...s].sort()).toEqual(r);
  });
});

describe('protocol validation', () => {
  const base = { p: PROTOCOL, from: 'member-1', sid: null };
  it('accepts well-formed messages', () => {
    expect(parseMessage({ ...base, t: 'hello', join: true })?.t).toBe('hello');
    expect(parseMessage({ ...base, t: 'put', e: { k: 't:s1.rules', v: 3, by: 'member-1', d: { a: 1 } } })?.t).toBe('put');
    expect(parseMessage({ ...base, t: 'act', id: 'x1', type: 'boost_server', d: 2 })?.t).toBe('act');
  });

  it('rejects junk, unknown keys, bad ids and oversized messages', () => {
    expect(parseMessage(null)).toBeNull();
    expect(parseMessage('hello')).toBeNull();
    expect(parseMessage({ ...base, t: 'nope' })).toBeNull();
    expect(parseMessage({ ...base, p: 99, t: 'beat' })).toBeNull();
    expect(parseMessage({ ...base, from: 'x', t: 'beat' })).toBeNull();
    expect(parseMessage({ ...base, t: 'put', e: { k: 'scores', v: 1, by: 'member-1', d: 1 } })).toBeNull();
    expect(parseMessage({ ...base, t: 'act', id: 'x', type: 'has spaces' })).toBeNull();
    expect(parseMessage({ ...base, t: 'act', id: 'x', type: 'a', d: 'x'.repeat(5000) })).toBeNull();
    expect(parseMessage({ ...base, t: 'sync', es: [], pad: 'x'.repeat(MAX_MESSAGE_CHARS) })).toBeNull();
  });

  it('validates replicated values per key', () => {
    expect(parseEntryData('run', { stage: 9 })).toBeUndefined();
    expect(parseEntryData('session', { sid: 'nope' })).toBeUndefined();
    expect(parseEntryData('result', { kind: 'ok', id: 3, rankToday: 2 })).toEqual({ kind: 'ok', id: 3, rankToday: 2 });
    expect(parseEntryData('ov:2', 'member-2')).toBe('member-2');
    expect(parseEntryData('ov:2', 5)).toBeUndefined();
    expect(parseEntryData('t:big', 'x'.repeat(5000))).toBeUndefined();
  });

  it('orders versions with a member-id tie-break', () => {
    expect(newer({ v: 2, by: 'a' }, { v: 1, by: 'z' })).toBe(true);
    expect(newer({ v: 1, by: 'b' }, { v: 1, by: 'a' })).toBe(true);
    expect(newer({ v: 1, by: 'a' }, { v: 1, by: 'b' })).toBe(false);
    expect(newer({ v: 0, by: 'a' }, undefined)).toBe(true);
  });

  it('keeps only valid presence, one per member', () => {
    const list = parsePresence([{ id: 'member-1', nick: ' Ann ' }, { id: 'member-1', nick: 'Ann' }, { id: 'x', nick: 'Bad' }, { nick: 'none' }, 7]);
    expect(list).toEqual([{ id: 'member-1', nick: 'Ann' }]);
  });
});
