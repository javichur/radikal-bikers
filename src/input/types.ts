/** Abstract, device-independent controls consumed by the simulation. */
export interface ControlState {
  /** -1 (left) .. 1 (right) */
  steer: number;
  /** 0..1 */
  throttle: number;
  /** 0..1 */
  brake: number;
  wheelie: boolean;
}

/** Edge-triggered menu/meta actions. */
export type MenuAction = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back' | 'pause';

export interface InputSource {
  poll(): Partial<ControlState>;
  dispose(): void;
}

export const neutralControls = (): ControlState => ({
  steer: 0,
  throttle: 0,
  brake: 0,
  wheelie: false,
});

/** Merges several sources: strongest analogue value wins, buttons are OR-ed. */
export const combineControls = (parts: readonly Partial<ControlState>[]): ControlState => {
  const out = neutralControls();
  for (const p of parts) {
    if (p.steer !== undefined && Math.abs(p.steer) > Math.abs(out.steer)) out.steer = p.steer;
    if (p.throttle !== undefined) out.throttle = Math.max(out.throttle, p.throttle);
    if (p.brake !== undefined) out.brake = Math.max(out.brake, p.brake);
    if (p.wheelie) out.wheelie = true;
  }
  out.steer = Math.max(-1, Math.min(1, out.steer));
  out.throttle = Math.max(0, Math.min(1, out.throttle));
  out.brake = Math.max(0, Math.min(1, out.brake));
  return out;
};
