import type { GroupSnapshot } from './engine';
import { deriveView, nextMain } from './hooks';
import { IDLE } from './store';

const session = {
  sid: '00000000-0000-4000-8000-000000000001',
  code: 'K7QM',
  name: 'Bold Merlion',
  mode: 'booth' as const,
  leaderId: 'member-a',
  rotation: ['member-a', 'member-b', 'member-c'],
  status: 'playing' as const,
  createdAt: 0,
  startedAt: 1,
  sizeAtStart: 3,
  token: '00000000-0000-4000-8000-000000000002',
};

const snap = (over: Partial<GroupSnapshot>): GroupSnapshot => ({
  ...IDLE,
  status: 'playing',
  session,
  meId: 'member-c',
  myNick: 'Cai',
  connected: true,
  stage: 2,
  mainId: 'member-b',
  people: {
    'member-a': { id: 'member-a', nick: 'Ann', present: true, lostSince: null },
    'member-b': { id: 'member-b', nick: 'Ben', present: true, lostSince: null },
    'member-c': { id: 'member-c', nick: 'Cai', present: true, lostSince: null },
  },
  ...over,
});

describe('group view', () => {
  it('derives main, supports in rotation order and my support index', () => {
    const v = deriveView(snap({}));
    expect(v.active).toBe(true);
    expect(v.role).toBe('member');
    expect(v.main?.nick).toBe('Ben');
    expect(v.amMain).toBe(false);
    expect(v.supports.map((m) => m.nick)).toEqual(['Cai', 'Ann']);
    expect(v.mySupportIndex).toBe(0);
    expect(v.supportCount).toBe(2);
  });

  it('leaves out teammates gone 30 s+, and shows the pause while the main phone is missing', () => {
    const v = deriveView(snap({ gone: ['member-a'], mainLostSince: 123 }));
    expect(v.supports.map((m) => m.nick)).toEqual(['Cai']);
    expect(v.paused).toEqual({ name: 'Ben', since: 123 });
  });

  it('names teammates not seen since a reload "Player n"', () => {
    const v = deriveView(snap({ people: { 'member-c': { id: 'member-c', nick: 'Cai', present: true, lostSince: null } } }));
    expect(v.members.map((m) => m.nick)).toEqual(['Player 1', 'Player 2', 'Cai']);
  });

  it('fakePeers: this phone plays a bot’s turn and can preview a support view', () => {
    expect(deriveView(snap({}), ['member-b']).amMain).toBe(true);
    const preview = deriveView(snap({}), ['member-b'], 1);
    expect(preview.amMain).toBe(false);
    expect(preview.mySupportIndex).toBe(1);
  });

  it('names the next main phone for the hand-off, skipping someone missing 20 s+', () => {
    const v = deriveView(snap({}));
    expect(nextMain(v, 2)).toEqual({ nextName: 'Cai', nextId: 'member-c', nextIsMe: true });
    expect(nextMain(v, 4).nextName).toBe('Ann'); // finale = rotation[0], the IC
    const lost = deriveView(
      snap({ people: { ...snap({}).people, 'member-a': { id: 'member-a', nick: 'Ann', present: false, lostSince: 0 } } }),
    );
    expect(nextMain(lost, 3, 60_000).nextName).toBe('Ben');
    expect(nextMain(deriveView({ ...IDLE }), 1)).toEqual({ nextId: null, nextIsMe: false });
  });
});
