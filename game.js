import {
  ROWS, COLS, EMPTY, HUMAN, COMPUTER,
  createBoard, getOpenRow, getGameResult, makeMove,
} from "./rules.js";
import { LEVELS, MEDIA, COPY } from "./config.js";
import { cleanName, createStore, RECORDS_KEY } from "./storage.js";
import { SoundBank } from "./audio.js";
import { Celebration } from "./effects.js";

const byId = (id) => document.getElementById(id);
const ui = {
  startScreen: byId("start-screen"), gameScreen: byId("game-screen"),
  form: byId("start-form"), nameInput: byId("player-name"), level: byId("difficulty-select"),
  humanName: byId("human-name"), gameTitle: byId("game-title"), status: byId("turn-status"),
  controls: byId("column-controls"), board: byId("game-board"), shell: byId("board-shell"),
  error: byId("game-error"), result: byId("result-panel"), resultTitle: byId("result-title"),
  resultMessage: byId("result-message"), recordMessage: byId("record-message"),
  newRound: byId("new-round-button"), newPlayer: byId("new-player-button"),
  changeLevel: byId("change-level-button"), sound: byId("sound-toggle"),
  roundLevel: byId("round-level"), moves: byId("move-count"), time: byId("player-time"),
  leaderboard: byId("leaderboard-dialog"), openLeaderboard: byId("leaderboard-button"),
  closeLeaderboard: byId("close-leaderboard"), filterLevel: byId("leaderboard-level"),
  filterStarter: byId("leaderboard-starter"), rows: byId("leaderboard-rows"),
  empty: byId("leaderboard-empty"), table: byId("leaderboard-table-wrap"),
  storageNotice: byId("storage-notice"),
  errorMessage: byId("game-error-message"), retryMove: byId("retry-move-button"),
  winControls: byId("win-audio-controls"), winPlay: byId("win-play-button"),
  winPause: byId("win-pause-button"), winMute: byId("win-mute-button"),
  winStatus: byId("win-audio-status"), audioNotice: byId("audio-notice"),
  mediaNotice: byId("media-notice"), retryMedia: byId("retry-media-button"),
};

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const numbers = new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 1 });
const store = createStore();
const sound = new SoundBank(store.settings.sound, {
  onWinChange: renderWinSound,
  onNotice: (message) => {
    ui.audioNotice.textContent = message;
    ui.audioNotice.hidden = !message;
  },
});
const effects = new Celebration(byId("celebration-layer"), ui.shell, reducedMotion, ui.result, ui.newRound);
const scores = { human: 0, computer: 0, draw: 0 };
const state = {
  board: createBoard(), phase: "start", name: "", level: store.settings.level,
  nextStarter: HUMAN, starter: HUMAN, roundId: 0, requestId: 0,
  moves: 0, thinkingMs: 0, thinkingSince: null, lastHumanColumn: 3,
};
let worker = null;
let workerTimer = null;
let clockTimer = null;
let cancelDrop = null;
let cells = [];
let columnButtons = [];
const failedImages = new Map();
let imageRetry = 0;

