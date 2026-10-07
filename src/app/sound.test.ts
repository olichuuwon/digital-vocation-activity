import { afterEach, describe, expect, it, vi } from 'vitest';
import { useGame } from '../state/store';
import * as sound from './sound';
import { buzz } from './haptics';

describe('sound (§3.3)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('cues are short, audible and in order', () => {
    for (const cue of Object.values(sound.CUES)) {
      let end = 0;
      for (const [f, start, len] of cue.notes) {
        expect(f).toBeGreaterThan(100);
        expect(f).toBeLessThan(2000);
        expect(start).toBeGreaterThanOrEqual(end - 1e-9);
        end = start + len;
      }
      expect(end).toBeLessThanOrEqual(0.4);
    }
  });

  it('plays only when sound is on in Settings (off by default)', () => {
    const play = vi.spyOn(sound, 'playCue').mockImplementation(() => {});
    expect(useGame.getState().settings.sound).toBe(false);
    buzz('success');
    expect(play).not.toHaveBeenCalled();
    useGame.getState().updateSettings({ sound: true });
    buzz('error');
    expect(play).toHaveBeenCalledWith('error');
    useGame.getState().updateSettings({ sound: false });
  });
});
