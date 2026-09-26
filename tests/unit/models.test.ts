// @vitest-environment jsdom
import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { CHARACTERS } from '../../src/content/characters';
import { STAGES } from '../../src/content/stages';
import { buildBike, solveTwoBone } from '../../src/render/bikeModel';
import { buildCity } from '../../src/render/cityBuilder';
import { World } from '../../src/sim/world';

beforeAll(() => {
  // jsdom has no 2D canvas; textures are simply left blank.
  HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
});

describe('solveTwoBone', () => {
  it('keeps both bone lengths and bends towards the pole', () => {
    const a = new THREE.Vector3(0, 0, 0);
    const b = new THREE.Vector3(0, 0, 0.5);
    const e = solveTwoBone(a, b, 0.34, 0.33, new THREE.Vector3(0, -1, 0));
    expect(e.distanceTo(a)).toBeCloseTo(0.34, 5);
    expect(e.distanceTo(b)).toBeCloseTo(0.33, 5);
    expect(e.y).toBeLessThan(0);
  });
});

describe('bike model', () => {
  it('keeps the rider hands on the handlebar grips while steering', () => {
    const rig = buildBike(CHARACTERS[0]!);
    for (const angle of [-0.4, 0, 0.4]) {
      rig.setSteer(angle);
      rig.root.updateMatrixWorld(true);
      const grips: THREE.Vector3[] = [];
      const hands: THREE.Vector3[] = [];
      rig.steer.traverse((o) => {
        if (o.type === 'Object3D') grips.push(o.getWorldPosition(new THREE.Vector3()));
      });
      rig.rider.children.forEach((o) => {
        if (o.type === 'Group' && o.children.length === 3) hands.push(o.getWorldPosition(new THREE.Vector3()));
      });
      expect(grips).toHaveLength(2);
      expect(hands).toHaveLength(2);
      for (let i = 0; i < 2; i++) expect(hands[i]!.distanceTo(grips[i]!)).toBeLessThan(0.06);
    }
  });
});

describe('city builder', () => {
  it('creates a mesh per shop window and per explosive crate', () => {
    const world = new World(STAGES[0]!, CHARACTERS[0]!);
    const city = buildCity(world);
    expect(city.panes).toHaveLength(world.routes.length);
    world.routes.forEach((r, i) => expect(city.panes[i]).toHaveLength(r.panes.length));
    expect(city.pickups).toHaveLength(world.pickups.length);
    expect(city.root.children.length).toBeGreaterThan(20);
  });
});