function formatTime(milliseconds) {
  const seconds = Math.floor(Math.max(0, milliseconds) / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function elapsedThinking() {
  return state.thinkingMs + (state.thinkingSince === null
    ? 0 : Math.max(0, performance.now() - state.thinkingSince));
}

function renderClock() {
  ui.time.textContent = formatTime(elapsedThinking());
  ui.moves.textContent = numbers.format(state.moves);
}

function startClock() {
  if (state.phase === "human" && !document.hidden && !ui.leaderboard.open &&
      state.thinkingSince === null) state.thinkingSince = performance.now();
}

function stopClock() {
  state.thinkingMs = elapsedThinking();
  state.thinkingSince = null;
  renderClock();
}

function updateScores() {
  for (const [name, value] of Object.entries(scores)) {
    byId(`${name}-score`).textContent = numbers.format(value);
  }
}

function clearStats() {
  for (const name of ["depth", "nodes", "cutoffs", "time"]) byId(`stat-${name}`).textContent = "—";
}

function showStats(stats) {
  byId("stat-depth").textContent = numbers.format(stats.depth);
  byId("stat-nodes").textContent = numbers.format(stats.nodesVisited);
  byId("stat-cutoffs").textContent = numbers.format(stats.cutoffs);
  byId("stat-time").textContent = `${numbers.format(stats.timeMs)} مللي ثانية`;
}

function describeCell(row, col) {
  const value = state.board[row][col];
  const label = value === EMPTY ? "فارغ"
    : value === HUMAN ? "قطعتك الخزامية" : "قطعة الكمبيوتر الذهبية";
  return `الصف ${row + 1} من الأعلى، العمود ${col + 1} من اليسار، ${label}`;
}

function buildBoard() {
  ui.board.replaceChildren();
  ui.controls.replaceChildren();
  cells = [];
  columnButtons = [];
  for (let col = 0; col < COLS; col++) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "column-button";
    button.textContent = numbers.format(col + 1);
    button.addEventListener("click", () => {
      if (state.phase !== "human" || getOpenRow(state.board, col) === -1) return;
      sound.unlock();
      sound.play("click");
      state.lastHumanColumn = col;
      void playMove(col, HUMAN, state.roundId);
    });
    columnButtons.push(button);
    ui.controls.append(button);
  }
  for (let row = 0; row < ROWS; row++) {
    const rowElement = document.createElement("div");
    rowElement.className = "board-row";
    rowElement.setAttribute("role", "row");
    cells[row] = [];
    for (let col = 0; col < COLS; col++) {
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.setAttribute("role", "cell");
      cell.setAttribute("aria-label", describeCell(row, col));
      cells[row].push(cell);
      rowElement.append(cell);
    }
    ui.board.append(rowElement);
  }
}

function updateControls() {
  columnButtons.forEach((button, col) => {
    const full = getOpenRow(state.board, col) === -1;
    button.disabled = state.phase !== "human" || full;
    button.setAttribute("aria-label", full
      ? `العمود ${col + 1} من اليسار ممتلئ`
      : `أسقط قطعتك في العمود ${col + 1} من اليسار`);
  });
}

function stopWorker() {
  clearTimeout(workerTimer);
  workerTimer = null;
  worker?.terminate();
  worker = null;
}

function cancelPendingWork() {
  // Invalidate callbacks before resolving a cancelled drop or worker.
  state.roundId++;
  stopClock();
  clearInterval(clockTimer);
  stopWorker();
  cancelDrop?.();
  effects.clear();
  sound.stopAll();
}

function startRound() {
  cancelPendingWork();
  state.board = createBoard();
  state.starter = state.nextStarter;
  state.nextStarter = state.starter === HUMAN ? COMPUTER : HUMAN;
  state.phase = state.starter === HUMAN ? "human" : "thinking";
  state.moves = 0;
  state.thinkingMs = 0;
  state.lastHumanColumn = 3;
  ui.error.hidden = true;
  ui.errorMessage.textContent = "";
  ui.winControls.hidden = true;
  ui.audioNotice.hidden = true;
  ui.result.hidden = true;
  ui.result.classList.remove("is-human-win");
  ui.recordMessage.textContent = "";
  ui.startScreen.hidden = true;
  ui.gameScreen.hidden = false;
  ui.roundLevel.textContent = LEVELS[state.level].label;
  clearStats();
  buildBoard();
  updateControls();
  renderClock();
  clockTimer = setInterval(renderClock, 1000);
  ui.gameTitle.focus();
  if (state.starter === COMPUTER) requestComputerMove(state.roundId);
  else {
    ui.status.textContent = "دورك — اختر عمودًا لقطعتك الخزامية";
    startClock();
  }
}

function animateDrop(cell, piece) {
  if (reducedMotion.matches) return Promise.resolve();
  const rect = cell.getBoundingClientRect();
  piece.style.setProperty("--drop-from", `${-(rect.top - ui.board.getBoundingClientRect().top + rect.height)}px`);
  return new Promise((resolve) => {
    let timer;
    const finish = () => {
      clearTimeout(timer);
      piece.removeEventListener("animationend", onEnd);
      piece.removeEventListener("animationcancel", onEnd);
      piece.classList.remove("is-dropping");
      if (cancelDrop === finish) cancelDrop = null;
      resolve();
    };
    const onEnd = (event) => {
      if (event.target === piece && event.animationName === "piece-drop") finish();
    };
    cancelDrop = finish;
    piece.addEventListener("animationend", onEnd);
    piece.addEventListener("animationcancel", onEnd);
    timer = setTimeout(finish, 650);
    piece.classList.add("is-dropping");
  });
}

async function playMove(col, player, currentRound) {
  const expectedPhase = player === HUMAN ? "human" : "thinking";
  if (currentRound !== state.roundId || state.phase !== expectedPhase) return;
  const move = makeMove(state.board, col, player);
  if (!move) return;
  stopClock();
  if (player === HUMAN) state.moves++;
  state.phase = "dropping";
  state.board = move.board;
  renderClock();
  updateControls();
  ui.status.textContent = player === HUMAN ? "قطعتك تنزل…" : "قطعة الكمبيوتر تنزل…";
  const cell = cells[move.row][col];
  const piece = document.createElement("span");
  piece.className = `piece piece--${player === HUMAN ? "human" : "computer"}`;
  piece.setAttribute("aria-hidden", "true");
  cell.append(piece);
  cell.setAttribute("aria-label", describeCell(move.row, col));
  await animateDrop(cell, piece);
  if (currentRound !== state.roundId) return;
  sound.play("drop");
  const result = getGameResult(state.board);
  if (result.status !== "playing") { finishRound(result); return; }
  state.phase = player === HUMAN ? "thinking" : "human";
  updateControls();
  if (state.phase === "thinking") requestComputerMove(currentRound);
  else {
    ui.status.textContent = "دورك — اختر عمودًا لقطعتك الخزامية";
    startClock();
    if (!ui.leaderboard.open && (document.activeElement === document.body ||
        columnButtons.includes(document.activeElement))) {
      const button = columnButtons[state.lastHumanColumn];
      const target = button.disabled ? columnButtons.find((item) => !item.disabled) : button;
      target?.focus({ preventScroll: true });
    }
  }
}

function requestComputerMove(currentRound) {
  ui.status.textContent = "الكمبيوتر يفكّر…";
  const currentRequest = ++state.requestId;
  let activeWorker;
  const isCurrent = () => currentRound === state.roundId &&
    worker === activeWorker && state.phase === "thinking";
  const fail = (error) => {
    if (currentRound !== state.roundId || state.phase !== "thinking") return;
    stopWorker();
    clearInterval(clockTimer);
    state.phase = "error";
    updateControls();
    ui.status.textContent = "توقفت الجولة مؤقتًا";
    ui.errorMessage.textContent = "تعذّر إكمال نقلة الكمبيوتر. اللوحة محفوظة؛ حاول مرة أخرى لإكمال الجولة.";
    ui.error.hidden = false;
    ui.retryMove.focus({ preventScroll: true });
    console.error("Computer move failed:", error);
  };
  try {
    activeWorker = new Worker(new URL("./ai-worker.js", import.meta.url), { type: "module" });
    worker = activeWorker;
    activeWorker.onmessage = (event) => {
      if (!isCurrent()) return;
      const message = event.data;
      if (!message || message.requestId !== currentRequest) return;
      const result = message.result;
      if (message.type !== "result" || !result?.stats ||
          getOpenRow(state.board, result.col) === -1) {
        fail(message.message || "Invalid computer move");
        return;
      }
      stopWorker();
      showStats(result.stats);
      void playMove(result.col, COMPUTER, currentRound);
    };
    activeWorker.onerror = (event) => {
      event.preventDefault();
      if (isCurrent()) fail(event.message);
    };
    activeWorker.onmessageerror = () => {
      if (isCurrent()) fail("Could not read worker response");
    };
    workerTimer = setTimeout(() => {
      if (isCurrent()) fail("Computer move timed out");
    }, 15000);
    activeWorker.postMessage({
      requestId: currentRequest, board: state.board, depth: LEVELS[state.level].depth,
    });
  } catch (error) { fail(error); }
}

function recordWin() {
  if (!state.name) {
    ui.recordMessage.textContent = "اكتب اسمك عند بدء تحدٍّ جديد ليظهر إنجازك في الصدارة.";
    return;
  }
  const record = store.submitWin({
    name: state.name, level: state.level,
    starter: state.starter === HUMAN ? "human" : "computer",
    moves: state.moves, thinkingMs: Math.round(state.thinkingMs),
  });
  if (!record.accepted) ui.recordMessage.textContent = "انتهت الجولة، لكن لم تُحفظ نتيجة الصدارة.";
  else if (!record.saved) ui.recordMessage.textContent = "نتيجتك متاحة لهذه الجلسة؛ تعذّر حفظها على المتصفح.";
  else if (record.rank) {
    ui.recordMessage.textContent = record.improved
      ? `أفضل فوز جديد لك! ترتيبك في هذه الفئة: ${numbers.format(record.rank)}.`
      : `أفضل نتيجة لك في هذه الفئة ما زالت بالمركز ${numbers.format(record.rank)}.`;
  } else ui.recordMessage.textContent = "فوز مستحق! جرّب نقلات أقل لدخول قائمة العشرة الأوائل.";
  renderLeaderboard();
}

function finishRound(result) {
  if (state.phase === "finished") return;
  stopClock();
  clearInterval(clockTimer);
  state.phase = "finished";
  updateControls();
  ui.result.hidden = false;
  if (result.status === "draw") {
    scores.draw++;
    ui.resultTitle.textContent = COPY.draw;
    ui.resultMessage.textContent = COPY.drawMessage;
    sound.play("draw");
  } else {
    const humanWon = result.winner === HUMAN;
    ui.winControls.hidden = !humanWon;
    scores[humanWon ? "human" : "computer"]++;
    ui.resultTitle.textContent = humanWon ? COPY.humanWin : COPY.computerWin;
    ui.resultMessage.textContent = humanWon ? COPY.humanWinMessage : COPY.computerWinMessage;
    for (const { row, col } of result.cells) {
      cells[row][col].classList.add("is-winning");
      cells[row][col].setAttribute("aria-label", `${describeCell(row, col)}، من خط الفوز`);
    }
    sound.play(humanWon ? "win" : "lose");
    if (humanWon) {
      ui.result.classList.add("is-human-win");
      effects.play();
      recordWin();
    }
  }
  updateScores();
  ui.status.textContent = "انتهت الجولة";
  ui.result.hidden = false;
  if (!ui.leaderboard.open) ui.resultTitle.focus();
}

function renderLeaderboard() {
  const records = store.list(ui.filterLevel.value, ui.filterStarter.value);
  ui.rows.replaceChildren();
  ui.empty.hidden = records.length !== 0;
  ui.table.hidden = records.length === 0;
  ui.storageNotice.hidden = store.persistent;
  records.forEach((record, index) => {
    const row = document.createElement("tr");
    const values = [numbers.format(index + 1), record.name,
      numbers.format(record.moves), formatTime(record.thinkingMs)];
    values.forEach((value, position) => {
      const cell = document.createElement("td");
      if (position === 1) {
        const name = document.createElement("bdi");
        name.textContent = value;
        cell.append(name);
      } else cell.textContent = value;
      if (position === 3) cell.setAttribute("dir", "ltr");
      row.append(cell);
    });
    ui.rows.append(row);
  });
}

function updateSoundButton() {
  ui.sound.setAttribute("aria-pressed", String(sound.enabled));
  ui.sound.textContent = sound.enabled ? "الصوت يعمل" : "الصوت مكتوم";
  ui.sound.setAttribute("aria-label", sound.enabled ? "كتم الصوت" : "تشغيل الصوت");
  renderWinSound();
}

function renderWinSound() {
  const status = sound.winState;
  const labels = {
    idle: "جاهز للتشغيل", loading: "جارٍ التشغيل…", playing: "يعمل الآن",
    paused: "متوقف مؤقتًا", ended: "انتهى المقطع", error: "الصوت غير متاح",
  };
  ui.winStatus.textContent = labels[status] + (sound.enabled ? "" : " · مكتوم");
  ui.winPlay.disabled = status === "playing" || status === "loading";
  ui.winPlay.textContent = status === "paused" ? "استكمال" : status === "ended" ? "إعادة التشغيل" : "تشغيل";
  ui.winPause.disabled = status !== "playing" && status !== "loading";
  ui.winMute.setAttribute("aria-pressed", String(!sound.enabled));
  ui.winMute.setAttribute("aria-label", sound.enabled ? "كتم جميع أصوات اللعبة" : "إلغاء كتم أصوات اللعبة");
  ui.winMute.textContent = sound.enabled ? "كتم" : "إلغاء الكتم";
}

function toggleSound() {
  sound.setEnabled(!sound.enabled);
  updateSoundButton();
  store.saveSettings({ sound: sound.enabled });
}

function returnToStart(clearName) {
  cancelPendingWork();
  state.phase = "start";
  scores.human = scores.computer = scores.draw = 0;
  updateScores();
  ui.nameInput.value = clearName ? "" : state.name;
  ui.gameScreen.hidden = true;
  ui.startScreen.hidden = false;
  (clearName ? ui.nameInput : ui.level).focus();
}

function loadImage(id, path, fallbackId) {
  if (!path) return;
  const image = byId(id);
  const fallback = fallbackId ? byId(fallbackId) : null;
  image.addEventListener("load", () => {
    image.hidden = false;
    if (fallback) fallback.hidden = true;
    failedImages.delete(id);
    ui.mediaNotice.hidden = failedImages.size === 0;
  });
  image.addEventListener("error", () => {
    image.hidden = true;
    if (fallback) fallback.hidden = false;
    failedImages.set(id, { image, path });
    ui.mediaNotice.hidden = false;
  });
  image.src = path;
}

ui.form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (state.phase !== "start") return;
  sound.unlock();
  sound.play("click");
  state.name = cleanName(ui.nameInput.value);
  state.level = Object.hasOwn(LEVELS, ui.level.value) ? ui.level.value : "easy";
  ui.humanName.textContent = state.name || "أنت";
  state.nextStarter = HUMAN;
  scores.human = scores.computer = scores.draw = 0;
  updateScores();
  store.saveSettings({ level: state.level, sound: sound.enabled });
  startRound();
});

