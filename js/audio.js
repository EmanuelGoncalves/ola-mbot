const VOLUME = 0.12;
const FADE_SECONDS = 0.03;

/** Plays the on-screen robot's notes: short, soft tones. */
export class Beeper {
  enabled = true;
  #context = null;

  /** Browsers only allow sound after a tap, so call this from one. */
  unlock() {
    try {
      this.#open();
    } catch {
      // No sound available here; the robot stays quiet.
    }
  }

  play(hz, ms) {
    if (!this.enabled) return;
    try {
      const context = this.#open();
      const start = context.currentTime;
      const end = start + ms / 1000;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'triangle';
      oscillator.frequency.value = hz;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(VOLUME, start + FADE_SECONDS);
      gain.gain.setValueAtTime(VOLUME, Math.max(start + FADE_SECONDS, end - FADE_SECONDS));
      gain.gain.linearRampToValueAtTime(0, end);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start);
      oscillator.stop(end);
    } catch {
      // No sound available here; the robot stays quiet.
    }
  }

  #open() {
    this.#context ??= new (window.AudioContext ?? window.webkitAudioContext)();
    if (this.#context.state === 'suspended') this.#context.resume();
    return this.#context;
  }
}
