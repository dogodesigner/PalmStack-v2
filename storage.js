import { LEVELS, DEFAULT_LEVEL } from "./config.js";

export const RECORDS_KEY = "palmstack.records.v1";
const SETTINGS_KEY = "palmstack.settings.v1";
const STARTERS = ["human", "computer"];
const LIMIT = 10;

export function cleanName(value) {
  if (typeof value !== "string") return "";
  return [...value.normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "")
    .trim().replace(/\s+/g, " ")].slice(0, 24).join("");
}

function nameKey(name) {
  return cleanName(name).toLocaleLowerCase("ar");
}

export function compareRecords(a, b) {
  return a.moves - b.moves || a.thinkingMs - b.thinkingMs || a.savedAt - b.savedAt;
}

function validRecord(record) {
  return record && typeof record === "object" && cleanName(record.name) &&
    Object.hasOwn(LEVELS, record.level) && STARTERS.includes(record.starter) &&
    Number.isInteger(record.moves) && record.moves >= 4 && record.moves <= 21 &&
    Number.isInteger(record.thinkingMs) && record.thinkingMs >= 0 &&
    record.thinkingMs <= 7 * 24 * 60 * 60 * 1000 &&
    Number.isSafeInteger(record.savedAt) && record.savedAt >= 0;
}

function sanitizeRecords(records) {
  if (!Array.isArray(records)) return [];
  const best = new Map();
  for (const record of records.slice(0, 1000)) {
    if (!validRecord(record)) continue;
    const item = {
      name: cleanName(record.name), level: record.level, starter: record.starter,
      moves: record.moves, thinkingMs: record.thinkingMs, savedAt: record.savedAt,
    };
    const key = JSON.stringify([nameKey(item.name), item.level, item.starter]);
    if (!best.has(key) || compareRecords(item, best.get(key)) < 0) best.set(key, item);
  }
  const result = [];
  for (const level of Object.keys(LEVELS)) {
    for (const starter of STARTERS) {
      result.push(...[...best.values()]
        .filter((item) => item.level === level && item.starter === starter)
        .sort(compareRecords).slice(0, LIMIT));
    }
  }
  return result;
}

export function createStore(providedStorage) {
  let storage = providedStorage;
  if (storage === undefined) {
    try { storage = globalThis.localStorage; } catch { storage = null; }
  }
  let persistent = Boolean(storage);
  let records = [];
  let settings = { level: DEFAULT_LEVEL, sound: true };

  function read(key) {
    let raw;
    try {
      raw = storage?.getItem(key);
    } catch { persistent = false; return null; }
    if (!raw || raw.length > 250000) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }

  function write(key, value) {
    if (!storage) { persistent = false; return false; }
    try {
      storage.setItem(key, JSON.stringify(value));
      persistent = true;
      return true;
    } catch { persistent = false; return false; }
  }

  function refresh() {
    const saved = read(RECORDS_KEY);
    if (saved?.version === 1) records = sanitizeRecords(saved.records);
    else if (persistent) records = [];
    const preferences = read(SETTINGS_KEY);
    if (preferences?.version === 1) {
      settings = {
        level: Object.hasOwn(LEVELS, preferences.level) ? preferences.level : DEFAULT_LEVEL,
        sound: typeof preferences.sound === "boolean" ? preferences.sound : true,
      };
    }
  }
  refresh();

  return {
    get persistent() { return persistent; },
    get settings() { return { ...settings }; },
    refresh,
    saveSettings(next) {
      settings = {
        level: Object.hasOwn(LEVELS, next.level) ? next.level : settings.level,
        sound: typeof next.sound === "boolean" ? next.sound : settings.sound,
      };
      return write(SETTINGS_KEY, { version: 1, ...settings });
    },
    list(level, starter) {
      return records.filter((item) => item.level === level && item.starter === starter)
        .sort(compareRecords).map((item) => ({ ...item }));
    },
    submitWin(input) {
      const record = { ...input, name: cleanName(input.name), savedAt: Date.now() };
      if (!validRecord(record)) return { accepted: false, rank: null, saved: persistent };
      // Merge the latest saved data so another open tab is not silently discarded.
      const saved = read(RECORDS_KEY);
      const external = saved?.version === 1 ? sanitizeRecords(saved.records) : [];
      records = sanitizeRecords([...records, ...external, record]);
      const savedOK = write(RECORDS_KEY, { version: 1, records });
      const group = this.list(record.level, record.starter);
      const index = group.findIndex((item) => nameKey(item.name) === nameKey(record.name));
      const best = group[index];
      return {
        accepted: true,
        rank: index === -1 ? null : index + 1,
        improved: Boolean(best && best.savedAt === record.savedAt &&
          best.moves === record.moves && best.thinkingMs === record.thinkingMs),
        saved: savedOK,
      };
    },
  };
}
