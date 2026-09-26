export const FIXED_DT = 1 / 60;
const MAX_FRAME = 0.25;

/**
 * Fixed-timestep accumulator. Simulation runs at a constant rate
 * (deterministic), rendering interpolates with `alpha`.
 */
export class FixedStepper {
  private acc = 0;

  constructor(private readonly dt = FIXED_DT) {}

  /** Returns the number of fixed steps to run for this frame. */
  advance(frameSeconds: number): number {
    this.acc += Math.min(Math.max(frameSeconds, 0), MAX_FRAME);
    let steps = 0;
    while (this.acc >= this.dt) {
      this.acc -= this.dt;
      steps++;
    }
    return steps;
  }

  get alpha(): number {
    return this.acc / this.dt;
  }

  reset(): void {
    this.acc = 0;
  }
}
