import { describe, expect, it } from 'vitest';
import { applyDeadzone } from '../../src/input/gamepad';
import { controlsFromKeys } from '../../src/input/keyboard';
import { joystickSteer, JOYSTICK_RADIUS } from '../../src/input/touch';
import { combineControls, neutralControls } from '../../src/input/types';

describe('input mapping', () => {
  it('maps arrows and WASD', () => {
    expect(controlsFromKeys(new Set(['ArrowUp', 'ArrowLeft']))).toEqual({
      steer: -1,
      throttle: 1,
      brake: 0,
      wheelie: false,
    });
    expect(controlsFromKeys(new Set(['KeyD', 'KeyS', 'Space']))).toEqual({
      steer: 1,
      throttle: 0,
      brake: 1,
      wheelie: true,
    });
    expect(controlsFromKeys(new Set(['ArrowLeft', 'ArrowRight'])).steer).toBe(0);
  });

  it('combines devices: strongest steer wins, buttons OR-ed, values clamped', () => {
    const c = combineControls([
      { steer: 0.3, throttle: 0.5 },
      { steer: -0.8, wheelie: true },
      { throttle: 2, brake: -1 },
    ]);
    expect(c).toEqual({ steer: -0.8, throttle: 1, brake: 0, wheelie: true });
    expect(combineControls([])).toEqual(neutralControls());
  });

  it('joystick has a deadzone and saturates at the radius', () => {
    expect(joystickSteer(2)).toBe(0);
    expect(joystickSteer(JOYSTICK_RADIUS)).toBeCloseTo(1);
    expect(joystickSteer(-JOYSTICK_RADIUS * 3)).toBeCloseTo(-1);
    const half = joystickSteer(JOYSTICK_RADIUS / 2);
    expect(half).toBeGreaterThan(0.3);
    expect(half).toBeLessThan(0.6);
  });

  it('gamepad deadzone rescales the remaining range', () => {
    expect(applyDeadzone(0.1)).toBe(0);
    expect(applyDeadzone(1)).toBeCloseTo(1);
    expect(applyDeadzone(-1)).toBeCloseTo(-1);
  });
});
