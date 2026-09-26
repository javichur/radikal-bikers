import type { SimEvent } from '../sim/events';

/** Procedural audio (no external assets): engine drone + arcade SFX. */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private engineOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private enabled = true;

  /** Must be called from a user gesture (autoplay policies, iOS). */
  unlock(): void {
    if (typeof AudioContext === 'undefined') return;
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.enabled ? 0.5 : 0;
      this.master.connect(this.ctx.destination);
      this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    void this.ctx.resume();
  }

  setEnabled(v: boolean): void {
    this.enabled = v;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(v ? 0.5 : 0, this.ctx.currentTime, 0.05);
  }

  startEngine(): void {
    if (!this.ctx || !this.master || this.engineOsc) return;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    osc.connect(filter).connect(gain).connect(this.master);
    osc.start();
    this.engineOsc = osc;
    this.engineGain = gain;
  }

  stopEngine(): void {
    this.engineOsc?.stop();
    this.engineOsc?.disconnect();
    this.engineOsc = null;
    this.engineGain = null;
  }

  updateEngine(speedRatio: number, throttle: number): void {
    if (!this.ctx || !this.engineOsc || !this.engineGain) return;
    const t = this.ctx.currentTime;
    this.engineOsc.frequency.setTargetAtTime(55 + speedRatio * 140 + throttle * 20, t, 0.05);
    this.engineGain.gain.setTargetAtTime(0.05 + throttle * 0.08, t, 0.08);
  }

  private tone(freq: number, dur: number, type: OscillatorType = 'square', vol = 0.2, delay = 0): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private burst(dur: number, vol: number): void {
    if (!this.ctx || !this.master || !this.noise) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const g = this.ctx.createGain();
    const t = this.ctx.currentTime;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur);
  }

  countdownBeep(final: boolean): void {
    this.tone(final ? 880 : 440, final ? 0.5 : 0.2, 'square', 0.18);
  }

  uiBlip(): void {
    this.tone(660, 0.06, 'square', 0.1);
  }

  play(e: SimEvent): void {
    switch (e.type) {
      case 'crash':
        this.burst(0.6, 0.5);
        this.tone(90, 0.4, 'sawtooth', 0.25);
        break;
      case 'checkpoint':
        [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.15, 'square', 0.15, i * 0.09));
        break;
      case 'finish':
        [523, 659, 784, 1046, 784, 1046].forEach((f, i) => this.tone(f, 0.2, 'square', 0.15, i * 0.12));
        break;
      case 'honk':
        this.tone(330, 0.25, 'square', 0.1);
        this.tone(415, 0.25, 'square', 0.08);
        break;
      case 'jump':
        this.tone(300, 0.25, 'triangle', 0.15);
        break;
      case 'land':
        this.burst(0.12, 0.2);
        break;
      case 'hurryUp':
        [880, 880, 880].forEach((f, i) => this.tone(f, 0.1, 'square', 0.12, i * 0.18));
        break;
      case 'timeUp':
        [392, 330, 262].forEach((f, i) => this.tone(f, 0.3, 'square', 0.15, i * 0.25));
        break;
      default:
        break;
    }
  }
}
