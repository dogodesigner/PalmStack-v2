import test from 'node:test';
import assert from 'node:assert/strict';
import { SoundBank } from '../audio.js';

class Param {
  constructor() { this.value = 0; this.changes = []; }
  setValueAtTime(...args) { this.changes.push(args); }
  exponentialRampToValueAtTime(...args) { this.changes.push(args); }
  linearRampToValueAtTime(...args) { this.changes.push(args); }
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
  resume() { this.state = 'running'; return Promise.resolve(); }
}
globalThis.window = { AudioContext: Context };
globalThis.document = { hidden: false };

test('drop and victory sounds are bounded, mute cancels them, and custom wins are clipped', () => {
  const sound = new SoundBank(true);
  sound.unlock();
  sound.play('drop');
  assert.equal(sound.sources.size, 2);
  sound.play('win');
  assert.equal(sound.sources.size, 6);
  sound.setEnabled(false);
  assert.equal(sound.sources.size, 0);
  const count = sound.context.created.length;
  sound.play('drop');
  assert.equal(sound.context.created.length, count);
  sound.setEnabled(true);
  sound.buffers.set('win', { duration: 30 });
  sound.play('win');
  assert.equal(sound.context.created.at(-1).started[2], 8);
  sound.stopAll();
  assert.equal(sound.sources.size, 0);
  document.hidden = true;
  sound.play('win');
  assert.equal(sound.sources.size, 0);
  document.hidden = false;
});

test('no AudioContext and a suspended context do not break gameplay calls', () => {
  window.AudioContext = undefined;
  const unsupported = new SoundBank();
  assert.doesNotThrow(() => { unsupported.unlock(); unsupported.play('drop'); unsupported.stopAll(); });
  window.AudioContext = Context;
  const sound = new SoundBank(); sound.unlock(); sound.context.state = 'suspended';
  sound.play('win');
  assert.equal(sound.sources.size, 0);
});
