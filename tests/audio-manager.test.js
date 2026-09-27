import assert from 'assert';
import { AudioManager } from '../src/engine/AudioManager.js';
import { AUDIO_CONFIG } from '../src/config.js';

console.log('=== audio-manager.test.js ===');

class FakeAudio {
  constructor(src) {
    this.src = src;
    this.loop = false;
    this.volume = 1;
    this.paused = true;
    this.playCalls = 0;
  }
  play() {
    this.paused = false;
    this.playCalls++;
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
}

const audioFactory = (src) => new FakeAudio(src);

// 1. Initial state
{
  const audio = new AudioManager({ audioFactory });
  assert.strictEqual(audio.isEnabled, false, 'Audio should start disabled');
  assert.strictEqual(audio.isMuted, false, 'Audio mute flag should default to false');
  assert.strictEqual(audio.audio, null, 'Audio element should be created lazily');
}

// 2. Enable creates a looping track at the configured volume
{
  const audio = new AudioManager({ audioFactory });
  audio.enable();
  assert.strictEqual(audio.isEnabled, true);
  assert.strictEqual(audio.audio.src, AUDIO_CONFIG.MUSIC_FILE_PATH, 'Track should use the configured file path');
  assert.strictEqual(audio.audio.loop, true, 'Background music should loop');
  assert.strictEqual(audio.audio.volume, AUDIO_CONFIG.DEFAULT_VOLUME, 'Volume should use the configured default');
  assert.strictEqual(audio.audio.paused, false, 'Enable should start playback');
}

// 3. Toggle mute pauses and resumes playback
{
  const audio = new AudioManager({ audioFactory });
  audio.enable();
  assert.strictEqual(audio.toggleMute(), false, 'toggleMute should return false when muted');
  assert.strictEqual(audio.audio.paused, true, 'Muting should pause the track');
  assert.strictEqual(audio.toggleMute(), true, 'toggleMute should return true when unmuted');
  assert.strictEqual(audio.audio.paused, false, 'Unmuting should resume the track');
}

// 4. Rejected play() (autoplay policy / missing file) is swallowed
{
  const audio = new AudioManager({ audioFactory: (src) => Object.assign(new FakeAudio(src), { play: () => Promise.reject(new Error('blocked')) }) });
  audio.enable();
  assert.strictEqual(audio.isEnabled, true, 'Rejected playback should not throw');
}

// 5. Graceful fallback without HTML5 Audio
{
  const audio = new AudioManager({ audioFactory: null });
  audio.enable();
  assert.strictEqual(audio.audio, null, 'Audio element should remain null when unsupported');
  assert.strictEqual(audio.toggleMute(), false, 'Toggle mute should handle missing audio gracefully');
  audio.updatePopulation(2500);
}

await new Promise((resolve) => setTimeout(resolve, 0));
console.log('Audio manager tests passed.');
