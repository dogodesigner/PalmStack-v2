import { AUDIO } from "./config.js";

export class SoundBank {
  constructor(enabled = true) {
    this.enabled = enabled;
    this.context = null;
    this.master = null;
    this.buffers = new Map();
    this.sources = new Set();
    this.loading = false;
  }

  unlock() {
    if (!this.enabled) return;
    try {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) return;
      if (!this.context) {
        this.context = new Context();
        this.master = this.context.createGain();
        this.master.gain.value = AUDIO.volume;
        this.master.connect(this.context.destination);
      }
      if (this.context.state === "suspended") void this.context.resume().catch(() => {});
      if (!this.loading) {
        this.loading = true;
        for (const [kind, path] of Object.entries(AUDIO.files)) {
          if (!path) continue;
          void fetch(path).then((response) => {
            if (!response.ok) throw new Error("Audio file unavailable");
            return response.arrayBuffer();
          }).then((bytes) => this.context.decodeAudioData(bytes))
            .then((buffer) => this.buffers.set(kind, buffer))
            .catch(() => {}); // Keep the built-in tone if a custom file is missing.
        }
      }
    } catch { /* Audio support must never prevent a game. */ }
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) this.stopAll();
    else this.unlock();
  }

  stopAll() {
    for (const source of this.sources) {
      try { source.stop(); } catch { /* Already ended. */ }
      source.disconnect();
    }
    this.sources.clear();
  }

  track(source, gain) {
    this.sources.add(source);
    source.onended = () => {
      this.sources.delete(source);
      source.disconnect();
      gain.disconnect();
    };
  }

  tone(frequency, delay, duration, volume, endFrequency = frequency) {
    const context = this.context;
    const start = context.currentTime + delay;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(endFrequency, start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(this.master);
    this.track(oscillator, gain);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  play(kind) {
    if (!this.enabled || document.hidden || this.context?.state !== "running") return;
    try {
      const buffer = this.buffers.get(kind);
      if (buffer) {
        const source = this.context.createBufferSource();
        const gain = this.context.createGain();
        const limit = kind === "win" ? AUDIO.maxWinSeconds : 2;
        const duration = Math.min(buffer.duration, limit);
        const start = this.context.currentTime;
        source.buffer = buffer;
        source.connect(gain);
        gain.connect(this.master);
        gain.gain.setValueAtTime(0.7, start);
        gain.gain.setValueAtTime(0.7, start + Math.max(0, duration - 0.3));
        gain.gain.linearRampToValueAtTime(0, start + duration);
        this.track(source, gain);
        source.start(start, 0, duration);
        return;
      }
      if (kind === "click") this.tone(640, 0, 0.045, 0.16, 480);
      if (kind === "drop") {
        this.tone(420, 0, 0.085, 0.45, 130);
        this.tone(760, 0.015, 0.07, 0.12, 390);
      }
      if (kind === "win") {
        [523.25, 659.25, 783.99, 1046.5].forEach((note, index) => {
          this.tone(note, index * 0.12, 0.4, 0.22);
        });
      }
      if (kind === "lose") {
        this.tone(392, 0, 0.22, 0.2);
        this.tone(293.66, 0.18, 0.35, 0.18);
      }
      if (kind === "draw") {
        this.tone(440, 0, 0.16, 0.18);
        this.tone(440, 0.2, 0.2, 0.18);
      }
    } catch { /* A sound failure must not interrupt the turn. */ }
  }
}
