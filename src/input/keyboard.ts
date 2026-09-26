import type { ControlState, InputSource, MenuAction } from './types';

const MENU_KEYS: Record<string, MenuAction> = {
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  Enter: 'confirm',
  NumpadEnter: 'confirm',
  Space: 'confirm',
  Escape: 'pause',
  KeyP: 'pause',
  Backspace: 'back',
};

/** Pure mapping from held key codes to controls (unit-testable). */
export const controlsFromKeys = (held: ReadonlySet<string>): Partial<ControlState> => {
  const left = held.has('ArrowLeft') || held.has('KeyA');
  const right = held.has('ArrowRight') || held.has('KeyD');
  return {
    steer: (right ? 1 : 0) - (left ? 1 : 0),
    throttle: held.has('ArrowUp') || held.has('KeyW') ? 1 : 0,
    brake: held.has('ArrowDown') || held.has('KeyS') ? 1 : 0,
    wheelie: held.has('Space') || held.has('ShiftLeft') || held.has('ShiftRight'),
  };
};

export class KeyboardInput implements InputSource {
  private readonly held = new Set<string>();

  constructor(
    private readonly target: Window,
    private readonly onMenu: (a: MenuAction) => void,
  ) {
    target.addEventListener('keydown', this.down);
    target.addEventListener('keyup', this.up);
    target.addEventListener('blur', this.clear);
  }

  private readonly down = (e: KeyboardEvent): void => {
    if (e.code in MENU_KEYS || e.code.startsWith('Shift')) e.preventDefault();
    if (!e.repeat) {
      const a = MENU_KEYS[e.code];
      if (a) this.onMenu(a);
    }
    this.held.add(e.code);
  };

  private readonly up = (e: KeyboardEvent): void => {
    this.held.delete(e.code);
  };

  private readonly clear = (): void => this.held.clear();

  poll(): Partial<ControlState> {
    return controlsFromKeys(this.held);
  }

  dispose(): void {
    this.target.removeEventListener('keydown', this.down);
    this.target.removeEventListener('keyup', this.up);
    this.target.removeEventListener('blur', this.clear);
  }
}
