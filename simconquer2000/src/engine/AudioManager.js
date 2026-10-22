import { AUDIO_CONFIG } from '../config.js';

export class AudioManager {
  constructor(options = {}) {
    this.audioFactory = options.audioFactory ?? (typeof Audio !== 'undefined' ? (src) => new Audio(src) : null);
    this.src = AUDIO_CONFIG?.MUSIC_FILE_PATH || './assets/audio/bgm.mp3';
    this.volume = AUDIO_CONFIG?.DEFAULT_VOLUME ?? 0.20;
    this.audio = null;
    this.isMuted = false;
    this.isEnabled = false;
  }

  init() {
    if (this.audio || !this.audioFactory) return;
    this.audio = this.audioFactory(this.src);
    this.audio.loop = true;
    this.audio.volume = this.volume;
  }

  enable() {
    this.init();
    this.isEnabled = true;
    this.isMuted = false;
    this.play();
  }

  play() {
    if (!this.audio || this.isMuted) return;
    // Autoplay rejection or a missing file must not break the game.
    const result = this.audio.play();
    if (result && typeof result.catch === 'function') result.catch(() => {});
  }

  stop() {
    this.audio?.pause();
  }

  toggleMute() {
    if (!this.isEnabled) {
      this.enable();
      return Boolean(this.audio);
    }
    if (!this.audio) return false;
    this.isMuted = !this.isMuted;
    if (this.isMuted) this.stop();
    else this.play();
    return !this.isMuted;
  }

  updatePopulation() {}
}
