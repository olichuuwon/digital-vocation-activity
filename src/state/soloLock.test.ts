import { isSoloPhrase } from './soloLock';

it('accepts play-solo whatever the case or outer spaces, nothing else', () => {
  for (const ok of ['play-solo', ' Play-Solo ', 'PLAY-SOLO']) expect(isSoloPhrase(ok)).toBe(true);
  for (const no of ['', 'play solo', 'playsolo', 'play-solo!']) expect(isSoloPhrase(no)).toBe(false);
});
