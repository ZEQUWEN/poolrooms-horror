import * as THREE from 'three';
import { createWaterNormalTexture } from './textures.js';

/**
 * Transparent water surface.
 * - Alpha transparency (opacity 0.6) so the tiled pool floor shows through.
 * - Two scrolling normal maps (base normal + clearcoat normal) at different
 *   scales and directions, which create organic, non-repeating ripples.
 * - Low roughness, clearcoat, and an environment map for sharp specular highlights.
 * - Small vertex swell for gentle surface motion.
 */
export class Water {
  constructor({ width, length, level, centerX = 0, centerZ = 0, envMap = null }) {
    this.level = level;
    this.centerX = centerX;
    this.centerZ = centerZ;

    this.primaryNormal = createWaterNormalTexture();
    this.primaryNormal.repeat.set(width / 3, length / 3);
    this.secondaryNormal = this.primaryNormal.clone();
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

    const geometry = new THREE.PlaneGeometry(width, length, 48, 40);
    this.basePositions = Float32Array.from(geometry.attributes.position.array);
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.name = 'water';
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.set(centerX, level, centerZ);
    this.mesh.renderOrder = 2;
  }

  /** Vertical offset in plane-local coordinates (local y maps to world -z). */
  waveOffset(localX, localY, time) {
    return Math.sin(localX * 0.9 + time * 0.8) * 0.018 + Math.cos(localY * 1.2 + time * 0.65) * 0.014;
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
