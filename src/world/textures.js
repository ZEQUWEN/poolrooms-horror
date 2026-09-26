import * as THREE from 'three';

/** Clean small-format pool tiles with subtle per-tile brightness variation. */
export function createTileTexture({ base = '#d8ecea', grout = '#7c9ea2', tiles = 8, size = 512 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d');
  const step = size / tiles;

  context.fillStyle = base;
  context.fillRect(0, 0, size, size);
  for (let row = 0; row < tiles; row += 1) {
    for (let col = 0; col < tiles; col += 1) {
      context.fillStyle = `rgba(255, 255, 255, ${Math.random() * 0.07})`;
      context.fillRect(col * step, row * step, step, step);
    }
  }

  // Lines on the texture border are drawn half-width, so they join when the texture repeats.
  context.strokeStyle = grout;
  context.lineWidth = 5;
  for (let position = 0; position <= size; position += step) {
    context.beginPath();
    context.moveTo(position, 0);
    context.lineTo(position, size);
    context.stroke();
    context.beginPath();
    context.moveTo(0, position);
    context.lineTo(size, position);
    context.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

// [waveNumberX, waveNumberY, amplitude, phase]. Integer wave numbers keep the map tileable.
const WATER_WAVES = [
  [3, 1, 1.0, 0.2],
  [1, 4, 0.8, 1.7],
  [5, -2, 0.5, 2.9],
  [-2, 6, 0.4, 4.1],
  [7, 3, 0.3, 0.6],
  [-6, -5, 0.25, 5.3],
  [9, -4, 0.18, 3.3],
  [2, 11, 0.12, 1.1]
];

/** Seamless tangent-space normal map built from a sum of sine waves. */
export function createWaterNormalTexture(size = 256, strength = 2.4) {
  const tau = Math.PI * 2;
  const heights = new Float32Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = (x / size) * tau;
      const v = (y / size) * tau;
      let height = 0;
      for (const [kx, ky, amplitude, phase] of WATER_WAVES) height += amplitude * Math.sin(kx * u + ky * v + phase);
      heights[y * size + x] = height;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d');
  const image = context.createImageData(size, size);
  const heightAt = (x, y) => heights[((y + size) % size) * size + ((x + size) % size)];

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = heightAt(x + 1, y) - heightAt(x - 1, y);
      const dy = heightAt(x, y + 1) - heightAt(x, y - 1);
      // Canvas rows go down while texture V goes up, so the Y slope is not negated.
      const nx = -dx * strength;
      const ny = dy * strength;
      const length = Math.hypot(nx, ny, 1);
      const offset = (y * size + x) * 4;
      image.data[offset] = ((nx / length) * 0.5 + 0.5) * 255;
      image.data[offset + 1] = ((ny / length) * 0.5 + 0.5) * 255;
      image.data[offset + 2] = ((1 / length) * 0.5 + 0.5) * 255;
      image.data[offset + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}
