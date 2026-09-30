/**
 * Synthesized sounds via WebAudio; no audio files. Every effect is a couple
 * of oscillators or filtered noise, so the whole soundscape ships as code.
 */
const STORAGE_KEY = "fable_5-0_20260930:sound";

let context: AudioContext | null = null;
let enabled = true;

try {
  enabled = window.localStorage.getItem(STORAGE_KEY) !== "off";
} catch {
  enabled = true;
}

const audio = (): AudioContext | null => {
  if (!enabled) return null;
  if (!context) {
    try {
      context = new AudioContext();
    } catch {
      return null;
    }
  }
  if (context.state === "suspended") {
    void context.resume();
  }
  return context;
};

const tone = (
  ctx: AudioContext,
  frequency: number,
  start: number,
  duration: number,
  volume: number,
  type: OscillatorType = "sine"
): void => {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(volume, start + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.05);
};

/** Short wooden tap for a quiet move. */
export const playMove = (): void => {
  const ctx = audio();
  if (!ctx) return;
  tone(ctx, 520, ctx.currentTime, 0.07, 0.16, "triangle");
  tone(ctx, 190, ctx.currentTime, 0.09, 0.1, "sine");
};

/** Lower thunk for a capture. */
export const playCapture = (): void => {
  const ctx = audio();
  if (!ctx) return;
  tone(ctx, 300, ctx.currentTime, 0.09, 0.2, "triangle");
  tone(ctx, 120, ctx.currentTime + 0.01, 0.14, 0.16, "sine");
};

/** Two rising notes when a king comes under attack. */
export const playCheck = (): void => {
  const ctx = audio();
  if (!ctx) return;
  tone(ctx, 660, ctx.currentTime, 0.1, 0.12, "sine");
  tone(ctx, 880, ctx.currentTime + 0.11, 0.16, 0.12, "sine");
};

/** Small closing motif when the game ends. */
export const playGameEnd = (won: boolean): void => {
  const ctx = audio();
  if (!ctx) return;
  const notes = won ? [523, 659, 784] : [392, 330, 262];
  notes.forEach((frequency, index) => {
    tone(ctx, frequency, ctx.currentTime + index * 0.14, 0.22, 0.12, "sine");
  });
};

export const soundEnabled = (): boolean => enabled;

export const setSoundEnabled = (on: boolean): void => {
  enabled = on;
  try {
    window.localStorage.setItem(STORAGE_KEY, on ? "on" : "off");
  } catch {
    // Preference simply is not persisted when storage is unavailable.
  }
};
