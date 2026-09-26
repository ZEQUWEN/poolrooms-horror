import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { QUALITY_PROFILES } from './settings.js';
import { PoolRoom } from './world/PoolRoom.js';
import { Water } from './world/Water.js';
import { PlayerController } from './player/PlayerController.js';

const AIR_FOG = new THREE.Color('#08212a');
const WATER_FOG = new THREE.Color('#0a5a66');
const UNDERWATER_FOG_MULTIPLIER = 2.8;

export class GameEngine {
  constructor(canvas, settings) {
    this.canvas = canvas;
    this.clock = new THREE.Clock();
    this.submerged = false;
    this.profile = QUALITY_PROFILES.medium;

    // Required for RectAreaLight to affect MeshStandard/MeshPhysical materials.
    RectAreaLightUniformsLib.init();

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;

    this.scene = new THREE.Scene();
    this.scene.background = AIR_FOG.clone();
    this.scene.fog = new THREE.FogExp2(AIR_FOG.clone(), this.profile.fogDensity);
    this.camera = new THREE.PerspectiveCamera(72, 1, 0.05, 120);

    // Environment map is used only by the water, for specular reflections.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    this.world = new PoolRoom();
    this.scene.add(this.world.group);

    const { pool } = this.world.layout;
    this.water = new Water({
      width: pool.maxX - pool.minX,
      length: pool.maxZ - pool.minZ,
      level: this.world.waterLevel,
      centerX: (pool.minX + pool.maxX) / 2,
      centerZ: (pool.minZ + pool.maxZ) / 2,
      envMap: this.environment
    });
    this.scene.add(this.water.mesh);

    this.createLights();

    this.player = new PlayerController(this.camera, canvas, this.world, this.water);
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

    const ceiling = new THREE.RectAreaLight('#c8f8ff', 7, 14, 0.9);
    ceiling.position.set(0, this.world.layout.height - 0.05, -2);
    ceiling.lookAt(0, 0, -2);
    this.scene.add(ceiling);

    this.magentaLight = this.createShadowLight('#ff3cb4', 42, [-9.5, 3.2, -2]);
    this.cyanLight = this.createShadowLight('#2fe9ff', 38, [9.5, 2.6, -3]);
    this.shadowLights = [this.magentaLight, this.cyanLight];

    // Underwater glow, similar to recessed pool lamps in the references.
    this.poolGlow = new THREE.PointLight('#35f2ff', 10, 11, 2);
    this.poolGlow.position.set(0, -1.1, -2);
    this.scene.add(this.poolGlow);
  }

  createShadowLight(color, intensity, position) {
    const light = new THREE.PointLight(color, intensity, 20, 2);
    light.position.set(...position);
    light.castShadow = true;
    light.shadow.bias = -0.0015;
    light.shadow.normalBias = 0.02;
    light.shadow.camera.near = 0.1;
    light.shadow.camera.far = 22;
    this.scene.add(light);
    return light;
  }

  applyQuality(name) {
    this.profile = QUALITY_PROFILES[name] ?? QUALITY_PROFILES.medium;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.profile.pixelRatio));
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

    this.water.update(elapsed);
    this.player.update(delta, elapsed);

    const baseDensity = this.baseFogDensity();
    this.scene.fog.density = this.profile.dynamicFog
      ? baseDensity * (1 + Math.sin(elapsed * 0.35) * 0.08)
      : baseDensity;

    this.magentaLight.intensity = 42 + Math.sin(elapsed * 0.7) * 3;
    this.cyanLight.intensity = 38 + Math.cos(elapsed * 0.55) * 3;
    this.renderer.render(this.scene, this.camera);
  }
}
