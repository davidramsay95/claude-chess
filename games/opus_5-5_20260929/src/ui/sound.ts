export type SoundKind = "move" | "capture" | "check" | "end";

const STORAGE_KEY = "opus_5-5_20260929:sound";

/**
 * Synthesised move sounds, so no audio files are shipped. The AudioContext is created lazily
 * on the first sound because browsers only allow audio after a user gesture.
 */
export class SoundPlayer {
  private context: AudioContext | null = null;
  private enabledValue: boolean;

  constructor() {
    this.enabledValue = readStoredPreference();
  }

  get enabled(): boolean {
    return this.enabledValue;
  }

  /** Turns sound on or off and remembers the choice for this browser. */
  setEnabled(enabled: boolean): void {
    this.enabledValue = enabled;
    try {
      localStorage.setItem(STORAGE_KEY, enabled ? "on" : "off");
    } catch (error) {
      console.warn("Sound preference could not be saved", error);
    }
  }

  /** Plays a short cue for the given event. */
  play(kind: SoundKind): void {
    if (!this.enabledValue) return;
    const context = this.ensureContext();
    if (!context) return;
    const start = context.currentTime + 0.01;
    if (kind === "move") this.knock(context, start, 190, 0.09, 0.35);
    if (kind === "capture") {
      this.knock(context, start, 150, 0.12, 0.45);
      this.knock(context, start + 0.05, 240, 0.08, 0.25);
    }
    if (kind === "check") {
      this.knock(context, start, 190, 0.09, 0.3);
      this.tone(context, start + 0.03, 880, 0.18, 0.08);
    }
    if (kind === "end") {
      this.tone(context, start, 523, 0.35, 0.1);
      this.tone(context, start + 0.14, 659, 0.35, 0.1);
      this.tone(context, start + 0.28, 784, 0.5, 0.1);
    }
  }

  private ensureContext(): AudioContext | null {
    if (this.context) return this.context;
    if (typeof AudioContext === "undefined") return null;
    this.context = new AudioContext();
    return this.context;
  }

  /** A wooden knock: a quickly decaying low sine with a pitch drop, like a piece set on a board. */
  private knock(context: AudioContext, start: number, frequency: number, length: number, volume: number): void {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(frequency * 1.6, start);
    oscillator.frequency.exponentialRampToValueAtTime(frequency, start + length * 0.6);
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + length + 0.02);
  }

  private tone(context: AudioContext, start: number, frequency: number, length: number, volume: number): void {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + length + 0.02);
  }
}

const readStoredPreference = (): boolean => {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "off";
  } catch (error) {
    console.warn("Sound preference could not be read", error);
    return true;
  }
};
