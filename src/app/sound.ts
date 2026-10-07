/*
 * Optional sound (§3.3): off by default, toggled in Settings. Tones are synthesised with Web Audio,
 * so there are no audio files to download. Pure note data is exported for tests.
 */
export type Cue = 'success' | 'error';

/** [frequency Hz, start s, length s] per note. */
export const CUES: Record<Cue, { wave: OscillatorType; notes: [number, number, number][] }> = {
  success: { wave: 'sine', notes: [[660, 0, 0.08], [880, 0.08, 0.12]] },
  error: { wave: 'triangle', notes: [[220, 0, 0.12], [196, 0.15, 0.16]] },
};

let ctx: AudioContext | null = null;

function context(): AudioContext | null {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx ??= new AC();
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
    return ctx;
  } catch {
    return null;
  }
}

/** Call from a tap (e.g. turning sound on): iOS only lets audio start inside a user gesture. */
export function unlockSound() {
  context();
}

export function playCue(cue: Cue) {
  const ac = context();
  if (!ac) return;
  try {
    const t0 = ac.currentTime + 0.01;
    for (const [f, start, len] of CUES[cue].notes) {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = CUES[cue].wave;
      osc.frequency.value = f;
      // Short attack and release: no clicks, quiet enough for a booth.
      gain.gain.setValueAtTime(0, t0 + start);
      gain.gain.linearRampToValueAtTime(0.08, t0 + start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + start + len);
      osc.connect(gain).connect(ac.destination);
      osc.start(t0 + start);
      osc.stop(t0 + start + len + 0.02);
    }
  } catch {
    /* sound is optional */
  }
}
