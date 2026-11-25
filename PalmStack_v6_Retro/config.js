// All presentation choices live here, independently of the search algorithm.
export const LEVELS = Object.freeze({
  easy: Object.freeze({ label: "بسيط", depth: 1 }),
  medium: Object.freeze({ label: "وسط", depth: 4 }),
  hard: Object.freeze({ label: "مستحيل", depth: 6 }),
});

export const DEFAULT_LEVEL = "easy";

export const MEDIA = Object.freeze({
  // Original transparent artwork. Keep relative paths for GitHub Pages.
  hero: "./assets/globe.png",
  sideLeft: "./assets/corner-pattern.png",
  sideRight: "./assets/corner-pattern.png",
  signature: "./assets/signature.png",
});

export const AUDIO = Object.freeze({
  volume: 0.32,
  maxWinSeconds: 8,
  // Missing or empty paths retain the synthesized fallback.
  files: Object.freeze({click: "./assets/audio/click.wav",move: "./assets/audio/move.wav",drop: "./assets/audio/drop.wav",impact: "./assets/audio/impact.wav",win: "./assets/audio/win.wav",lose: "./assets/audio/lose.wav",draw: "./assets/audio/draw.wav",start: "./assets/audio/start.wav"}),
});

export const COPY = Object.freeze({
  humanWin: "تستاهلين الورد!",
  humanWinMessage: "غلبتِ الكمبيوتر!",
  computerWin: "الجولة للكمبيوتر",
  computerWinMessage: "جربي مرة ثانية!",
  draw: "تعادل… التحدّي متقارب!",
  drawMessage: "جولة جديدة؟",
});
