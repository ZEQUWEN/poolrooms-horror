import * as THREE from 'three';
import { QUALITY_PROFILES } from './settings.js';

export class PoolroomsPreview {
  constructor(canvas, settings) {
    this.canvas = canvas;
    this.settings = settings;
    this.clock = new THREE.Clock();
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.4;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#06141a');
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
    this.camera.position.set(0, 2.8, 9.5);
    this.camera.lookAt(0, 1.1, 0);

    this.createRoom();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    settings.subscribe((values, changedKey) => {
      if (changedKey === 'quality' || changedKey === null) this.applyQuality(values.quality);
    });
    this.renderer.setAnimationLoop(() => this.render());
  }

  createRoom() {
    const tileTexture = this.createTileTexture();
    const tileMaterial = new THREE.MeshStandardMaterial({ map: tileTexture, roughness: 0.6, metalness: 0.04, color: '#d7eff0' });
    const wallMaterial = tileMaterial.clone();
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(22, 22), tileMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    const backWall = new THREE.Mesh(new THREE.PlaneGeometry(22, 8), wallMaterial);
    backWall.position.set(0, 4, -6);
    backWall.receiveShadow = true;
    this.scene.add(backWall);

    const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(14, 8), wallMaterial.clone());
    leftWall.position.set(-7, 4, 1);
    leftWall.rotation.y = Math.PI / 2;
    this.scene.add(leftWall);

    const waterGeometry = new THREE.PlaneGeometry(12.5, 8, 45, 45);
    this.water = new THREE.Mesh(waterGeometry, new THREE.MeshPhysicalMaterial({
      color: '#37d8e8', transparent: true, opacity: 0.76, roughness: 0.12, metalness: 0.18,
      clearcoat: 0.9, clearcoatRoughness: 0.08
    }));
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.set(0, 0.08, -0.7);
    this.scene.add(this.water);

    const archMaterial = new THREE.MeshStandardMaterial({ map: tileTexture, roughness: 0.68, color: '#d9eef0' });
    for (const [x, z, radius] of [[0, -5.85, 3.3], [0, -4.9, 2.25]]) {
      const arch = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.28, 12, 48, Math.PI), archMaterial);
      arch.position.set(x, radius, z);
      arch.rotation.y = Math.PI;
      arch.castShadow = true;
      this.scene.add(arch);
    }

    const ceilingLight = new THREE.RectAreaLight('#b8f6ff', 14, 10, 1.2);
    ceilingLight.position.set(0, 6.3, 0);
    ceilingLight.rotation.x = Math.PI / 2;
    this.scene.add(ceilingLight);

    this.magentaLight = new THREE.PointLight('#ff3cb4', 22, 13, 2);
    this.magentaLight.position.set(-4.8, 3, 1);
    this.magentaLight.castShadow = true;
    this.scene.add(this.magentaLight);

    this.cyanLight = new THREE.PointLight('#2fe9ff', 25, 14, 2);
    this.cyanLight.position.set(4.4, 2.4, -1.2);
    this.cyanLight.castShadow = true;
    this.scene.add(this.cyanLight);

    this.scene.add(new THREE.HemisphereLight('#b8ffff', '#07141b', 1.4));
  }

  createTileTexture() {
    const tileCanvas = document.createElement('canvas');
    tileCanvas.width = tileCanvas.height = 256;
    const context = tileCanvas.getContext('2d');
    context.fillStyle = '#d4e7e5';
    context.fillRect(0, 0, 256, 256);
    context.strokeStyle = '#789a9e';
    context.lineWidth = 4;
    for (let position = 0; position <= 256; position += 32) {
      context.beginPath(); context.moveTo(position, 0); context.lineTo(position, 256); context.stroke();
      context.beginPath(); context.moveTo(0, position); context.lineTo(256, position); context.stroke();
    }
    const texture = new THREE.CanvasTexture(tileCanvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(7, 7);
    return texture;
  }

  applyQuality(name) {
    const profile = QUALITY_PROFILES[name];
    this.profile = profile;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, profile.pixelRatio));
    [this.magentaLight, this.cyanLight].forEach((light) => {
      light.shadow.mapSize.set(profile.shadowMapSize, profile.shadowMapSize);
      light.shadow.needsUpdate = true;
    });
    this.scene.fog = new THREE.FogExp2('#08212a', profile.fogDensity);
    this.resize();
  }

  resize() {
    const { clientWidth, clientHeight } = this.canvas;
    this.camera.aspect = clientWidth / clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(clientWidth, clientHeight, false);
  }

  render() {
    const elapsed = this.clock.getElapsedTime();
    const position = this.water.geometry.attributes.position;
    for (let index = 0; index < position.count; index += 1) {
      const x = position.getX(index);
      const y = position.getY(index);
      position.setZ(index, Math.sin(x * 1.4 + elapsed * 1.1) * 0.045 + Math.cos(y * 1.1 + elapsed * 0.9) * 0.035);
    }
    position.needsUpdate = true;
    if (this.profile?.dynamicFog) this.scene.fog.density = this.profile.fogDensity + Math.sin(elapsed * 0.35) * 0.004;
    this.magentaLight.intensity = 20 + Math.sin(elapsed * 0.7) * 2;
    this.cyanLight.intensity = 23 + Math.cos(elapsed * 0.55) * 2;
    this.renderer.render(this.scene, this.camera);
  }
}
