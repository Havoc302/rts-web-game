import assert from 'assert';
import { AudioManager } from '../src/engine/AudioManager.js';

console.log('=== audio-manager.test.js ===');

class FakeAudioParam {
  constructor(initial = 0) {
    this.value = initial;
    this.events = [];
  }
  setValueAtTime(val, time) {
    this.value = val;
    this.events.push({ type: 'set', val, time });
  }
  linearRampToValueAtTime(val, time) {
    this.value = val;
    this.events.push({ type: 'linear', val, time });
  }
  exponentialRampToValueAtTime(val, time) {
    this.value = val;
    this.events.push({ type: 'exp', val, time });
  }
}

class FakeAudioNode {
  constructor(type = 'node') {
    this.type = type;
    this.gain = new FakeAudioParam(1);
    this.frequency = new FakeAudioParam(440);
    this.connectedTo = [];
    this.started = false;
    this.stopped = false;
  }
  connect(target) {
    this.connectedTo.push(target);
  }
  start(time) {
    this.started = true;
  }
  stop(time) {
    this.stopped = true;
  }
}

class FakeAudioContext {
  constructor() {
    this.state = 'suspended';
    this.currentTime = 0;
    this.destination = new FakeAudioNode('destination');
    this.createdNodes = [];
  }
  createGain() {
    const node = new FakeAudioNode('gain');
    this.createdNodes.push(node);
    return node;
  }
  createOscillator() {
    const node = new FakeAudioNode('oscillator');
    this.createdNodes.push(node);
    return node;
  }
  createBiquadFilter() {
    const node = new FakeAudioNode('filter');
    this.createdNodes.push(node);
    return node;
  }
  resume() {
    this.state = 'running';
  }
}

// 1. Initial State
{
  const audio = new AudioManager({ audioContextClass: FakeAudioContext });
  assert.strictEqual(audio.isEnabled, false, 'Audio should start disabled');
  assert.strictEqual(audio.isMuted, false, 'Audio mute flag should default to false');
  assert.strictEqual(audio.currentPopulation, 0, 'Initial population should be 0');
  assert.ok(audio.scale.length > 0, 'Pentatonic scale must have frequencies');
}

// 2. Enable Audio
{
  const audio = new AudioManager({ audioContextClass: FakeAudioContext });
  audio.enable();
  assert.strictEqual(audio.isEnabled, true, 'Calling enable() should enable audio');
  assert.strictEqual(audio.isMuted, false, 'Calling enable() should unmute audio');
  assert.strictEqual(audio.ctx.state, 'running', 'AudioContext should resume to running state');
  assert.ok(audio.masterGain !== null, 'Master gain node should be created');
  assert.strictEqual(audio.masterGain.gain.value, 0.12, 'Master gain should default to 0.12 volume');
  assert.ok(audio.ambientTimer !== null, 'Ambient timer should be running');
  audio.stopProceduralAmbient();
}

// 3. Toggle Mute
{
  const audio = new AudioManager({ audioContextClass: FakeAudioContext });
  audio.enable();

  const activeAfterMute = audio.toggleMute();
  assert.strictEqual(activeAfterMute, false, 'toggleMute should return false when muted');
  assert.strictEqual(audio.isMuted, true, 'isMuted should be true');
  assert.strictEqual(audio.ambientTimer, null, 'Ambient timer should be stopped when muted');
  assert.strictEqual(audio.masterGain.gain.value, 0, 'Master gain should be ramped to 0 on mute');

  const activeAfterUnmute = audio.toggleMute();
  assert.strictEqual(activeAfterUnmute, true, 'toggleMute should return true when unmuted');
  assert.strictEqual(audio.isMuted, false, 'isMuted should be false');
  assert.ok(audio.ambientTimer !== null, 'Ambient timer should resume when unmuted');
  assert.strictEqual(audio.masterGain.gain.value, 0.12, 'Master gain should be restored to 0.12');
  audio.stopProceduralAmbient();
}

// 4. Population Update
{
  const audio = new AudioManager({ audioContextClass: FakeAudioContext });
  audio.updatePopulation(2500);
  assert.strictEqual(audio.currentPopulation, 2500, 'Population should update correctly');
}

// 5. Graceful Fallback without AudioContext
{
  const audio = new AudioManager({ audioContextClass: null });
  audio.enable();
  assert.strictEqual(audio.ctx, null, 'Context should remain null when unsupported');
  const active = audio.toggleMute();
  assert.strictEqual(active, false, 'Toggle mute should handle null context gracefully');
}

console.log('Audio manager tests passed.');
