import { parseParams } from './params';

describe('parseParams', () => {
  it('returns defaults for an empty query', () => {
    expect(parseParams('')).toEqual({ mode: null, debug: false, stage: null, relaxed: false, fakePeers: 0 });
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
