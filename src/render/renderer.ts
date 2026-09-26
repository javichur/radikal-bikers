import * as THREE from 'three';
import type { CharacterDef } from '../content/characters';
import { damp, lerp, wrapAngle } from '../core/math';
import { BIKE } from '../sim/bike';
import type { World } from '../sim/world';
import { buildBike, BIKE_WHEEL_RADIUS, type BikeRig } from './bikeModel';
import type { SimEvent } from '../sim/events';
import { TRAIN_LENGTH } from '../sim/crossing';
import { buildCity, type CityScene } from './cityBuilder';
import { poseObstacle } from './sceneryStyle';
import { Effects } from './effects';
import { buildVehicle } from './vehicleModel';

export type CameraMode = 'chase' | 'showcase' | 'orbit';
export type RenderQuality = 'high' | 'low';

/** Owns the Three.js scene and maps the simulation state to visuals. */
export class GameRenderer {
  readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(62, 1, 0.1, 900);
  private readonly sun = new THREE.DirectionalLight(0xffffff, 2.2);
  private city: CityScene | null = null;
  private readonly effects: Effects;
  private aura: THREE.Mesh | null = null;
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
    this.effects = new Effects(this.scene);
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
      if (this.city) this.scene.remove(this.city.root);
      this.city = buildCity(world);
      this.scene.add(this.city.root);
      const t = world.stage.theme;
      this.scene.background = new THREE.Color(t.sky);
      this.scene.fog = new THREE.Fog(t.fog, 120, 520);
    }
    this.world = world;
    this.setCharacter(world.character);
    for (const g of this.vehicles.values()) this.scene.remove(g);
    this.vehicles.clear();
    this.camHeading = world.currentTrack.sample(world.bike.s).heading;
    this.effects.clear();
  }

  setCharacter(c: CharacterDef): void {
    if (this.bike) this.scene.remove(this.bike.root);
    this.bike = buildBike(c);
    this.bike.root.rotation.order = 'YXZ';
    // Pulsing shell shown while the explosive bonus is active.
    this.aura = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.25, 1),
      new THREE.MeshBasicMaterial({ color: 0xff7b00, transparent: true, opacity: 0.25, wireframe: true }),
    );
    this.aura.position.y = 0.9;
    this.aura.visible = false;
    this.bike.root.add(this.aura);
    this.scene.add(this.bike.root);
  }

  /** Visual reaction to simulation events (explosions, broken glass, bonus pickups). */
  onEvent(e: SimEvent): void {
    const world = this.world;
    if (!world) return;
    switch (e.type) {
      case 'explode': {
        const p = world.track.toWorld(e.s, e.d);
        this.effects.explosion(new THREE.Vector3(p.x, p.y + 0.8, p.z));
        this.addShake(0.9);
        break;
      }
      case 'glass': {
        const pane = this.city?.panes[e.route]?.[e.pane];
        if (pane) {
          const pos = pane.getWorldPosition(new THREE.Vector3());
          const b = world.bike;
          const p = world.currentTrack.toWorld(b.s, b.d);
          const h = p.heading - b.yaw;
          this.effects.glass(
            pos,
            new THREE.Vector3(Math.sin(h), 0, Math.cos(h)).multiplyScalar(Math.max(4, b.speed * 0.5)),
          );
        }
        this.addShake(0.3);
        break;
      }
      case 'knock':
        this.addShake(0.25);
        break;
      case 'pickup': {
        const b = world.bike;
        const p = world.currentTrack.toWorld(b.s, b.d);
        this.effects.sparkle(new THREE.Vector3(p.x, p.y + b.height + 1, p.z));
        break;
      }
      default:
        break;
    }
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
      this.syncCity(world);
      this.updateCamera(world, dt);
    }
    this.effects.update(dt);
    this.renderer.render(this.scene, this.camera);
  }

  private syncBike(world: World, rig: BikeRig, dt: number): void {
    const b = world.bike;
    const t = world.currentTrack;
    const p = t.toWorld(b.s, b.d);
    const heading = p.heading - b.yaw;
    rig.root.position.set(p.x, p.y + b.height, p.z);
    rig.root.rotation.y = heading;
    // Follow the road gradient (projected on the bike's actual direction of travel).
    const slope = b.airborne ? 0 : t.sample(b.s).slope * Math.cos(b.yaw);
    rig.root.rotation.x = lerp(rig.root.rotation.x, -Math.atan(slope), damp(10, dt));
    rig.setSteer(b.crashTimer > 0 ? 0 : -b.lean * 0.35);
    if (this.aura) {
      this.aura.visible = b.explosive > 0 && (b.explosive > 2 || Math.floor(this.time * 8) % 2 === 0);
      this.aura.rotation.y += dt * 3;
      this.aura.scale.setScalar(1 + Math.sin(this.time * 10) * 0.06);
    }
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
      g.rotation.order = 'YXZ';
      g.rotation.y = v.dir === 1 ? p.heading : p.heading + Math.PI;
      g.rotation.x = -Math.atan(world.track.sample(v.s).slope * v.dir);
    }
    for (const [id, g] of this.vehicles) {
      if (!alive.has(id)) {
        this.scene.remove(g);
        this.vehicles.delete(id);
      }
    }
  }

  /** The city is only rebuilt per stage, so dynamic bits (glass, bonuses) are synced every frame. */
  private syncCity(world: World): void {
    const city = this.city;
    if (!city) return;
    world.routes.forEach((r, i) => {
      r.panes.forEach((pane, j) => {
        const m = city.panes[i]?.[j];
        if (m) m.visible = !pane.broken;
      });
    });
    world.pickups.forEach((pk, i) => {
      const g = city.pickups[i];
      if (!g) return;
      g.visible = pk.respawn <= 0;
      const crate = g.getObjectByName('crate');
      if (crate) {
        crate.rotation.y = this.time * 1.8 + i;
        crate.position.y = Math.sin(this.time * 3 + i) * 0.15;
      }
      const spark = g.getObjectByName('spark');
      if (spark) spark.scale.setScalar(0.8 + Math.abs(Math.sin(this.time * 14 + i)) * 0.6);
    });
    world.obstacles.forEach((o, i) => {
      const g = city.obstacles[i];
      if (g) poseObstacle(o.kind, g, o.knocked);
    });
    city.crossings.forEach((c, i) => {
      const st = world.crossingAt(i);
      for (const h of c.hinges) h.object.rotation.z = h.sign * (1 - st.arm) * (Math.PI / 2);
      const blink = Math.floor(this.time * 3) % 2 === 0;
      c.lamps.forEach((m, k) => {
        const on = st.closed && blink === (k === 0);
        m.color.setHex(on ? 0xff2222 : 0x550000);
        m.emissive.setHex(on ? 0xaa0000 : 0x000000);
      });
      c.train.visible = st.trainHead !== null;
      if (st.trainHead !== null) c.train.position.x = -st.trainHead + TRAIN_LENGTH / 2;
    });
  }

  private updateCamera(world: World, dt: number): void {
    const b = world.bike;
    const p = world.currentTrack.toWorld(b.s, b.d);
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
