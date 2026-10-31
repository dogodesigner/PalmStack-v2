import { AUDIO } from "./config.js";

// The existing short effects use Web Audio. A buffered victory tone also makes
// pause/resume work before a final recording has been selected.
export class SoundBank {
  constructor(enabled = true, { onWinChange = () => {}, onNotice = () => {} } = {}) {
    this.enabled = enabled;
    this.onWinChange = onWinChange;
    this.onNotice = onNotice;
    this.context = null;
    this.master = null;
    this.buffers = new Map();
    this.sources = new Set();
    this.loading = false;
    this.winState = "idle";
    this.winBuffer = null;
    this.winSource = null;
    this.winGain = null;
    this.winOffset = 0;
    this.winStartedAt = 0;
    this.winDuration = 0;
    this.winRequest = 0;
    this.winLoadWarning = "";
  }

  unlock() {
    if (!this.enabled) return Promise.resolve(false);
    try {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) return Promise.resolve(false);
      if (!this.context) {
        this.context = new Context();
        this.master = this.context.createGain();
        this.master.gain.value = AUDIO.volume;
        this.master.connect(this.context.destination);
      }
      if (!this.loading) {
        this.loading = true;
        for (const [kind, path] of Object.entries(AUDIO.files)) {
          if (!path) continue;
          void fetch(path).then((response) => {
            if (!response.ok) throw new Error("Audio file unavailable");
            return response.arrayBuffer();
          }).then((bytes) => this.context.decodeAudioData(bytes))
            .then((buffer) => this.buffers.set(kind, buffer))
            .catch(() => {
              if (kind === "win") {
                this.winLoadWarning = "تعذّر تحميل المقطع المحدد. نغمة الفوز البديلة متاحة.";
                if (this.winState !== "idle") this.onNotice(this.winLoadWarning);
              }
            });
        }
      }
      if (this.context.state === "running") return Promise.resolve(true);
      return this.context.resume().then(() => this.context.state === "running").catch(() => false);
    } catch { return Promise.resolve(false); }
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    // Mute changes gain only: the victory track keeps its playback position.
    if (this.master) this.master.gain.value = this.enabled ? AUDIO.volume : 0;
    if (this.enabled) void this.unlock();
    this.onWinChange(this.winState);
  }

  detachWin() {
    const source = this.winSource;
    this.winSource = null;
    if (source) {
      source.onended = null;
      this.sources.delete(source);
      try { source.stop(); } catch { /* Already ended. */ }
      source.disconnect();
    }
    this.winGain?.disconnect();
    this.winGain = null;
  }

  stopAll() {
    // Invalidate a pending resume before stopping sources, including on reset.
    this.winRequest++;
    this.detachWin();
    this.winOffset = 0;
    this.winBuffer = null;
    this.winState = "idle";
    this.stopEffects();
    this.onWinChange(this.winState);
  }

  stopEffects() {
    for (const source of [...this.sources]) {
      if (source === this.winSource) continue;
      try { source.stop(); } catch { /* Already ended. */ }
      source.disconnect();
      this.sources.delete(source);
    }
  }

  pauseWin() {
    this.winRequest++;
    if (this.winState === "playing") {
      this.winOffset = Math.min(this.winDuration,
        this.winOffset + Math.max(0, this.context.currentTime - this.winStartedAt));
      this.detachWin();
    } else if (this.winState !== "loading") return;
    this.winState = "paused";
    this.onWinChange(this.winState);
  }

  pauseForVisibility() {
    this.pauseWin();
    this.stopEffects();
  }

  createWinTone() {
    const sampleRate = 22050;
    const duration = 2.4;
    const buffer = this.context.createBuffer(1, Math.ceil(sampleRate * duration), sampleRate);
    const samples = buffer.getChannelData(0);
    const notes = [[523.25, 0], [659.25, 0.19], [783.99, 0.38], [1046.5, 0.65]];
    for (let i = 0; i < samples.length; i++) {
      const time = i / sampleRate;
      let value = 0;
      for (const [frequency, onset] of notes) {
        const t = time - onset;
        if (t < 0) continue;
        const envelope = Math.min(1, t / 0.008) * Math.exp(-3.6 * t);
        value += 0.25 * envelope * (Math.sin(2 * Math.PI * frequency * t)
          + 0.18 * Math.sin(2 * Math.PI * frequency * 2 * t));
      }
      samples[i] = value * Math.min(1, (duration - time) / 0.12);
    }
    return buffer;
  }

  async playWin() {
    if (!this.enabled || document.hidden || ["playing", "loading"].includes(this.winState)) return false;
    const previous = this.winState;
    const request = ++this.winRequest;
    this.winState = "loading";
    this.onWinChange(this.winState);
    try {
      const ready = await this.unlock();
      if (request !== this.winRequest) return false;
      if (!this.enabled || document.hidden) {
        this.winState = "paused";
        this.onWinChange(this.winState);
        return false;
      }
      if (!ready) throw new Error("Audio context unavailable or blocked");
      if (previous !== "paused") {
        this.winOffset = 0;
        this.winBuffer = this.buffers.get("win") || this.createWinTone();
      }
      this.winBuffer ||= this.buffers.get("win") || this.createWinTone();
      this.winDuration = Math.min(this.winBuffer.duration, AUDIO.maxWinSeconds);
      if (this.winOffset >= this.winDuration) this.winOffset = 0;
      const source = this.context.createBufferSource();
      const gain = this.context.createGain();
      const start = this.context.currentTime;
      const remaining = this.winDuration - this.winOffset;
      source.buffer = this.winBuffer;
      source.connect(gain);
      gain.connect(this.master);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.7, start + Math.min(0.015, remaining / 4));
      gain.gain.setValueAtTime(0.7, start + Math.max(remaining / 2, remaining - 0.18));
      gain.gain.linearRampToValueAtTime(0, start + remaining);
      this.winSource = source;
      this.winGain = gain;
      this.winStartedAt = start;
      this.sources.add(source);
      source.onended = () => {
        if (this.winSource !== source) return;
        this.sources.delete(source);
        source.disconnect();
        gain.disconnect();
        this.winSource = this.winGain = null;
        this.winOffset = 0;
        this.winState = "ended";
        this.onWinChange(this.winState);
      };
      source.start(start, this.winOffset, remaining);
      this.winState = "playing";
      this.onNotice(this.winLoadWarning);
      this.onWinChange(this.winState);
      return true;
    } catch {
      if (request !== this.winRequest) return false;
      this.detachWin();
      this.winState = "error";
      this.onNotice("تعذّر تشغيل صوت الفوز. اضغط تشغيل للمحاولة مجددًا، أو تابع اللعب بدون صوت.");
      this.onWinChange(this.winState);
      return false;
    }
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
    if (kind === "win") return this.playWin();
    if (!this.enabled || document.hidden || this.context?.state !== "running") return;
    try {
      const buffer = this.buffers.get(kind);
      if (buffer) {
        const source = this.context.createBufferSource();
        const gain = this.context.createGain();
        const duration = Math.min(buffer.duration, 2);
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
      if (kind === "lose") {
        this.tone(392, 0, 0.22, 0.2);
        this.tone(293.66, 0.18, 0.35, 0.18);
      }
      if (kind === "draw") {
        this.tone(440, 0, 0.16, 0.18);
        this.tone(440, 0.2, 0.2, 0.18);
      }
    } catch { /* A short sound failure must not interrupt a turn. */ }
  }
}
