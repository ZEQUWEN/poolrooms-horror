import * as THREE from 'three';
import { createTileTexture } from './textures.js';
import { POOL_LAYOUT, getGroundHeight, resolveHorizontal } from './poolLayout.js';

// One texture repeat covers 2 m, which gives 25 cm tiles (8 per repeat).
const METERS_PER_TEXTURE = 2;

function scaleUVs(geometry, scaleU, scaleV) {
  const uv = geometry.attributes.uv;
  for (let index = 0; index < uv.count; index += 1) {
    uv.setXY(index, uv.getX(index) * scaleU, uv.getY(index) * scaleV);
  }
  uv.needsUpdate = true;
  return geometry;
}

/** Builds the static Level 37 starting room from POOL_LAYOUT. */
export class PoolRoom {
  constructor(layout = POOL_LAYOUT) {
    this.layout = layout;
    this.waterLevel = layout.waterLevel;
    this.group = new THREE.Group();

    const tiles = createTileTexture();
    this.materials = {
      deck: new THREE.MeshStandardMaterial({ map: tiles, color: '#e4f5f3', roughness: 0.42, metalness: 0.02 }),
      wall: new THREE.MeshStandardMaterial({ map: tiles, color: '#d6ecec', roughness: 0.55, metalness: 0.02 }),
      pool: new THREE.MeshStandardMaterial({ map: tiles, color: '#86dbe6', roughness: 0.5, metalness: 0.02 }),
      ceiling: new THREE.MeshStandardMaterial({ map: tiles, color: '#bcd8db', roughness: 0.7 }),
      tunnel: new THREE.MeshBasicMaterial({ color: '#020608' }),
      stripLight: new THREE.MeshBasicMaterial({ color: '#dffcff' }),
      poolLight: new THREE.MeshBasicMaterial({ color: '#7ef7ff' })
    };

    this.buildDeck();
    this.buildPoolBasin();
    this.buildStairs();
    this.buildRoomShell();
    this.buildPillars();
    this.buildArchway();
    this.buildLightFixtures();
  }

  getGroundHeight(x, z) {
    return getGroundHeight(x, z, this.layout);
  }

  resolveHorizontal(position, radius) {
    return resolveHorizontal(position, radius, this.layout);
  }

  addPlane(width, height, material, { position, rotation = [0, 0, 0], castShadow = false }) {
    const geometry = scaleUVs(new THREE.PlaneGeometry(width, height), width / METERS_PER_TEXTURE, height / METERS_PER_TEXTURE);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    mesh.rotation.set(...rotation);
    mesh.receiveShadow = true;
    mesh.castShadow = castShadow;
    this.group.add(mesh);
    return mesh;
  }

  addFloor(minX, maxX, minZ, maxZ, y, material) {
    return this.addPlane(maxX - minX, maxZ - minZ, material, {
      position: [(minX + maxX) / 2, y, (minZ + maxZ) / 2],
      rotation: [-Math.PI / 2, 0, 0]
    });
  }

  buildDeck() {
    const { halfSize: s, pool: p } = this.layout;
    const material = this.materials.deck;
    this.addFloor(-s, s, -s, p.minZ, 0, material);
    this.addFloor(-s, s, p.maxZ, s, 0, material);
    this.addFloor(-s, p.minX, p.minZ, p.maxZ, 0, material);
    this.addFloor(p.maxX, s, p.minZ, p.maxZ, 0, material);
  }

  buildPoolBasin() {
    const { pool: p } = this.layout;
    const material = this.materials.pool;
    const width = p.maxX - p.minX;
    const length = p.maxZ - p.minZ;
    const centerX = (p.minX + p.maxX) / 2;
    const centerZ = (p.minZ + p.maxZ) / 2;
    const wallY = -p.depth / 2;

    this.addFloor(p.minX, p.maxX, p.minZ, p.maxZ, -p.depth, material);
    this.addPlane(width, p.depth, material, { position: [centerX, wallY, p.minZ], rotation: [0, 0, 0] });
    this.addPlane(width, p.depth, material, { position: [centerX, wallY, p.maxZ], rotation: [0, Math.PI, 0] });
    this.addPlane(length, p.depth, material, { position: [p.minX, wallY, centerZ], rotation: [0, Math.PI / 2, 0] });
    this.addPlane(length, p.depth, material, { position: [p.maxX, wallY, centerZ], rotation: [0, -Math.PI / 2, 0] });
  }

