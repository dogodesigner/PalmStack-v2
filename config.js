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
  // An empty path uses a short synthesized sound.
  files: Object.freeze({ click: "", drop: "", win: "", lose: "", draw: "" }),
});

export const COPY = Object.freeze({
  humanWin: "كفو! فوز يرفع الراس",
  humanWinMessage: "أربع قطع على خط واحد… لعبك له بصمة!",
  computerWin: "الجولة للكمبيوتر",
  computerWinMessage: "نقطة له، والتحدّي مستمر. جاهز للجولة الجاية؟",
  draw: "تعادل… التحدّي متقارب!",
  drawMessage: "امتلأت اللوحة. جولة جديدة تحسمها؟",
});
