import * as THREE from 'three';
import { Water } from './Water.js';

/**
 * Owns one Water mesh per generated water body (room basins and corridor
 * channels) and animates them together. Gameplay queries (water level,
 * submersion) live in LevelCollider so logic stays independent of Three.js.
 */
export class WaterSystem {
  constructor(bodies, { envMap = null, segCap = 64 } = {}) {
    this.bodies = bodies;
    this.group = new THREE.Group();
    this.surfaces = bodies.map((body) => {
      const width = body.rect.x1 - body.rect.x0;
      const length = body.rect.z1 - body.rect.z0;
      const water = new Water({
        width,
        length,
        level: body.level,
        centerX: body.centerX ?? (body.rect.x0 + body.rect.x1) / 2,
        centerZ: body.centerZ ?? (body.rect.z0 + body.rect.z1) / 2,
        envMap,
        segCap
      });
      this.group.add(water.mesh);
      return water;
    });
  }

  update(time) {
    for (const water of this.surfaces) water.update(time);
  }

  dispose() {
    for (const water of this.surfaces) {
      water.mesh.geometry.dispose();
      water.material.dispose();
    }
  }
}
