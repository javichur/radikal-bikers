import type { ControlState, InputSource } from './types';

export const JOYSTICK_RADIUS = 56;
const JOYSTICK_DEADZONE = 0.12;

/** Maps horizontal thumb displacement to steering (-1..1) with deadzone. */
export const joystickSteer = (dx: number, radius = JOYSTICK_RADIUS): number => {
  const v = Math.max(-1, Math.min(1, dx / radius));
  if (Math.abs(v) < JOYSTICK_DEADZONE) return 0;
  return Math.sign(v) * ((Math.abs(v) - JOYSTICK_DEADZONE) / (1 - JOYSTICK_DEADZONE));
};

type ButtonId = 'gas' | 'brake' | 'wheelie';

export interface TouchLabels {
  gas: string;
  brake: string;
  wheelie: string;
}

/**
 * On-screen controls for phones/tablets (landscape):
 * floating analogue stick on the left, GAS / BRAKE / WHEELIE on the right.
 */
export class TouchInput implements InputSource {
  readonly root: HTMLElement;
  private readonly stickZone: HTMLElement;
  private readonly stickBase: HTMLElement;
  private readonly stickKnob: HTMLElement;
  private readonly buttons: Record<ButtonId, HTMLElement>;
  private readonly held = new Map<ButtonId, Set<number>>();
  private stickPointer: number | null = null;
  private stickOriginX = 0;
  private stickOriginY = 0;
  private steer = 0;

  constructor(parent: HTMLElement, labels: TouchLabels) {
    this.root = document.createElement('div');
    this.root.className = 'touch-controls';
    this.root.setAttribute('aria-hidden', 'true');

    this.stickZone = el('div', 'touch-stick-zone');
    this.stickBase = el('div', 'touch-stick-base');
    this.stickKnob = el('div', 'touch-stick-knob');
    this.stickBase.append(this.stickKnob);
    this.stickZone.append(this.stickBase);

    const pad = el('div', 'touch-buttons');
    this.buttons = {
      wheelie: el('div', 'touch-btn touch-btn-wheelie'),
      brake: el('div', 'touch-btn touch-btn-brake'),
      gas: el('div', 'touch-btn touch-btn-gas'),
    };
    for (const id of Object.keys(this.buttons) as ButtonId[]) {
      const b = this.buttons[id];
      b.dataset.btn = id;
      this.held.set(id, new Set());
      this.bindButton(id, b);
      pad.append(b);
    }
    this.setLabels(labels);
    this.root.append(this.stickZone, pad);
    parent.append(this.root);

    this.stickZone.addEventListener('pointerdown', this.stickDown);
    this.stickZone.addEventListener('pointermove', this.stickMove);
    this.stickZone.addEventListener('pointerup', this.stickUp);
    this.stickZone.addEventListener('pointercancel', this.stickUp);
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  setLabels(labels: TouchLabels): void {
    for (const id of Object.keys(this.buttons) as ButtonId[]) this.buttons[id].textContent = labels[id];
  }

  setVisible(v: boolean): void {
    this.root.classList.toggle('visible', v);
    if (!v) this.reset();
  }

  private bindButton(id: ButtonId, b: HTMLElement): void {
    const set = this.held.get(id)!;
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      capture(b, e.pointerId);
      set.add(e.pointerId);
      b.classList.add('pressed');
      navigator.vibrate?.(8);
    });
    const release = (e: PointerEvent): void => {
      set.delete(e.pointerId);
      if (set.size === 0) b.classList.remove('pressed');
    };
    b.addEventListener('pointerup', release);
    b.addEventListener('pointercancel', release);
    b.addEventListener('lostpointercapture', release);
  }

  private readonly stickDown = (e: PointerEvent): void => {
    if (this.stickPointer !== null) return;
    e.preventDefault();
    this.stickPointer = e.pointerId;
    capture(this.stickZone, e.pointerId);
    const r = this.stickZone.getBoundingClientRect();
    this.stickOriginX = e.clientX;
    this.stickOriginY = e.clientY;
    this.stickBase.style.left = `${e.clientX - r.left}px`;
    this.stickBase.style.top = `${e.clientY - r.top}px`;
    this.stickBase.classList.add('active');
  };

  private readonly stickMove = (e: PointerEvent): void => {
    if (e.pointerId !== this.stickPointer) return;
    const dx = e.clientX - this.stickOriginX;
    const dy = e.clientY - this.stickOriginY;
    const len = Math.hypot(dx, dy);
    const k = len > JOYSTICK_RADIUS ? JOYSTICK_RADIUS / len : 1;
    this.stickKnob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
    this.steer = joystickSteer(dx);
  };

  private readonly stickUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.stickPointer) return;
    this.stickPointer = null;
    this.steer = 0;
    this.stickKnob.style.transform = '';
    this.stickBase.classList.remove('active');
  };

  private reset(): void {
    this.stickPointer = null;
    this.steer = 0;
    for (const [id, s] of this.held) {
      s.clear();
      this.buttons[id].classList.remove('pressed');
    }
  }

  poll(): Partial<ControlState> {
    const on = (id: ButtonId): boolean => (this.held.get(id)?.size ?? 0) > 0;
    return {
      steer: this.steer,
      // Wheelie button also opens the throttle so a single thumb can pop a wheelie.
      throttle: on('gas') || on('wheelie') ? 1 : 0,
      brake: on('brake') ? 1 : 0,
      wheelie: on('wheelie'),
    };
  }

  dispose(): void {
    this.root.remove();
  }
}

/** Pointer capture keeps a held button pressed when the thumb slides; it may throw for stale ids. */
const capture = (target: HTMLElement, pointerId: number): void => {
  try {
    target.setPointerCapture?.(pointerId);
  } catch {
    // Not an active pointer (e.g. synthetic events): holding still works without capture.
  }
};

const el = (tag: string, className: string): HTMLElement => {
  const e = document.createElement(tag);
  e.className = className;
  return e;
};

export const isTouchDevice = (): boolean =>
  typeof window !== 'undefined' &&
  (('ontouchstart' in window && navigator.maxTouchPoints > 0) || window.matchMedia?.('(pointer: coarse)').matches);