ui.newRound.addEventListener("click", () => {
  sound.unlock();
  if (state.phase !== "start") startRound();
});
ui.newPlayer.addEventListener("click", () => returnToStart(true));
ui.changeLevel.addEventListener("click", () => returnToStart(false));
ui.sound.addEventListener("click", toggleSound);
ui.winMute.addEventListener("click", toggleSound);
ui.winPlay.addEventListener("click", () => {
  if (state.phase !== "finished" || ui.winControls.hidden) return;
  if (!sound.enabled) {
    sound.setEnabled(true);
    updateSoundButton();
    store.saveSettings({ sound: true });
  }
  void sound.playWin();
});
ui.winPause.addEventListener("click", () => sound.pauseWin());
ui.retryMove.addEventListener("click", () => {
  if (state.phase !== "error") return;
  ui.error.hidden = true;
  state.phase = "thinking";
  updateControls();
  clearInterval(clockTimer);
  clockTimer = setInterval(renderClock, 1000);
  ui.gameTitle.focus({ preventScroll: true });
  requestComputerMove(state.roundId);
});
ui.retryMedia.addEventListener("click", () => {
  imageRetry++;
  for (const { image, path } of failedImages.values()) {
    const url = new URL(path, import.meta.url);
    url.searchParams.set("retry", String(imageRetry));
    image.src = url.href;
  }
});

