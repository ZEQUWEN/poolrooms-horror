import * as THREE from 'three';
import { LevelCollider } from './levelLayout.js';
import { WaterSystem } from './WaterSystem.js';
import { createMaterials } from './builders/materials.js';
import { buildRoom } from './builders/rooms.js';
import { buildCorridor } from './builders/corridors.js';

/**
 * Assembles a generated level into a Three.js scene graph and exposes the
 * gameplay queries the player controller needs (ground height, standable
 * disk test, water state). All logic lives in the pure modules, so this
 * class is a thin geometry shell.
 */
export class LevelBuilder {
  constructor(level, { envMap = null } = {}) {
    this.level = level;
    this.collider = new LevelCollider(level);
    this.materials = createMaterials();
    this.group = new THREE.Group();

    for (const room of level.rooms) {
      const roomGroup = new THREE.Group();
      roomGroup.name = room.id;
      const walls = this.collider.walls.filter((wall) => wall.owner === room.id);
      buildRoom(roomGroup, room, walls, this.materials);
      this.group.add(roomGroup);
    }

    for (const corridor of level.corridors) {
      const corridorGroup = new THREE.Group();
      corridorGroup.name = corridor.id;
      buildCorridor(corridorGroup, corridor, this.collider.walls, this.materials);
      this.group.add(corridorGroup);
    }

    this.waterSystem = new WaterSystem(level.waterBodies, { envMap });
    this.group.add(this.waterSystem.group);
  }

  getGroundHeight(x, z) {
    return this.collider.getGroundHeight(x, z);
  }

  canStand(x, z, radius) {
    return this.collider.canStand(x, z, radius);
  }

  resolveHorizontal(position, radius, previous) {
    return this.collider.resolveHorizontal(position, radius, previous);
  }

  getWaterState(x, z, time) {
    return this.collider.getWaterState(x, z, time);
  }

  update(time) {
    this.waterSystem.update(time);
  }

  dispose() {
    this.group.traverse((object) => {
      if (object.isMesh) {
        object.geometry.dispose();
      }
    });
    this.waterSystem.dispose();
  }
}
