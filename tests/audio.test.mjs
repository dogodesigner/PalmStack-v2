import test from 'node:test';
import assert from 'node:assert/strict';
import { SoundBank } from '../audio.js';

class Param {
  constructor() { this.value = 0; }
  setValueAtTime() {}
  exponentialRampToValueAtTime() {}
  linearRampToValueAtTime() {}
}
class Node {
  constructor() { this.frequency = new Param(); this.gain = new Param(); this.started = null; this.stopped = false; }
  connect() {}
  disconnect() {}
  start(...args) { this.started = args; }
  stop(time) { this.stopped = true; if (time === undefined) this.onended?.(); }
}
class Context {
  constructor() { this.state = 'running'; this.currentTime = 0; this.destination = {}; this.created = []; }
  createGain() { return new Node(); }
  createOscillator() { const node = new Node(); this.created.push(node); return node; }
  createBufferSource() { return this.createOscillator(); }
  createBuffer(channels, length, rate) { const data = new Float32Array(length); return { duration: length / rate, getChannelData: () => data }; }
  resume() { this.state = 'running'; return Promise.resolve(); }
}
globalThis.window = { AudioContext: Context };
globalThis.document = { hidden: false };

test('victory pauses at its real offset; mute does not stop it; reset discards the offset', async () => {
  const sound = new SoundBank(true);
  await sound.unlock();
  sound.play('drop');
  assert.equal(sound.sources.size, 2);
  assert.equal(await sound.playWin(), true);
  const first = sound.winSource;
  assert.equal(first.started[1], 0);
  sound.context.currentTime = 0.65;
  sound.pauseWin();
  assert.ok(first.stopped);
  assert.equal(sound.winOffset, 0.65);
  assert.equal(sound.winState, 'paused');
  sound.context.currentTime = 5;
  await sound.playWin();
  const resumed = sound.winSource;
  assert.equal(resumed.started[1], 0.65);
  assert.ok(Math.abs(resumed.started[2] - 1.75) < 1e-6);
  sound.setEnabled(false);
  assert.equal(sound.master.gain.value, 0);
  assert.equal(resumed.stopped, false);
  assert.equal(sound.winState, 'playing');
  sound.setEnabled(true);
  assert.ok(sound.master.gain.value > 0);
  sound.stopAll();
  assert.equal(sound.winOffset, 0);
  assert.equal(sound.winState, 'idle');
  assert.equal(sound.sources.size, 0);
});

test('custom victory is clipped and can replay; hidden pages pause without auto-resuming', async () => {
  const sound = new SoundBank();
  await sound.unlock();
  sound.buffers.set('win', { duration: 30 });
  await sound.playWin();
  assert.equal(sound.winSource.started[2], 8);
  sound.context.currentTime = 2;
  document.hidden = true;
  sound.pauseForVisibility();
  assert.equal(sound.winOffset, 2);
  assert.equal(sound.sources.size, 0);
  assert.equal(await sound.playWin(), false);
  document.hidden = false;
  await sound.playWin();
  assert.equal(sound.winSource.started[1], 2);
  assert.equal(sound.winSource.started[2], 6);
  sound.winSource.onended();
  assert.equal(sound.winState, 'ended');
  await sound.playWin();
  assert.equal(sound.winSource.started[1], 0);
  sound.stopAll();
});

test('pending resume cannot produce a late sound after a new round or pause', async () => {
  const sound = new SoundBank();
  await sound.unlock();
  sound.context.state = 'suspended';
  let resolve;
  sound.context.resume = () => new Promise(r => { resolve = () => { sound.context.state = 'running'; r(); }; });
  const pending = sound.playWin();
  sound.stopAll();
  resolve();
  assert.equal(await pending, false);
  assert.equal(sound.sources.size, 0);
  sound.context.state = 'suspended';
  const paused = sound.playWin();
  sound.pauseWin();
  resolve();
  assert.equal(await paused, false);
  assert.equal(sound.winState, 'paused');
  assert.equal(sound.sources.size, 0);
});

test('unavailable or blocked audio provides an actionable notice and does not throw', async () => {
  const notices = [];
  window.AudioContext = undefined;
  const sound = new SoundBank(true, { onNotice: message => notices.push(message) });
  assert.equal(await sound.playWin(), false);
  assert.equal(sound.winState, 'error');
  assert.ok(notices.at(-1).includes('تعذّر تشغيل'));
  assert.doesNotThrow(() => { sound.play('drop'); sound.stopAll(); });
  window.AudioContext = Context;
  const blocked = new SoundBank();
  await blocked.unlock();
  blocked.context.state = 'suspended';
  blocked.context.resume = () => Promise.reject(new Error('NotAllowedError'));
  assert.equal(await blocked.playWin(), false);
  assert.equal(blocked.sources.size, 0);
});
