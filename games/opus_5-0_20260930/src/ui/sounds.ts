/**
 * Every sound is synthesised with the Web Audio API, so the game ships no audio
 * files and works offline. The context is created lazily on the first gesture,
 * which is what browsers require before audio may start.
 */

export type SoundName = "move" | "capture" | "castle" | "check" | "promote" | "end" | "illegal";

interface Tone {
  frequency: number;
  /** Seconds from the start of the sound. */
  at: number;
  duration: number;
  gain: number;
  type: OscillatorType;
  /** Falling pitch adds weight to the thock of a piece landing. */
  bend?: number;
}

interface Recipe {
  tones: Tone[];
  /** A short filtered noise burst, for the click of wood on wood. */
  noise?: { at: number; duration: number; gain: number; cutoff: number };
}

const RECIPES: Record<SoundName, Recipe> = {
  move: {
    tones: [{ frequency: 210, at: 0, duration: 0.11, gain: 0.32, type: "sine", bend: 120 }],
    noise: { at: 0, duration: 0.035, gain: 0.16, cutoff: 2600 },
  },
  capture: {
    tones: [
      { frequency: 150, at: 0, duration: 0.16, gain: 0.36, type: "sine", bend: 70 },
      { frequency: 96, at: 0.01, duration: 0.2, gain: 0.22, type: "triangle", bend: 50 },
    ],
    noise: { at: 0, duration: 0.09, gain: 0.3, cutoff: 1500 },
  },
  castle: {
    tones: [
      { frequency: 200, at: 0, duration: 0.1, gain: 0.28, type: "sine", bend: 110 },
      { frequency: 200, at: 0.1, duration: 0.12, gain: 0.28, type: "sine", bend: 110 },
    ],
    noise: { at: 0.1, duration: 0.04, gain: 0.14, cutoff: 2400 },
  },
  check: {
    tones: [
      { frequency: 784, at: 0, duration: 0.1, gain: 0.2, type: "triangle" },
      { frequency: 1175, at: 0.09, duration: 0.16, gain: 0.2, type: "triangle" },
    ],
  },
  promote: {
    tones: [
      { frequency: 523, at: 0, duration: 0.1, gain: 0.18, type: "triangle" },
      { frequency: 659, at: 0.08, duration: 0.1, gain: 0.18, type: "triangle" },
      { frequency: 988, at: 0.16, duration: 0.24, gain: 0.2, type: "triangle" },
    ],
  },
  end: {
    tones: [
      { frequency: 523, at: 0, duration: 0.22, gain: 0.2, type: "sine" },
      { frequency: 415, at: 0.16, duration: 0.24, gain: 0.2, type: "sine" },
      { frequency: 311, at: 0.34, duration: 0.5, gain: 0.22, type: "sine" },
    ],
  },
  illegal: {
    tones: [{ frequency: 118, at: 0, duration: 0.14, gain: 0.26, type: "sawtooth", bend: 30 }],
  },
};

export class SoundBoard {
  private context: AudioContext | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  enabled = true;

  /** Safe to call from any gesture handler; a blocked context simply stays null. */
  private ensureContext(): AudioContext | null {
    if (!this.enabled) return null;
    if (!this.context) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      try {
        this.context = new Ctor();
      } catch {
        return null;
      }
    }
    if (this.context.state === "suspended") void this.context.resume();
    return this.context;
  }

  private ensureNoise(context: AudioContext): AudioBuffer {
    if (!this.noiseBuffer) {
      const length = Math.floor(context.sampleRate * 0.25);
      const buffer = context.createBuffer(1, length, context.sampleRate);
      const channel = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) channel[i] = Math.random() * 2 - 1;
      this.noiseBuffer = buffer;
    }
    return this.noiseBuffer;
  }

  play(name: SoundName): void {
    const context = this.ensureContext();
    if (!context) return;
    const recipe = RECIPES[name];
    const now = context.currentTime + 0.001;

    for (const tone of recipe.tones) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = tone.type;
      const start = now + tone.at;
      const end = start + tone.duration;
      oscillator.frequency.setValueAtTime(tone.frequency, start);
      if (tone.bend) {
        oscillator.frequency.exponentialRampToValueAtTime(
          Math.max(30, tone.frequency - tone.bend),
          end,
        );
      }
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(tone.gain, start + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start);
      oscillator.stop(end + 0.02);
    }

    if (recipe.noise) {
      const source = context.createBufferSource();
      source.buffer = this.ensureNoise(context);
      const filter = context.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = recipe.noise.cutoff;
      const gain = context.createGain();
      const start = now + recipe.noise.at;
      const end = start + recipe.noise.duration;
      gain.gain.setValueAtTime(recipe.noise.gain, start);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      source.connect(filter).connect(gain).connect(context.destination);
      source.start(start);
      source.stop(end + 0.02);
    }
  }
}