  buildStairs() {
    const { pool: p, stairs: s } = this.layout;
    const material = this.materials.pool;
    const width = s.maxX - s.minX;
    const centerX = (s.minX + s.maxX) / 2;

    for (let step = 0; step < s.count; step += 1) {
      const top = -(step + 1) * s.stepRise;
      const zNear = p.maxZ - step * s.stepDepth;
      const zFar = zNear - s.stepDepth;
      const zMid = (zNear + zFar) / 2;
      const sideHeight = p.depth + top;
      const sideY = -p.depth + sideHeight / 2;

      this.addFloor(s.minX, s.maxX, zFar, zNear, top, material);
      this.addPlane(width, s.stepRise, material, { position: [centerX, top - s.stepRise / 2, zFar], rotation: [0, Math.PI, 0], castShadow: true });
      this.addPlane(s.stepDepth, sideHeight, material, { position: [s.minX, sideY, zMid], rotation: [0, -Math.PI / 2, 0] });
      this.addPlane(s.stepDepth, sideHeight, material, { position: [s.maxX, sideY, zMid], rotation: [0, Math.PI / 2, 0] });
    }
  }

  buildRoomShell() {
    const { halfSize: s, height: h } = this.layout;
    const wall = this.materials.wall;
    this.addPlane(2 * s, h, wall, { position: [0, h / 2, -s], rotation: [0, 0, 0] });
    this.addPlane(2 * s, h, wall, { position: [0, h / 2, s], rotation: [0, Math.PI, 0] });
    this.addPlane(2 * s, h, wall, { position: [-s, h / 2, 0], rotation: [0, Math.PI / 2, 0] });
    this.addPlane(2 * s, h, wall, { position: [s, h / 2, 0], rotation: [0, -Math.PI / 2, 0] });
    this.addPlane(2 * s, 2 * s, this.materials.ceiling, { position: [0, h, 0], rotation: [Math.PI / 2, 0, 0] });
  }

  buildPillars() {
    const { pillars, pillarRadius: r, height: h } = this.layout;
    const geometry = scaleUVs(
      new THREE.CylinderGeometry(r, r, h, 28, 1, true),
      (2 * Math.PI * r) / METERS_PER_TEXTURE,
      h / METERS_PER_TEXTURE
    );
    for (const { x, z } of pillars) {
      const pillar = new THREE.Mesh(geometry, this.materials.wall);
      pillar.position.set(x, h / 2, z);
      pillar.castShadow = true;
      pillar.receiveShadow = true;
      this.group.add(pillar);
    }
  }

  buildArchway() {
    // A dark tunnel mouth on the back wall, framed by a tiled arch.
    const radius = 2.4;
    const z = -this.layout.halfSize + 0.02;
    const opening = new THREE.Mesh(new THREE.CircleGeometry(radius, 48, 0, Math.PI), this.materials.tunnel);
    opening.position.set(0, 0, z);
    this.group.add(opening);

    const rim = new THREE.Mesh(new THREE.TorusGeometry(radius + 0.18, 0.2, 12, 48, Math.PI), this.materials.wall);
    rim.position.set(0, 0, z + 0.05);
    rim.castShadow = true;
    rim.receiveShadow = true;
    this.group.add(rim);
  }

  buildLightFixtures() {
    const { height: h, pool: p, waterLevel } = this.layout;

    const ceilingStrip = new THREE.Mesh(new THREE.PlaneGeometry(14, 0.9), this.materials.stripLight);
    ceilingStrip.position.set(0, h - 0.01, -2);
    ceilingStrip.rotation.x = Math.PI / 2;
    this.group.add(ceilingStrip);

    // Glowing strips under the water line on the far and right pool walls.
    const stripY = waterLevel - 0.35;
    const width = p.maxX - p.minX;
    const length = p.maxZ - p.minZ;
    const farStrip = new THREE.Mesh(new THREE.BoxGeometry(width - 0.2, 0.06, 0.04), this.materials.poolLight);
    farStrip.position.set((p.minX + p.maxX) / 2, stripY, p.minZ + 0.03);
    const sideStrip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.06, length - 0.2), this.materials.poolLight);
    sideStrip.position.set(p.maxX - 0.03, stripY, (p.minZ + p.maxZ) / 2);
    this.group.add(farStrip, sideStrip);
  }
}
