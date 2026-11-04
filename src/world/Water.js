import * as THREE from 'three';
import { createWaterNormalTexture } from './textures.js';
import { waveOffset } from './waterMath.js';

let sharedNormals = null;
function getSharedNormals() {
  if (!sharedNormals) sharedNormals = createWaterNormalTexture();
  return sharedNormals;
}

/**
 * Transparent water surface for one rectangular body.
 * - Alpha transparency (opacity 0.6) so the tiled floor shows through.
 * - Two scrolling normal maps (base + clearcoat) at different scales and
 *   directions, which create organic, non-repeating ripples.
 * - Low roughness, clearcoat and an environment map for sharp highlights.
 * - Small vertex swell; segment count scales with the body size.
 */
export class Water {
  constructor({ width, length, level, centerX = 0, centerZ = 0, envMap = null, segCap = 64 }) {
    this.level = level;
    this.centerX = centerX;
    this.centerZ = centerZ;
    this.width = width;
    this.length = length;

    const base = getSharedNormals();
    this.primaryNormal = base.clone();
    this.primaryNormal.repeat.set(width / 3, length / 3);
    this.primaryNormal.needsUpdate = true;
    this.secondaryNormal = base.clone();
    this.secondaryNormal.repeat.set(width / 5.5, length / 5.5);
    this.secondaryNormal.needsUpdate = true;

    this.material = new THREE.MeshPhysicalMaterial({
      color: '#47d9e6',
      transparent: true,
      opacity: 0.6,
      roughness: 0.08,
      metalness: 0,
      ior: 1.333,
      specularIntensity: 1,
      specularColor: new THREE.Color('#ffffff'),
      clearcoat: 1,
      clearcoatRoughness: 0.03,
      normalMap: this.primaryNormal,
      normalScale: new THREE.Vector2(0.45, 0.45),
      clearcoatNormalMap: this.secondaryNormal,
      clearcoatNormalScale: new THREE.Vector2(0.3, 0.3),
      envMap,
      envMapIntensity: 1.1,
      side: THREE.DoubleSide,
      depthWrite: false
    });

    const cap = Math.max(8, Math.min(64, segCap));
    const segX = Math.max(6, Math.min(cap, Math.round(width * 3)));
    const segZ = Math.max(6, Math.min(cap, Math.round(length * 3)));
    const geometry = new THREE.PlaneGeometry(width, length, segX, segZ);
    this.basePositions = Float32Array.from(geometry.attributes.position.array);
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.name = 'water';
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.set(centerX, level, centerZ);
    this.mesh.renderOrder = 2;
  }

  /** Vertical offset in plane-local coordinates (local y maps to world -z). */
  waveOffset(localX, localY, time) {
    return waveOffset(localX, localY, time);
  }

  /** World-space surface height at (x, z). */
  heightAt(worldX, worldZ, time) {
    return this.level + this.waveOffset(worldX - this.centerX, -(worldZ - this.centerZ), time);
  }

  update(time) {
    this.primaryNormal.offset.set(time * 0.018, time * 0.011);
    this.secondaryNormal.offset.set(-time * 0.013, time * 0.021);

    const position = this.mesh.geometry.attributes.position;
    for (let index = 0; index < position.count; index += 1) {
      const x = this.basePositions[index * 3];
      const y = this.basePositions[index * 3 + 1];
      position.setZ(index, this.waveOffset(x, y, time));
    }
    position.needsUpdate = true;
  }
}
