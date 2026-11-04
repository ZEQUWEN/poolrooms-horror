import * as THREE from 'three';
import { LevelCollider } from './levelLayout.js';
import { WaterSystem } from './WaterSystem.js';
import { createMaterials } from './builders/materials.js';
import { buildRoom } from './builders/rooms.js';
import { buildCorridor } from './builders/corridors.js';
import { GEN_CONFIG } from './levelGen.js';

const FLOOR_OFFSETS = [0, GEN_CONFIG.floorGap, -GEN_CONFIG.floorGap];

/**
 * Assembles every floor of a generated level into one Three.js scene graph
 * (floors are stacked vertically by FLOOR_OFFSETS) and exposes the gameplay
 * queries the player controller needs: ground height, standable disk test,
 * water state and vertical connector triggers. All logic lives in the pure
 * modules, so this class is a thin geometry shell.
 */
export class LevelBuilder {
  constructor(level, { envMap = null, segCap = 64 } = {}) {
    this.level = level;
    this.materials = createMaterials();
    this.group = new THREE.Group();
    this.colliders = [];
    this.waterSystems = [];

    level.floors.forEach((floor, index) => {
      const collider = new LevelCollider(floor);
      this.colliders.push(collider);

      const floorGroup = new THREE.Group();
      floorGroup.name = `floor-${index}`;
      floorGroup.position.y = this.floorOffset(index);

      for (const room of floor.rooms) {
        const roomGroup = new THREE.Group();
        roomGroup.name = room.id;
        const walls = collider.walls.filter((wall) => wall.owner === room.id);
        buildRoom(roomGroup, room, walls, this.materials);
        floorGroup.add(roomGroup);
      }
      for (const corridor of floor.corridors) {
        const corridorGroup = new THREE.Group();
        corridorGroup.name = corridor.id;
        buildCorridor(corridorGroup, corridor, collider.walls, this.materials);
        floorGroup.add(corridorGroup);
      }

      const waterSystem = new WaterSystem(floor.waterBodies, { envMap, segCap });
      floorGroup.add(waterSystem.group);
      this.waterSystems.push(waterSystem);
      this.group.add(floorGroup);
    });
  }

  floorOffset(floor) {
    return FLOOR_OFFSETS[floor] ?? 0;
  }

  collider(floor) {
    return this.colliders[floor] ?? this.colliders[0];
  }

  getGroundHeight(x, z, floor = 0) {
    return this.collider(floor).getGroundHeight(x, z);
  }

  canStand(x, z, radius, floor = 0) {
    return this.collider(floor).canStand(x, z, radius);
  }

  getWaterState(x, z, time, floor = 0) {
    return this.collider(floor).getWaterState(x, z, time);
  }

  /** Vertical connector (stair hatch / floor hatch) triggered at this spot. */
  checkVertical(floor, x, z, y) {
    for (const conn of this.level.vertical) {
      if (conn.floor !== floor) continue;
      if (x <= conn.rect.x0 || x >= conn.rect.x1 || z <= conn.rect.z0 || z >= conn.rect.z1) continue;
      if (conn.type === 'up' ? y >= conn.triggerY : y <= conn.triggerY) return conn;
    }
    return null;
  }

  update(time) {
    for (const waterSystem of this.waterSystems) waterSystem.update(time);
  }

  dispose() {
    this.group.traverse((object) => {
      if (object.isMesh) object.geometry.dispose();
    });
    for (const waterSystem of this.waterSystems) waterSystem.dispose();
  }
}
