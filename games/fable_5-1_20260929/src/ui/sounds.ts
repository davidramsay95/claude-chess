export type SoundKind = "move" | "capture" | "check" | "end";

export interface Sounds {
  play(kind: SoundKind): void;
  setMuted(muted: boolean): void;
  isMuted(): boolean;
}

interface Note {
  frequency: number;
  start: number;
  duration: number;
  type: OscillatorType;
  gain: number;
}

const NOTES: Record<SoundKind, Note[]> = {
  move: [{ frequency: 420, start: 0, duration: 0.07, type: "sine", gain: 0.25 }],
  capture: [
    { frequency: 180, start: 0, duration: 0.12, type: "triangle", gain: 0.35 },
    { frequency: 120, start: 0.02, duration: 0.14, type: "sine", gain: 0.3 },
  ],
  check: [
    { frequency: 660, start: 0, duration: 0.09, type: "square", gain: 0.12 },
    { frequency: 880, start: 0.11, duration: 0.12, type: "square", gain: 0.12 },
  ],
  end: [
    { frequency: 392, start: 0, duration: 0.5, type: "triangle", gain: 0.18 },
    { frequency: 494, start: 0, duration: 0.5, type: "triangle", gain: 0.15 },
    { frequency: 587, start: 0.05, duration: 0.55, type: "triangle", gain: 0.15 },
  ],
};

type AudioContextConstructor = new () => AudioContext;

const audioContextConstructor = (): AudioContextConstructor | null => {
  const candidate = (globalThis as { AudioContext?: AudioContextConstructor }).AudioContext;
  return candidate ?? null;
};

/** Short synthesised cues. The AudioContext is created on the first play, which browsers require to follow a user gesture. */
export const createSounds = (): Sounds => {
  let context: AudioContext | null = null;
  let muted = false;
  let unavailable = false;

  const ensureContext = (): AudioContext | null => {
    if (context) return context;
    if (unavailable) return null;
    const Ctor = audioContextConstructor();
    if (!Ctor) {
      unavailable = true;
      return null;
    }
    try {
      context = new Ctor();
    } catch {
      unavailable = true;
      return null;
    }
    return context;
  };

  const schedule = (ctx: AudioContext, note: Note): void => {
    const oscillator = ctx.createOscillator();
    const amp = ctx.createGain();
    const at = ctx.currentTime + note.start;
    oscillator.type = note.type;
    oscillator.frequency.setValueAtTime(note.frequency, at);
    amp.gain.setValueAtTime(0.0001, at);
    amp.gain.exponentialRampToValueAtTime(note.gain, at + 0.008);
    amp.gain.exponentialRampToValueAtTime(0.0001, at + note.duration);
    oscillator.connect(amp);
    amp.connect(ctx.destination);
    oscillator.start(at);
    oscillator.stop(at + note.duration + 0.02);
  };

  return {
    play: (kind: SoundKind): void => {
      if (muted) return;
      const ctx = ensureContext();
      if (!ctx) return;
      try {
        if (ctx.state === "suspended") void ctx.resume();
        for (const note of NOTES[kind]) schedule(ctx, note);
      } catch (error) {
        console.error("Sound playback failed", error);
      }
    },
    setMuted: (value: boolean): void => {
      muted = value;
    },
    isMuted: (): boolean => muted,
  };
};
