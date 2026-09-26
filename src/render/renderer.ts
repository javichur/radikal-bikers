import * as THREE from 'three';
import type { CharacterDef } from '../content/characters';
import { damp, lerp, wrapAngle } from '../core/math';
import { BIKE } from '../sim/bike';
import { ghostPose, type GhostData } from '../sim/ghost';
import type { Track } from '../sim/track';
import type { World } from '../sim/world';
import { buildBike, BIKE_WHEEL_RADIUS, type BikeRig } from './bikeModel';
import type { SimEvent } from '../sim/events';
import { TRAIN_LENGTH } from '../sim/crossing';
import { buildCity, type CityScene } from './cityBuilder';
import { poseObstacle } from './sceneryStyle';
import { Effects } from './effects';
import { toon } from './materials';
import { buildVehicle } from './vehicleModel';

export type CameraMode = 'chase' | 'showcase' | 'orbit';
export type RenderQuality = 'high' | 'low';

interface RigPose {
  readonly s: number;
  readonly d: number;
  readonly yaw: number;
  readonly height: number;
  readonly wheelie: number;
  readonly lean: number;
  readonly speed: number;
  readonly airborne: boolean;
  readonly crashed: boolean;
  readonly vy: number;
}

/** Turns a bike model into a translucent "ghost" (own materials, no outlines). */
const ghostify = (rig: BikeRig): void => {
  rig.root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    o.castShadow = false;
    const mats = (Array.isArray(o.material) ? o.material : [o.material]) as THREE.Material[];
    if (mats.some((m) => m.side === THREE.BackSide)) {
      o.visible = false;
      return;
    }
    const clone = mats.map((m) => {
      const c = m.clone();
      c.transparent = true;
      c.opacity = 0.35;
      c.depthWrite = false;
      return c;
    });
    o.material = Array.isArray(o.material) ? clone : clone[0]!;
  });
};

