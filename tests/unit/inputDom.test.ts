// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GamepadInput } from '../../src/input/gamepad';
import { KeyboardInput } from '../../src/input/keyboard';
import { TouchInput } from '../../src/input/touch';
import type { MenuAction } from '../../src/input/types';

const key = (type: 'keydown' | 'keyup', code: string, repeat = false): void => {
  window.dispatchEvent(new KeyboardEvent(type, { code, repeat }));
};

const pointer = (el: Element, type: string, id: number, x = 0, y = 0): void => {
  const e = new Event(type, { bubbles: true, cancelable: true }) as Event & Record<string, number>;
  Object.assign(e, { pointerId: id, clientX: x, clientY: y });
  el.dispatchEvent(e);
};

describe('KeyboardInput', () => {
  let kb: KeyboardInput | null = null;
  afterEach(() => kb?.dispose());

  it('tracks held keys and emits menu actions once per press', () => {
    const actions: MenuAction[] = [];
    kb = new KeyboardInput(window, (a) => actions.push(a));
    key('keydown', 'ArrowUp');
    key('keydown', 'ArrowUp', true);
    key('keydown', 'Escape');
    expect(kb.poll().throttle).toBe(1);
    expect(actions).toEqual(['up', 'pause']);
    key('keyup', 'ArrowUp');
    expect(kb.poll().throttle).toBe(0);
    key('keydown', 'KeyA');
    window.dispatchEvent(new Event('blur'));
    expect(kb.poll().steer).toBe(0);
  });
});

describe('TouchInput', () => {
  it('builds the on-screen controls and reads multi-touch buttons', () => {
    const parent = document.createElement('div');
    document.body.append(parent);
    const t = new TouchInput(parent, { gas: 'GAS', brake: 'BRAKE', wheelie: 'WHEELIE' });
    t.setVisible(true);
    expect(t.root.classList.contains('visible')).toBe(true);
    const gas = parent.querySelector('[data-btn=gas]')!;
    const wheelie = parent.querySelector('[data-btn=wheelie]')!;
    expect(gas.textContent).toBe('GAS');

    pointer(gas, 'pointerdown', 1);
    pointer(wheelie, 'pointerdown', 2);
    expect(t.poll()).toMatchObject({ throttle: 1, wheelie: true });
    pointer(gas, 'pointerup', 1);
    pointer(wheelie, 'pointerup', 2);
    expect(t.poll()).toMatchObject({ throttle: 0, wheelie: false });

    // Wheelie alone also opens the throttle.
    pointer(wheelie, 'pointerdown', 3);
    expect(t.poll().throttle).toBe(1);

    t.setLabels({ gas: 'GAS!', brake: 'FRENO', wheelie: 'CABALLITO' });
    expect(gas.textContent).toBe('GAS!');
    t.setVisible(false);
    expect(t.poll().throttle).toBe(0);
    t.dispose();
    expect(parent.children).toHaveLength(0);
  });

  it('floating joystick steers relative to where the thumb landed', () => {
    const parent = document.createElement('div');
    const t = new TouchInput(parent, { gas: 'G', brake: 'B', wheelie: 'W' });
    const zone = parent.querySelector('.touch-stick-zone')!;
    pointer(zone, 'pointerdown', 7, 100, 200);
    pointer(zone, 'pointermove', 7, 150, 200);
    expect(t.poll().steer).toBeGreaterThan(0.7);
    pointer(zone, 'pointermove', 8, 0, 200); // other finger ignored
    expect(t.poll().steer).toBeGreaterThan(0.7);
    pointer(zone, 'pointermove', 7, 60, 200);
    expect(t.poll().steer).toBeLessThan(-0.5);
    pointer(zone, 'pointerup', 7);
    expect(t.poll().steer).toBe(0);
  });
});

describe('GamepadInput', () => {
  it('reads a standard gamepad and emits menu edges', () => {
    const buttons = Array.from({ length: 16 }, () => ({ pressed: false, value: 0, touched: false }));
    const pad = { connected: true, axes: [0.5, 0], buttons } as unknown as Gamepad;
    vi.stubGlobal('navigator', { ...navigator, getGamepads: () => [pad] });
    const actions: MenuAction[] = [];
    const g = new GamepadInput((a) => actions.push(a));
    buttons[7] = { pressed: true, value: 0.6, touched: true };
    buttons[0] = { pressed: true, value: 1, touched: true };
    const c = g.poll();
    expect(c.steer).toBeGreaterThan(0.3);
    expect(c.throttle).toBe(1);
    g.poll();
    expect(actions).toEqual(['confirm']);
    buttons[14] = { pressed: true, value: 1, touched: true };
    expect(g.poll().steer).toBe(-1);
    g.dispose();
    vi.unstubAllGlobals();
    expect(new GamepadInput(() => {}).poll()).toEqual({});
  });
});
