import { ThemeId } from '../types/calendar';

let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioCtx) return null;

  if (!sharedAudioCtx) {
    sharedAudioCtx = new AudioCtx();
  }
  return sharedAudioCtx;
}

export function unlockAudioOnFirstInteraction(): void {
  if (typeof window === 'undefined') return;

  const unlock = () => {
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };

  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock, { passive: true });
}

export async function playReminderChime(theme: ThemeId = 'winter'): Promise<void> {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    const now = ctx.currentTime;

    // Choose harmonic notes tuned to the active theme
    let notes: number[] = [587.33, 739.99, 880.0, 1174.66]; // D5 - F#5 - A5 - D6
    let waveType: OscillatorType = 'sine';

    if (theme === 'ooo') {
      // Energetic tri-medal fanfare interval: G5 - B5 - D6
      notes = [783.99, 987.77, 1174.66];
      waveType = 'triangle';
    } else if (theme === 'wednesday') {
      // Gothic minor bell chord: D5 - F5 - A5 - D6
      notes = [587.33, 698.46, 880.0, 1174.66];
      waveType = 'triangle';
    } else if (theme === 'spring') {
      notes = [659.25, 830.61, 987.77, 1318.51]; // E major bright blossom chime
    } else if (theme === 'summer') {
      notes = [523.25, 659.25, 783.99, 1046.5]; // C major bright chime
    } else if (theme === 'autumn') {
      notes = [440.0, 554.37, 659.25, 880.0]; // Warm A major chime
    }

    notes.forEach((freq, idx) => {
      const startTime = now + idx * 0.11;
      const duration = 0.65;

      const osc = ctx.createOscillator();
      const harmonic = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = waveType;
      osc.frequency.setValueAtTime(freq, startTime);

      harmonic.type = 'sine';
      harmonic.frequency.setValueAtTime(freq * 2, startTime);

      const harmonicGain = ctx.createGain();
      harmonicGain.gain.setValueAtTime(0.05, startTime);

      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.exponentialRampToValueAtTime(0.18, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

      osc.connect(gain);
      harmonic.connect(harmonicGain);
      harmonicGain.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      harmonic.start(startTime);
      osc.stop(startTime + duration + 0.05);
      harmonic.stop(startTime + duration + 0.05);
    });
  } catch {
    // Gracefully ignore if browser audio is blocked prior to user interaction
  }
}