const CONE_COLOR = 0xff7b00;

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
  private rival: BikeRig | null = null;
  private ghostRig: BikeRig | null = null;
  private ghost: GhostData | null = null;
  private readonly cones = new THREE.Group();
  private readonly hemi = new THREE.HemisphereLight(0xdff3ff, 0x6b8f4e, 1.4);
  private readonly headlight = new THREE.PointLight(0xfff1c1, 0, 30, 1.5);
  private sparkCooldown = 0;
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

    this.scene.add(this.hemi, this.headlight, this.cones);
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
      this.scene.fog = new THREE.Fog(t.fog, t.night ? 70 : 120, t.night ? 380 : 520);
      this.hemi.intensity = t.night ? 0.55 : 1.4;
      this.hemi.color.set(t.night ? 0x8d99ff : 0xdff3ff);
      this.sun.intensity = t.night ? 0.5 : 2.2;
      this.sun.color.set(t.night ? 0xb8c0ff : 0xffffff);
      this.headlight.intensity = t.night ? 40 : 0;
    }
    this.world = world;
    this.setCharacter(world.character);
    if (this.rival) this.scene.remove(this.rival.root);
    this.rival = null;
    if (world.rival) {
      this.rival = buildBike(world.rival.character);
      this.rival.root.rotation.order = 'YXZ';
      this.scene.add(this.rival.root);
    }
    this.buildCones(world);
    this.setGhost(null);
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

  /** Best-run ghost to replay next to the player (null hides it). */
  setGhost(ghost: GhostData | null): void {
    this.ghost = ghost;
    if (this.ghostRig) this.scene.remove(this.ghostRig.root);
    this.ghostRig = null;
    if (ghost && this.world) {
      this.ghostRig = buildBike(this.world.character);
      this.ghostRig.root.rotation.order = 'YXZ';
      ghostify(this.ghostRig);
      this.scene.add(this.ghostRig.root);
    }
  }

  private buildCones(world: World): void {
    this.cones.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    this.cones.clear();
    const geo = new THREE.ConeGeometry(0.3, 0.8, 10);
    const base = new THREE.BoxGeometry(0.6, 0.06, 0.6);
    const orange = toon(CONE_COLOR);
    const white = toon(0xffffff);
    const stripe = new THREE.CylinderGeometry(0.19, 0.23, 0.12, 10);
    for (const c of world.cones) {
      const g = new THREE.Group();
      const cone = new THREE.Mesh(geo, orange);
      cone.position.y = 0.44;
      cone.castShadow = true;
      const band = new THREE.Mesh(stripe, white);
      band.position.y = 0.46;
      g.add(new THREE.Mesh(base, orange), cone, band);
      const p = world.track.toWorld(c.s, c.d);
      g.position.set(p.x, p.y, p.z);
      g.rotation.y = p.heading;
      this.cones.add(g);
    }
  }

  private bikeWorldPos(world: World, up = 0.5): THREE.Vector3 {
    const b = world.bike;
    const p = world.currentTrack.toWorld(b.s, b.d);
    return new THREE.Vector3(p.x, p.y + b.height + up, p.z);
  }

  /** Visual reaction to simulation events (explosions, broken glass, bonus pickups, sparks, smoke). */
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
      case 'pickup':
        this.effects.sparkle(this.bikeWorldPos(world, 1));
        break;
      case 'scrape': {
        if (this.sparkCooldown > 0) break;
        this.sparkCooldown = 0.06;
        const b = world.bike;
        const p = world.currentTrack.toWorld(b.s, b.d + Math.sign(b.d) * 0.4);
        const h = p.heading - b.yaw;
        const back = new THREE.Vector3(-Math.sin(h), 0.5, -Math.cos(h)).multiplyScalar(Math.max(2, b.speed * 0.2));
        this.effects.sparks(new THREE.Vector3(p.x, p.y + 0.4, p.z), back);
        break;
      }
      case 'crash':
        this.effects.smoke(this.bikeWorldPos(world, 0.4));
        break;
      case 'land':
        this.effects.dust(this.bikeWorldPos(world, 0.1));
        this.addShake(0.15);
        break;
      case 'nearMiss':
        this.addShake(0.12);
        break;
      case 'comboBanked':
        if (e.count >= 3) this.effects.confetti(this.bikeWorldPos(world, 2), Math.min(40, e.count * 5));
        break;
      case 'cone': {
        const c = world.cones[e.index];
        if (!c) break;
        const p = world.track.toWorld(c.s, c.d);
        this.effects.conePop(new THREE.Vector3(p.x, p.y + 0.5, p.z));
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
    this.sparkCooldown = Math.max(0, this.sparkCooldown - dt);
    if (world && this.bike) {
      this.syncBike(world, this.bike, dt);
      this.syncRival(world, dt);
      this.syncGhost(world, dt);
      this.syncTraffic(world);
      this.syncCity(world);
      this.updateCamera(world, dt);
    }
    this.effects.update(dt);
    this.renderer.render(this.scene, this.camera);
  }

  /** Places a bike model on a track from a pose (player, rival or ghost). */
  private poseRig(rig: BikeRig, t: Track, b: RigPose, dt: number): void {
    const p = t.toWorld(b.s, b.d);
    rig.root.position.set(p.x, p.y + b.height, p.z);
    rig.root.rotation.y = p.heading - b.yaw;
    // Follow the road gradient (projected on the bike's actual direction of travel).
    const slope = b.airborne ? 0 : t.sample(b.s).slope * Math.cos(b.yaw);
    rig.root.rotation.x = lerp(rig.root.rotation.x, -Math.atan(slope), damp(10, dt));
    rig.setSteer(b.crashed ? 0 : -b.lean * 0.35);
    rig.lean.rotation.z = b.crashed ? lerp(rig.lean.rotation.z, 1.35, damp(6, dt)) : b.lean * 0.45;
    rig.pitch.rotation.x = -b.wheelie * 0.55 + (b.airborne ? -Math.min(0.25, b.vy * 0.02) : 0);
    const spin = (b.speed / BIKE_WHEEL_RADIUS) * dt;
    rig.frontWheel.rotation.x += spin;
    rig.rearWheel.rotation.x += spin;
  }

  private syncRival(world: World, dt: number): void {
    const r = world.rival;
    if (!r || !this.rival) return;
    const b = r.bike;
    this.poseRig(this.rival, world.track, { ...b, crashed: b.crashTimer > 0 }, dt);
    this.rival.root.visible = b.invulnerable <= 0 || Math.floor(this.time * 12) % 2 === 0;
  }

  private syncGhost(world: World, dt: number): void {
    const rig = this.ghostRig;
    const g = this.ghost;
    if (!rig || !g) return;
    const t = world.race.elapsed;
    const pose = ghostPose(g, t);
    rig.root.visible = !!pose && t <= g.time + 0.5 && this.mode === 'chase';
    if (!pose) return;
    const track = pose.route < 0 ? world.track : world.routes[pose.route]?.track;
    if (!track) return;
    this.poseRig(
      rig,
      track,
      { ...pose, speed: world.character.stats.topSpeed * 0.8, airborne: pose.height > 0.05, crashed: false, vy: 0 },
      dt,
    );
  }

  private syncBike(world: World, rig: BikeRig, dt: number): void {
    const b = world.bike;
    const p = world.currentTrack.toWorld(b.s, b.d);
    this.poseRig(rig, world.currentTrack, { ...b, crashed: b.crashTimer > 0 }, dt);
    if (this.aura) {
      this.aura.visible = b.explosive > 0 && (b.explosive > 2 || Math.floor(this.time * 8) % 2 === 0);
      this.aura.rotation.y += dt * 3;
      this.aura.scale.setScalar(1 + Math.sin(this.time * 10) * 0.06);
    }
    // Blink while invulnerable after respawn.
    rig.root.visible = b.invulnerable <= 0 || Math.floor(this.time * 12) % 2 === 0;
    this.sun.position.set(p.x + 40, p.y + 80, p.z - 30);
    this.sun.target.position.set(p.x, p.y, p.z);
    const h = p.heading - b.yaw;
    this.headlight.position.set(p.x + Math.sin(h) * 4, p.y + b.height + 1.6, p.z + Math.cos(h) * 4);
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
    world.cones.forEach((c, i) => {
      const g = this.cones.children[i];
      if (g && c.hit && g.rotation.z === 0) {
        g.rotation.z = Math.PI / 2;
        g.position.y += 0.3;
      }
    });
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
