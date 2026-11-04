import * as THREE from 'three';
import { createTileTexture, createLifebuoyTexture } from '../textures.js';

/** Shared material palette for every room and corridor builder. */
export function createMaterials() {
  const tiles = createTileTexture();
  const warmTiles = createTileTexture({ base: '#e8e4d4', grout: '#a09a86' });
  return {
    deck: new THREE.MeshStandardMaterial({ map: tiles, color: '#e4f5f3', roughness: 0.42, metalness: 0.02, side: THREE.DoubleSide }),
    wall: new THREE.MeshStandardMaterial({ map: tiles, color: '#d6ecec', roughness: 0.55, metalness: 0.02, side: THREE.DoubleSide }),
    warmWall: new THREE.MeshStandardMaterial({ map: warmTiles, color: '#e7ddc6', roughness: 0.6, metalness: 0.02, side: THREE.DoubleSide }),
    pool: new THREE.MeshStandardMaterial({ map: tiles, color: '#86dbe6', roughness: 0.5, metalness: 0.02, side: THREE.DoubleSide }),
    ceiling: new THREE.MeshStandardMaterial({ map: tiles, color: '#bcd8db', roughness: 0.7, side: THREE.DoubleSide }),
    dark: new THREE.MeshBasicMaterial({ color: '#020608' }),
    stripLight: new THREE.MeshBasicMaterial({ color: '#dffcff' }),
    poolLight: new THREE.MeshBasicMaterial({ color: '#7ef7ff' }),
    windowLight: new THREE.MeshBasicMaterial({ color: '#eafff6' }),
    lampLight: new THREE.MeshBasicMaterial({ color: '#ffd9a0' }),
    shaftLight: new THREE.MeshBasicMaterial({ color: '#fff3d6' }),
    metal: new THREE.MeshStandardMaterial({ color: '#c9d4d6', roughness: 0.25, metalness: 0.9 }),
    lifebuoy: new THREE.MeshStandardMaterial({ map: createLifebuoyTexture(), roughness: 0.6 }),
    beam: new THREE.MeshStandardMaterial({ map: tiles, color: '#cfe4e2', roughness: 0.6, side: THREE.DoubleSide })
  };
}
