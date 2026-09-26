import type { ControlState, InputSource, MenuAction } from './types';

const DEADZONE = 0.18;

export const applyDeadzone = (v: number, dz = DEADZONE): number =>
  Math.abs(v) < dz ? 0 : Math.sign(v) * ((Math.abs(v) - dz) / (1 - dz));

/** Standard-mapping gamepads: stick/dpad steer, RT gas, LT brake, A/RB wheelie. */
export class GamepadInput implements InputSource {
  private prev = new Map<number, boolean>();

  constructor(private readonly onMenu: (a: MenuAction) => void) {}

  private pad(): Gamepad | null {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
    for (const p of navigator.getGamepads()) if (p && p.connected) return p;
    return null;
  }

  poll(): Partial<ControlState> {
    const p = this.pad();
    if (!p) return {};
    const btn = (i: number): number => p.buttons[i]?.value ?? 0;
    const pressed = (i: number): boolean => p.buttons[i]?.pressed ?? false;

    const edges: [number, MenuAction][] = [
      [12, 'up'],
      [13, 'down'],
      [14, 'left'],
      [15, 'right'],
      [0, 'confirm'],
      [1, 'back'],
      [9, 'pause'],
    ];
    for (const [i, a] of edges) {
      const now = pressed(i);
      if (now && !this.prev.get(i)) this.onMenu(a);
      this.prev.set(i, now);
    }

    const dpad = (pressed(15) ? 1 : 0) - (pressed(14) ? 1 : 0);
    return {
      steer: dpad || applyDeadzone(p.axes[0] ?? 0),
      throttle: Math.max(btn(7), pressed(0) ? 1 : 0),
      brake: Math.max(btn(6), pressed(2) ? 1 : 0),
      wheelie: pressed(5) || pressed(3),
    };
  }

  dispose(): void {
    this.prev.clear();
  }
}
