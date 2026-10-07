import { gameUrl, isHostPath, parseParams } from './params';

describe('parseParams', () => {
  it('returns defaults for an empty query', () => {
    expect(parseParams('')).toEqual({ mode: null, debug: false, stage: null, relaxed: false, fakePeers: 0, join: null });
  });

  it('treats quick as an alias of booth', () => {
    expect(parseParams('?mode=quick').mode).toBe('booth');
    expect(parseParams('?mode=booth').mode).toBe('booth');
    expect(parseParams('?mode=full').mode).toBe('full');
    expect(parseParams('?mode=turbo').mode).toBeNull();
  });

  it('accepts stages 0–5 only', () => {
    expect(parseParams('?stage=3').stage).toBe(3);
    expect(parseParams('?stage=0').stage).toBe(0);
    expect(parseParams('?stage=6').stage).toBeNull();
    expect(parseParams('?stage=2.5').stage).toBeNull();
    expect(parseParams('?stage=').stage).toBeNull();
  });

  it('reads debug, relaxed and clamps fakePeers to 0–3', () => {
    const p = parseParams('?debug=1&relaxed=true&fakePeers=9');
    expect(p.debug).toBe(true);
    expect(p.relaxed).toBe(true);
    expect(p.fakePeers).toBe(3);
  });
});

describe('isHostPath', () => {
  it('matches /host with or without a trailing slash', () => {
    expect(isHostPath('/host')).toBe(true);
    expect(isHostPath('/host/')).toBe(true);
    expect(isHostPath('/')).toBe(false);
    expect(isHostPath('/hosting')).toBe(false);
    expect(isHostPath('/x/host')).toBe(false);
  });

  it('respects a deploy sub-path', () => {
    expect(isHostPath('/ship-it/host', '/ship-it/')).toBe(true);
    expect(isHostPath('/host', '/ship-it/')).toBe(false);
  });
});

describe('gameUrl', () => {
  it('links to the game root and passes ?mode= through', () => {
    expect(gameUrl('https://game.example', '/', null)).toBe('https://game.example/');
    expect(gameUrl('https://game.example', '/', 'full')).toBe('https://game.example/?mode=full');
    expect(gameUrl('https://game.example', '/ship-it/', 'booth')).toBe('https://game.example/ship-it/?mode=booth');
  });

  it('reads a group code from the lobby QR (?join=CODE)', () => {
    expect(parseParams('?join=k7qm').join).toBe('K7QM');
    expect(parseParams('?join=K7Q').join).toBeNull();
    expect(parseParams('?join=K1QM').join).toBeNull(); // 1 is never used in codes
    expect(parseParams('?join=<script>').join).toBeNull();
  });
});