ui.openLeaderboard.addEventListener("click", () => {
  sound.unlock();
  sound.play("click");
  stopClock();
  ui.filterLevel.value = state.phase === "start" ? ui.level.value : state.level;
  ui.filterStarter.value = state.phase !== "start" && state.starter === COMPUTER ? "computer" : "human";
  renderLeaderboard();
  if (!ui.leaderboard.open) ui.leaderboard.showModal();
});
ui.closeLeaderboard.addEventListener("click", () => ui.leaderboard.close());
ui.leaderboard.addEventListener("close", () => {
  startClock();
  if (state.phase === "finished") ui.resultTitle.focus();
});
ui.filterLevel.addEventListener("change", renderLeaderboard);
ui.filterStarter.addEventListener("change", renderLeaderboard);

ui.controls.addEventListener("keydown", (event) => {
  if (state.phase !== "human") return;
  const available = columnButtons.filter((button) => !button.disabled);
  const index = available.indexOf(event.target);
  if (index === -1) return;
  const keys = {
    ArrowLeft: (index - 1 + available.length) % available.length,
    ArrowRight: (index + 1) % available.length, Home: 0, End: available.length - 1,
  };
  if (!Object.hasOwn(keys, event.key)) return;
  event.preventDefault();
  available[keys[event.key]].focus();
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) { stopClock(); sound.pauseForVisibility(); effects.clear(); }
  else startClock();
});
reducedMotion.addEventListener("change", () => { if (reducedMotion.matches) effects.clear(); });
window.addEventListener("storage", (event) => {
  if (event.key === RECORDS_KEY || event.key === null) {
    store.refresh();
    renderLeaderboard();
  }
});

ui.level.value = store.settings.level;
ui.filterLevel.value = store.settings.level;
ui.filterStarter.value = "human";
updateSoundButton();
byId("copyright-year").textContent = new Date().getFullYear();
loadImage("hero-image", MEDIA.hero, "hero-fallback");
loadImage("signature-image", MEDIA.signature, "signature-fallback");
loadImage("side-left-image", MEDIA.sideLeft);
loadImage("side-right-image", MEDIA.sideRight);
