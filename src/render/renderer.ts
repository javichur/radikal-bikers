import * as THREE from 'three';
import type { CharacterDef } from '../content/characters';
import { damp, lerp, wrapAngle } from '../core/math';
import { BIKE } from '../sim/bike';
import type { World } from '../sim/world';
import { buildBike, BIKE_WHEEL_RADIUS, type BikeRig } from './bikeModel';
import { buildCity } from './cityBuilder';
import { buildVehicle } from './vehicleModel';

export type CameraMode = 'chase' | 'showcase' | 'orbit';
export type RenderQuality = 'high' | 'low';

/** Owns the Three.js scene and maps the simulation state to visuals. */
export class GameRenderer {
  readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(62, 1, 0.1, 900);
  private readonly sun = new THREE.DirectionalLight(0xffffff, 2.2);
  private city: THREE.Group | null = null;
  private bike: BikeRig | null = null;
  private readonly vehicles = new Map<number, THREE.Group>();
  private world: World | null = null;
  private camHeading = 0;
  private shake = 0;
  private time = 0;
  mode: CameraMode = 'orbit';

  constructor(
    private readonly canvas: HTMLCanvasElement,
    quality: RenderQuality = 'high',
  ) {
    const high = quality === 'high';
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: high, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = high;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.setPixelRatio(high ? Math.min(window.devicePixelRatio, 2) : 0.5);

    this.scene.add(new THREE.HemisphereLight(0xdff3ff, 0x6b8f4e, 1.4));
    this.sun.position.set(40, 80, -30);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -45;
    sc.right = 45;
    sc.top = 45;
    sc.bottom = -45;
    sc.near = 1;
    sc.far = 220;
    this.sun.shadow.bias = -0.0005;
    this.scene.add(this.sun, this.sun.target);
    this.resize();
  }

  resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setWorld(world: World): void {
    if (this.world?.stage.id !== world.stage.id || !this.city) {
      if (this.city) this.scene.remove(this.city);
      this.city = buildCity(world);
      this.scene.add(this.city);
      const t = world.stage.theme;
      this.scene.background = new THREE.Color(t.sky);
      this.scene.fog = new THREE.Fog(t.fog, 120, 520);
    }
    this.world = world;
    this.setCharacter(world.character);
    for (const g of this.vehicles.values()) this.scene.remove(g);
    this.vehicles.clear();
    this.camHeading = world.track.sample(world.bike.s).heading;
  }

  setCharacter(c: CharacterDef): void {
    if (this.bike) this.scene.remove(this.bike.root);
    this.bike = buildBike(c);
    this.scene.add(this.bike.root);
  }

  addShake(amount: number): void {
    this.shake = Math.max(this.shake, amount);
  }

  render(dt: number): void {
    this.time += dt;
    const world = this.world;
    if (world && this.bike) {
      this.syncBike(world, this.bike, dt);
      this.syncTraffic(world);
      this.updateCamera(world, dt);
    }
    this.renderer.render(this.scene, this.camera);
  }

  private syncBike(world: World, rig: BikeRig, dt: number): void {
    const b = world.bike;
    const p = world.track.toWorld(b.s, b.d);
    const heading = p.heading - b.yaw;
    rig.root.position.set(p.x, p.y + b.height, p.z);
    rig.root.rotation.y = heading;
    const crashed = b.crashTimer > 0;
    rig.lean.rotation.z = crashed ? lerp(rig.lean.rotation.z, 1.35, damp(6, dt)) : b.lean * 0.45;
    rig.pitch.rotation.x = -b.wheelie * 0.55 + (b.airborne ? -Math.min(0.25, b.vy * 0.02) : 0);
    const spin = (b.speed / BIKE_WHEEL_RADIUS) * dt;
    rig.frontWheel.rotation.x += spin;
    rig.rearWheel.rotation.x += spin;
    // Blink while invulnerable after respawn.
    rig.root.visible = b.invulnerable <= 0 || Math.floor(this.time * 12) % 2 === 0;
    this.sun.position.set(p.x + 40, p.y + 80, p.z - 30);
    this.sun.target.position.set(p.x, p.y, p.z);
  }

  private syncTraffic(world: World): void {
    const alive = new Set<number>();
    for (const v of world.traffic.vehicles) {
      alive.add(v.id);
      let g = this.vehicles.get(v.id);
      if (!g) {
        g = buildVehicle(v.kind, v.variant);
        this.vehicles.set(v.id, g);
        this.scene.add(g);
      }
      const p = world.track.toWorld(v.s, v.d);
      g.position.set(p.x, p.y, p.z);
      g.rotation.y = v.dir === 1 ? p.heading : p.heading + Math.PI;
    }
    for (const [id, g] of this.vehicles) {
      if (!alive.has(id)) {
        this.scene.remove(g);
        this.vehicles.delete(id);
      }
    }
  }

  private updateCamera(world: World, dt: number): void {
    const b = world.bike;
    const p = world.track.toWorld(b.s, b.d);
    const target = new THREE.Vector3(p.x, p.y + b.height * 0.6, p.z);

    if (this.mode === 'chase') {
      const heading = p.heading - b.yaw * 0.6;
      this.camHeading += wrapAngle(heading - this.camHeading) * damp(5, dt);
      const speedRatio = Math.max(0, b.speed) / (world.character.stats.topSpeed * BIKE.wheelieBoost);
      const dist = 6.2 + speedRatio * 1.6;
      const fx = Math.sin(this.camHeading);
      const fz = Math.cos(this.camHeading);
      const desired = new THREE.Vector3(target.x - fx * dist, target.y + 2.8, target.z - fz * dist);
      this.camera.position.lerp(desired, damp(10, dt));
      const look = new THREE.Vector3(target.x + fx * 6, target.y + 1.2, target.z + fz * 6);
      this.camera.fov = lerp(this.camera.fov, 60 + speedRatio * 14, damp(3, dt));
      if (this.shake > 0) {
        this.camera.position.x += (Math.random() - 0.5) * this.shake;
        this.camera.position.y += (Math.random() - 0.5) * this.shake;
        this.shake = Math.max(0, this.shake - dt * 2);
      }
      this.camera.lookAt(look);
    } else if (this.mode === 'showcase') {
      const a = this.time * 0.6 + p.heading;
      this.camera.position.set(target.x + Math.sin(a) * 4, target.y + 1.6, target.z + Math.cos(a) * 4);
      this.camera.lookAt(target.x, target.y + 0.9, target.z);
      this.camera.fov = 45;
    } else {
      const a = this.time * 0.08;
      this.camera.position.set(target.x + Math.sin(a) * 60, target.y + 28, target.z + Math.cos(a) * 60);
      this.camera.lookAt(target.x, target.y + 4, target.z + 40);
      this.camera.fov = 55;
    }
    this.camera.updateProjectionMatrix();
  }
}
