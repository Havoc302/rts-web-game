export class AudioManager {
  constructor(options = {}) {
    this.audioContextClass = options.audioContextClass ?? (typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null);
    this.ctx = null;
    this.masterGain = null;
    this.isMuted = false;
    this.isEnabled = false;
    this.ambientTimer = null;
    this.currentPopulation = 0;

    // C Major Pentatonic frequencies (Hz) for soft ambient harmonics
    this.scale = [130.81, 146.83, 164.81, 196.00, 220.00, 261.63, 293.66, 329.63, 392.00];
  }

  init() {
    if (this.ctx) return;
    if (!this.audioContextClass) return;
    const AudioCtx = this.audioContextClass;
    this.ctx = new AudioCtx();

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.12; // Master ambient volume
    this.masterGain.connect(this.ctx.destination);
  }

  enable() {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    this.isEnabled = true;
    this.isMuted = false;
    this.startProceduralAmbient();
  }

  toggleMute() {
    if (!this.isEnabled) {
      this.enable();
      return true;
    }

    this.isMuted = !this.isMuted;
    if (this.isMuted) {
      this.stopProceduralAmbient();
      if (this.masterGain && this.ctx) {
        this.masterGain.gain.setValueAtTime(0, this.ctx.currentTime);
      }
    } else {
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      if (this.masterGain && this.ctx) {
        this.masterGain.gain.setValueAtTime(0.12, this.ctx.currentTime);
      }
      this.startProceduralAmbient();
    }
    return !this.isMuted;
  }

  updatePopulation(population) {
    this.currentPopulation = population || 0;
  }

  startProceduralAmbient() {
    if (!this.isEnabled || this.isMuted || this.ambientTimer) return;
    if (!this.ctx) return;

    const triggerNote = () => {
      if (!this.ctx || this.isMuted || !this.isEnabled) return;

      try {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();

        const freq = this.scale[Math.floor(Math.random() * this.scale.length)];
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(500, this.ctx.currentTime);

        const now = this.ctx.currentTime;
        const duration = 3.5 + Math.random() * 2.0;

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.06, now + 1.2);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

        osc.connect(filter);
        filter.connect(this.masterGain);

        osc.start(now);
        osc.stop(now + duration);
      } catch {
        // Ignore synthesis errors in unusual browser audio states
      }

      // Tempo scales subtly with population size
      const baseInterval = Math.max(900, 3200 - Math.min(2200, this.currentPopulation * 0.5));
      const nextDelay = baseInterval + Math.random() * 1800;

      this.ambientTimer = setTimeout(triggerNote, nextDelay);
    };

    triggerNote();
  }

  stopProceduralAmbient() {
    if (this.ambientTimer) {
      clearTimeout(this.ambientTimer);
      this.ambientTimer = null;
    }
  }
}
