import type { SimEvent } from '../sim/events';

const midi = (n: number): number => 440 * 2 ** ((n - 69) / 12);
/** Bass roots (MIDI) of the 4-bar loop and the minor chord arpeggiated on top. */
const ROOTS = [45, 45, 48, 43];
const ARP = [0, 3, 7, 12, 7, 3];

/** Procedural audio (no external assets): engine drone, arcade SFX and a dynamic music loop. */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private engineOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private enabled = true;
  private musicGain: GainNode | null = null;
  private musicOn = false;
  private musicStep = 0;
  private musicNext = 0;

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

  /** Starts the race music (layers are added by `updateMusic`). */
  startMusic(): void {
    if (!this.ctx || !this.master || this.musicOn) return;
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.22;
    this.musicGain.connect(this.master);
    this.musicOn = true;
    this.musicStep = 0;
    this.musicNext = this.ctx.currentTime + 0.05;
  }

  stopMusic(): void {
    this.musicOn = false;
    if (this.musicGain && this.ctx) {
      const g = this.musicGain;
      g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
      setTimeout(() => g.disconnect(), 600);
    }
    this.musicGain = null;
  }

  /**
   * Schedules the next notes of the loop. `intensity` 0..1 adds layers (hi-hats, arpeggio);
   * `hurry` speeds the tempo up when the clock is running out.
   */
  updateMusic(intensity: number, hurry: boolean): void {
    const ctx = this.ctx;
    const out = this.musicGain;
    if (!ctx || !out || !this.musicOn) return;
    const step = 60 / (hurry ? 152 : 132) / 4;
    if (this.musicNext < ctx.currentTime) this.musicNext = ctx.currentTime + 0.02;
    while (this.musicNext < ctx.currentTime + 0.12) {
      const i = this.musicStep;
      const t = this.musicNext;
      const root = ROOTS[Math.floor(i / 16) % ROOTS.length]!;
      if (i % 4 === 0) this.kick(t, out);
      if (i % 2 === 0) this.note(midi(root + (i % 4 === 2 ? 12 : 0) - 12), t, step * 1.6, 'sawtooth', 0.28, out);
      if (intensity >= 0.25 && i % 2 === 1) this.hat(t, out, i % 4 === 3 ? 0.12 : 0.06);
      if (intensity >= 0.55) this.note(midi(root + 24 + ARP[i % ARP.length]!), t, step * 0.9, 'square', 0.07, out);
      if (hurry && i % 8 === 4) this.note(midi(root + 36), t, step, 'triangle', 0.08, out);
      this.musicStep++;
      this.musicNext += step;
    }
  }

  private note(freq: number, t: number, dur: number, type: OscillatorType, vol: number, out: AudioNode): void {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private kick(t: number, out: AudioNode): void {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    g.gain.setValueAtTime(0.6, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.2);
  }

  private hat(t: number, out: AudioNode, vol: number): void {
    if (!this.ctx || !this.noise) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7000;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    src.connect(f).connect(g).connect(out);
    src.start(t, Math.random() * 0.5);
    src.stop(t + 0.06);
  }

  countdownBeep(final: boolean): void {
    this.tone(final ? 880 : 440, final ? 0.5 : 0.2, 'square', 0.18);
  }

  /** Buzzer for locked riders / stages. */
  denied(): void {
    this.tone(140, 0.18, 'square', 0.14);
    this.tone(110, 0.22, 'square', 0.12, 0.1);
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
      case 'pickup':
        [392, 523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.1, 'square', 0.12, i * 0.05));
        break;
      case 'explode':
        this.burst(1.1, 0.7);
        this.tone(60, 0.7, 'sawtooth', 0.3);
        this.tone(45, 0.9, 'square', 0.15, 0.05);
        break;
      case 'glass':
        this.burst(0.25, 0.35);
        [2600, 3400, 2900, 3900].forEach((f, i) => this.tone(f, 0.12, 'triangle', 0.06, i * 0.04));
        break;
      case 'shortcut':
        this.tone(660, 0.12, 'triangle', 0.12);
        this.tone(990, 0.18, 'triangle', 0.1, 0.1);
        break;
      case 'knock':
        this.burst(0.15, 0.25);
        this.tone(220, 0.08, 'triangle', 0.12);
        break;
      case 'crossingBell':
        // Level crossing bells: a quick ding-ding repeated while the barriers come down.
        for (let i = 0; i < 6; i++) this.tone(1250, 0.12, 'square', 0.07, i * 0.25);
        break;
      case 'trick': {
        // Rising pitch with the combo multiplier.
        const base = 520 * 2 ** ((e.multiplier - 1) / 6);
        this.tone(base, 0.08, 'square', 0.1);
        this.tone(base * 1.5, 0.1, 'square', 0.08, 0.05);
        break;
      }
      case 'nearMiss':
        this.burst(0.18, 0.18);
        break;
      case 'comboBanked':
        [659, 784, 988, 1319].forEach((f, i) => this.tone(f, 0.12, 'triangle', 0.12, i * 0.06));
        break;
      case 'comboLost':
        [392, 311, 233].forEach((f, i) => this.tone(f, 0.16, 'sawtooth', 0.1, i * 0.1));
        break;
      case 'cone':
        this.tone(180, 0.08, 'square', 0.12);
        this.burst(0.06, 0.15);
        break;
      case 'rivalPassed':
        if (e.ahead) [784, 1046].forEach((f, i) => this.tone(f, 0.1, 'square', 0.1, i * 0.08));
        else [523, 392].forEach((f, i) => this.tone(f, 0.12, 'square', 0.1, i * 0.1));
        break;
      case 'timeUp':
        [392, 330, 262].forEach((f, i) => this.tone(f, 0.3, 'square', 0.15, i * 0.25));
        break;
      default:
        break;
    }
  }
}
