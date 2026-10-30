// All presentation choices live here, independently of the search algorithm.
export const LEVELS = Object.freeze({
  easy: Object.freeze({ label: "سهل", depth: 2 }),
  medium: Object.freeze({ label: "متوسط", depth: 4 }),
  hard: Object.freeze({ label: "صعب", depth: 6 }),
});

export const DEFAULT_LEVEL = "easy";

export const MEDIA = Object.freeze({
  // Add the agreed images later. Empty paths make no network requests.
  hero: "",
  sideLeft: "",
  sideRight: "",
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
