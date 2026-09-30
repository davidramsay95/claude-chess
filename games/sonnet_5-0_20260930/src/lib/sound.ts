/**
 * Minimal Web Audio "beep" sound effects — no external audio files. Every
 * call is wrapped so a missing/blocked `AudioContext` (unsupported browser,
 * autoplay policy, test environment) degrades silently rather than throwing.
 */

type SoundKind = "move" | "capture" | "check";

let sharedContext: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioContextClass = window.AudioContext;
  if (!AudioContextClass) return null;
  if (!sharedContext) {
    try {
      sharedContext = new AudioContextClass();
    } catch {
      return null;
    }
  }
  return sharedContext;
}

function beep(frequency: number, durationMs: number, gainValue: number): void {
  const context = getContext();
  if (!context) return;
  try {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.value = gainValue;
    oscillator.connect(gain);
    gain.connect(context.destination);
    const now = context.currentTime;
    gain.gain.setValueAtTime(gainValue, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000);
    oscillator.start(now);
    oscillator.stop(now + durationMs / 1000);
  } catch {
    // Ignore — sound is purely cosmetic.
  }
}

export function playSound(kind: SoundKind): void {
  switch (kind) {
    case "move":
      beep(440, 90, 0.05);
      return;
    case "capture":
      beep(300, 120, 0.07);
      return;
    case "check":
      beep(660, 160, 0.08);
      return;
  }
}
