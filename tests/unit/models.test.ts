// @vitest-environment jsdom
import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { CHARACTERS } from '../../src/content/characters';
import { STAGES } from '../../src/content/stages';
import { buildBike, solveTwoBone } from '../../src/render/bikeModel';
import { VEHICLE_KINDS, VEHICLES } from '../../src/content/vehicles';
import { buildCity } from '../../src/render/cityBuilder';
import { obstacleModel, poseObstacle } from '../../src/render/sceneryStyle';
import { buildVehicle } from '../../src/render/vehicleModel';
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
  it.each(STAGES.map((s) => [s.id, s] as const))(
    '%s: creates a mesh per shop window, explosive crate, obstacle and level crossing',
    (_id, stage) => {
      const world = new World(stage, CHARACTERS[0]!);
      const city = buildCity(world);
      expect(city.panes).toHaveLength(world.routes.length);
      world.routes.forEach((r, i) => expect(city.panes[i]).toHaveLength(r.panes.length));
      expect(city.pickups).toHaveLength(world.pickups.length);
      expect(city.obstacles).toHaveLength(world.obstacles.length);
      expect(city.crossings).toHaveLength(world.crossings.length);
      for (const c of city.crossings) expect(c.hinges).toHaveLength(2);
      expect(city.root.children.length).toBeGreaterThan(20);
    },
  );

  it('poses knocked-over obstacles and stands them back up', () => {
    for (const kind of ['cones', 'barrier', 'fountain'] as const) {
      const g = obstacleModel(kind);
      const before = g.clone(true);
      poseObstacle(kind, g, true);
      if (kind !== 'fountain') expect(JSON.stringify(g.toJSON())).not.toBe(JSON.stringify(before.toJSON()));
      poseObstacle(kind, g, false);
      g.updateMatrixWorld(true);
      before.updateMatrixWorld(true);
      g.children.forEach((c, i) => expect(c.matrixWorld.equals(before.children[i]!.matrixWorld)).toBe(true));
    }
  });

  it('builds every traffic vehicle kind', () => {
    for (const kind of VEHICLE_KINDS) {
      const g = buildVehicle(kind, 1);
      const box = new THREE.Box3().setFromObject(g);
      const size = box.getSize(new THREE.Vector3());
      expect(size.z).toBeGreaterThan(VEHICLES[kind].length * 0.9);
      expect(size.z).toBeLessThan(VEHICLES[kind].length * 1.1);
    }
  });

  it('lights up traffic vehicles only at night', () => {
    const glows = (g: THREE.Object3D): number => g.children.filter((c) => c.name === 'nightGlow').length;
    for (const kind of VEHICLE_KINDS) {
      expect(glows(buildVehicle(kind, 1))).toBe(0);
      expect(glows(buildVehicle(kind, 1, true))).toBe(2);
    }
  });

  it('adds street lamp, tunnel and shop window light only to night stages', () => {
    const additive = (root: THREE.Object3D): number => {
      let n = 0;
      root.traverse((o) => {
        if (o instanceof THREE.Mesh && (o.material as THREE.Material).blending === THREE.AdditiveBlending) n++;
      });
      return n;
    };
    for (const stage of STAGES) {
      const n = additive(buildCity(new World(stage, CHARACTERS[0]!)).root);
      if (stage.theme.night) expect(n).toBeGreaterThan(3);
      else expect(n).toBe(0);
    }
  });
});
