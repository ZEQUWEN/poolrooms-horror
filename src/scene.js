import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { QUALITY_PROFILES } from './settings.js';
import { generateLevel } from './world/levelGen.js';
import { flickerFactor, rankSpecsForPosition } from './world/lightMath.js';
import { LevelBuilder } from './world/LevelBuilder.js';
import { PlayerController } from './player/PlayerController.js';

const AIR_FOG = new THREE.Color('#08212a');
const WATER_FOG = new THREE.Color('#0a5a66');
const UNDERWATER_FOG_MULTIPLIER = 2.8;
const MAX_POINT_LIGHTS = 16;
const MOBILE_POINT_LIGHTS = 8;
const RELIGHT_INTERVAL = 0.25;

export function isCoarsePointer() {
  return typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)')?.matches === true;
}

function pickSeed() {
  const param = new URLSearchParams(window.location.search).get('seed');
  if (param !== null && Number.isFinite(Number(param))) return Math.abs(Math.trunc(Number(param))) || 1;
  return 1 + Math.floor(Math.random() * 0xffffff);
}

export class GameEngine {
  constructor(canvas, settings) {
    this.canvas = canvas;
    this.clock = new THREE.Clock();
    this.submerged = false;
    this.profile = QUALITY_PROFILES.medium;

    this.coarse = isCoarsePointer();
    this.maxPointLights = this.coarse ? MOBILE_POINT_LIGHTS : MAX_POINT_LIGHTS;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !this.coarse });
    this.renderer.shadowMap.enabled = !this.coarse;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;

    this.scene = new THREE.Scene();
    this.scene.background = AIR_FOG.clone();
    this.scene.fog = new THREE.FogExp2(AIR_FOG.clone(), this.profile.fogDensity);
    this.camera = new THREE.PerspectiveCamera(72, 1, 0.05, 160);

    // Environment map is used only by the water, for specular reflections.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    this.seed = pickSeed();
    this.level = generateLevel({ seed: this.seed, roomCount: 7 });
    this.world = new LevelBuilder(this.level, { envMap: this.environment, segCap: this.coarse ? 20 : 64 });
    this.scene.add(this.world.group);

    this.createLights();

    const { spawn } = this.level;
    this.player = new PlayerController(this.camera, canvas, this.world, new THREE.Vector3(spawn.x, 0, spawn.z));
    this.camera.lookAt(spawn.lookX, 0.2, spawn.lookZ);
    this.player.addEventListener('statechange', (event) => {
      this.submerged = event.detail.submerged;
      this.updateFog();
    });

    this.resize();
    window.addEventListener('resize', () => this.resize());
    settings.subscribe((values, changedKey) => {
      if (changedKey === 'quality' || changedKey === null) this.applyQuality(values.quality);
    });
    this.renderer.setAnimationLoop(() => this.frame());
  }

  createLights() {
    this.scene.add(new THREE.HemisphereLight('#bff9ff', '#0a1c22', 1.1));

    // Procedural light specs from the generator (ceiling fixtures, window
    // glows, pool glows, corridor lamps...) flattened with floor offsets.
    // A fixed pool of PointLights is re-bound to the nearest/most important
    // specs every RELIGHT_INTERVAL seconds, so any number of generated
    // lights stays within the forward-renderer budget.
    this.lightSpecs = [];
    this.level.floors.forEach((floor, index) => {
      const offset = this.world.floorOffset(index);
      for (const spec of floor.lights) {
        this.lightSpecs.push({
          ...spec,
          position: [spec.position[0], spec.position[1] + offset, spec.position[2]]
        });
      }
    });
    this.lightPool = [];
    for (let i = 0; i < this.maxPointLights; i += 1) {
      const light = new THREE.PointLight('#ffffff', 0, 10, 2);
      light.userData.spec = null;
      this.scene.add(light);
      this.lightPool.push(light);
    }
    this.relightTimer = 0;

    // Two shadow-casting accent lights at the spawn room.
    const spawnRoom = this.level.floors[0].rooms[0];
    const cx = (spawnRoom.rect.x0 + spawnRoom.rect.x1) / 2;
    const cz = (spawnRoom.rect.z0 + spawnRoom.rect.z1) / 2;
    this.magentaLight = this.createShadowLight('#ff3cb4', 42, [cx - 6.5, 3.2, cz - 2]);
    this.cyanLight = this.createShadowLight('#2fe9ff', 38, [cx + 6.5, 2.6, cz - 3]);
    this.shadowLights = [this.magentaLight, this.cyanLight];
  }

  /** Re-bind the light pool to nearby specs and animate flicker/breathing. */
  updateLighting(delta, elapsed) {
    this.relightTimer -= delta;
    if (this.relightTimer <= 0) {
      this.relightTimer = RELIGHT_INTERVAL;
      const order = rankSpecsForPosition(this.lightSpecs, this.camera.position, this.lightPool.length);
      this.lightPool.forEach((light, k) => {
        const spec = this.lightSpecs[order[k]] ?? null;
        light.userData.spec = spec;
        if (!spec) return;
        light.color.set(spec.color);
        light.distance = spec.distance;
        light.position.set(spec.position[0], spec.position[1], spec.position[2]);
      });
    }
    // Intensity is smoothed so re-binds never pop and flicker feels organic.
    const smooth = 1 - Math.exp(-12 * delta);
    for (const light of this.lightPool) {
      const spec = light.userData.spec;
      let target = 0;
      if (spec) {
        target = spec.intensity * (spec.flicker ? flickerFactor(spec.flicker, elapsed) : 1);
        if (spec.kind === 'window') target *= 0.94 + Math.sin(elapsed * 0.8 + spec.position[0]) * 0.06;
      }
      light.intensity += (target - light.intensity) * smooth;
    }
  }

  createShadowLight(color, intensity, position) {
    const light = new THREE.PointLight(color, intensity, 20, 2);
    light.position.set(...position);
    light.castShadow = !this.coarse;
    light.shadow.bias = -0.0015;
    light.shadow.normalBias = 0.02;
    light.shadow.camera.near = 0.1;
    light.shadow.camera.far = 22;
    this.scene.add(light);
    return light;
  }

  applyQuality(name) {
    this.profile = QUALITY_PROFILES[name] ?? QUALITY_PROFILES.medium;
    // Mobile GPUs: cap the drawing buffer even on higher profiles.
    const ratioCap = this.coarse ? 1.35 : 4;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.profile.pixelRatio, ratioCap));
    for (const light of this.shadowLights) {
      light.shadow.mapSize.set(this.profile.shadowMapSize, this.profile.shadowMapSize);
      // Dispose the old render target so the renderer allocates one at the new size.
      if (light.shadow.map) {
        light.shadow.map.dispose();
        light.shadow.map = null;
      }
    }
    this.updateFog();
    this.resize();
  }

  baseFogDensity() {
    return this.profile.fogDensity * (this.submerged ? UNDERWATER_FOG_MULTIPLIER : 1);
  }

  updateFog() {
    const color = this.submerged ? WATER_FOG : AIR_FOG;
    this.scene.fog.color.copy(color);
    this.scene.background.copy(color);
    this.scene.fog.density = this.baseFogDensity();
  }

  resize() {
    const { clientWidth, clientHeight } = this.canvas;
    this.camera.aspect = clientWidth / clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(clientWidth, clientHeight, false);
  }

  frame() {
    const delta = this.clock.getDelta();
    const elapsed = this.clock.elapsedTime;

    this.world.update(elapsed);
    this.player.update(delta, elapsed);
    this.updateLighting(delta, elapsed);

    const baseDensity = this.baseFogDensity();
    this.scene.fog.density = this.profile.dynamicFog
      ? baseDensity * (1 + Math.sin(elapsed * 0.35) * 0.08)
      : baseDensity;

    this.magentaLight.intensity = 42 + Math.sin(elapsed * 0.7) * 3;
    this.cyanLight.intensity = 38 + Math.cos(elapsed * 0.55) * 3;
    this.renderer.render(this.scene, this.camera);
  }
}
