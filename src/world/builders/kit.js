import * as THREE from 'three';

export const METERS_PER_TEXTURE = 2;

export function scaleUVs(geometry, scaleU, scaleV) {
  const uv = geometry.attributes.uv;
  for (let index = 0; index < uv.count; index += 1) {
    uv.setXY(index, uv.getX(index) * scaleU, uv.getY(index) * scaleV);
  }
  uv.needsUpdate = true;
  return geometry;
}

export function plane(group, width, height, material, position, rotation = [0, 0, 0], castShadow = false) {
  const geometry = scaleUVs(new THREE.PlaneGeometry(width, height), width / METERS_PER_TEXTURE, height / METERS_PER_TEXTURE);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.receiveShadow = true;
  mesh.castShadow = castShadow;
  group.add(mesh);
  return mesh;
}

export function floorRect(group, r, y, material) {
  return plane(group, r.x1 - r.x0, r.z1 - r.z0, material, [(r.x0 + r.x1) / 2, y, (r.z0 + r.z1) / 2], [-Math.PI / 2, 0, 0]);
}

export function ceilingRect(group, r, y, material) {
  return plane(group, r.x1 - r.x0, r.z1 - r.z1 + (r.z1 - r.z0), material, [(r.x0 + r.x1) / 2, y, (r.z0 + r.z1) / 2], [Math.PI / 2, 0, 0]);
}

/** Vertical wall on an axis-aligned segment, between two heights. */
export function wallSeg(group, seg, y0, y1, material) {
  const alongX = Math.abs(seg.z1 - seg.z0) < 1e-9;
  const length = alongX ? seg.x1 - seg.x0 : seg.z1 - seg.z0;
  const rotation = alongX ? [0, 0, 0] : [0, Math.PI / 2, 0];
  return plane(group, length, y1 - y0, material, [(seg.x0 + seg.x1) / 2, (y0 + y1) / 2, (seg.z0 + seg.z1) / 2], rotation);
}

/** Rect minus holes: recursive guillotine split into non-overlapping pieces. */
export function subtractRects(rect, holes) {
  let pieces = [rect];
  for (const hole of holes) {
    const next = [];
    for (const piece of pieces) {
      if (hole.x1 <= piece.x0 || hole.x0 >= piece.x1 || hole.z1 <= piece.z0 || hole.z0 >= piece.z1) {
        next.push(piece);
        continue;
      }
      if (hole.x0 > piece.x0) next.push({ x0: piece.x0, z0: piece.z0, x1: hole.x0, z1: piece.z1 });
      if (hole.x1 < piece.x1) next.push({ x0: hole.x1, z0: piece.z0, x1: piece.x1, z1: piece.z1 });
      const midX0 = Math.max(piece.x0, hole.x0);
      const midX1 = Math.min(piece.x1, hole.x1);
      if (hole.z0 > piece.z0) next.push({ x0: midX0, z0: piece.z0, x1: midX1, z1: hole.z0 });
      if (hole.z1 < piece.z1) next.push({ x0: midX0, z0: hole.z1, x1: midX1, z1: piece.z1 });
    }
    pieces = next;
  }
  return pieces;
}

export function cylinderPillar(group, x, z, radius, y0, y1, material, radial = 24) {
  const geometry = scaleUVs(
    new THREE.CylinderGeometry(radius, radius, y1 - y0, radial, 1, true),
    (2 * Math.PI * radius) / METERS_PER_TEXTURE,
    (y1 - y0) / METERS_PER_TEXTURE
  );
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, (y0 + y1) / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

export function boxPillar(group, x, z, sx, sz, y0, y1, material) {
  const geometry = new THREE.BoxGeometry(sx, y1 - y0, sz);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, (y0 + y1) / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

/** Basin shell: floor, three plain walls, submerged steps on the stair side. */
export function basinShell(group, basin, material) {
  const r = basin.rect;
  floorRect(group, r, -basin.depth, material);
  const sides = ['N', 'S', 'E', 'W'].filter((side) => side !== basin.stairs?.side);
  for (const side of sides) {
    if (side === 'N') wallSeg(group, { x0: r.x0, z0: r.z0, x1: r.x1, z1: r.z0 }, -basin.depth, 0, material);
    if (side === 'S') wallSeg(group, { x0: r.x0, z0: r.z1, x1: r.x1, z1: r.z1 }, -basin.depth, 0, material);
    if (side === 'W') wallSeg(group, { x0: r.x0, z0: r.z0, x1: r.x0, z1: r.z1 }, -basin.depth, 0, material);
    if (side === 'E') wallSeg(group, { x0: r.x1, z0: r.z0, x1: r.x1, z1: r.z1 }, -basin.depth, 0, material);
  }
  for (const mouth of basin.mouths ?? []) {
    const side = mouth.side;
    const h = mouth.top - mouth.bottom;
    const yMid = (mouth.top + mouth.bottom) / 2;
    // Rim frame around the opening so the pipe mouth reads clearly.
    const rimMat = material;
    if (side === 'N' || side === 'S') {
      const z = side === 'N' ? r.z0 : r.z1;
      wallSeg(group, { x0: r.x0, z0: z, x1: mouth.u0, z1: z }, -basin.depth, 0, material);
      wallSeg(group, { x0: mouth.u1, z0: z, x1: r.x1, z1: z }, -basin.depth, 0, material);
      wallSeg(group, { x0: mouth.u0, z0: z, x1: mouth.u1, z1: z }, mouth.top, 0, material);
      const lintel = new THREE.Mesh(new THREE.BoxGeometry(mouth.u1 - mouth.u0 + 0.3, 0.18, 0.24), rimMat);
      lintel.position.set((mouth.u0 + mouth.u1) / 2, mouth.top + 0.09, z);
      group.add(lintel);
      void yMid; void h;
    } else {
      const x = side === 'W' ? r.x0 : r.x1;
      wallSeg(group, { x0: x, z0: r.z0, x1: x, z1: mouth.u0 }, -basin.depth, 0, material);
      wallSeg(group, { x0: x, z0: mouth.u1, x1: x, z1: r.z1 }, -basin.depth, 0, material);
      wallSeg(group, { x0: x, z0: mouth.u0, x1: x, z1: mouth.u1 }, mouth.top, 0, material);
      const lintel = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.18, mouth.u1 - mouth.u0 + 0.3), rimMat);
      lintel.position.set(x, mouth.top + 0.09, (mouth.u0 + mouth.u1) / 2);
      group.add(lintel);
      void yMid; void h;
    }
  }
  if (!basin.stairs) return;
  const { stairs } = basin;
  for (let step = 0; step < stairs.count; step += 1) {
    const top = -(step + 1) * stairs.rise;
    if (top <= -basin.depth + 0.02) break; // step would sink below the floor
    const near = step * stairs.run;
    const far = near + stairs.run;
    let tread; let riser; let riserRot; let sideA; let sideB;
    if (stairs.side === 'S') {
      tread = { x0: r.x0, z0: r.z1 - far, x1: r.x1, z1: r.z1 - near };
      riser = { x0: r.x0, z0: r.z1 - far, x1: r.x1, z1: r.z1 - far };
      riserRot = [0, Math.PI, 0];
      sideA = { x0: r.x0, z0: r.z1 - far, x1: r.x0, z1: r.z1 - near };
      sideB = { x0: r.x1, z0: r.z1 - far, x1: r.x1, z1: r.z1 - near };
    } else if (stairs.side === 'N') {
      tread = { x0: r.x0, z0: r.z0 + near, x1: r.x1, z1: r.z0 + far };
      riser = { x0: r.x0, z0: r.z0 + far, x1: r.x1, z1: r.z0 + far };
      riserRot = [0, 0, 0];
      sideA = { x0: r.x0, z0: r.z0 + near, x1: r.x0, z1: r.z0 + far };
      sideB = { x0: r.x1, z0: r.z0 + near, x1: r.x1, z1: r.z0 + far };
    } else if (stairs.side === 'W') {
      tread = { x0: r.x0 + near, z0: r.z0, x1: r.x0 + far, z1: r.z1 };
      riser = { x0: r.x0 + far, z0: r.z0, x1: r.x0 + far, z1: r.z1 };
      riserRot = [0, Math.PI / 2, 0];
      sideA = { x0: r.x0 + near, z0: r.z0, x1: r.x0 + far, z1: r.z0 };
      sideB = { x0: r.x0 + near, z0: r.z1, x1: r.x0 + far, z1: r.z1 };
    } else {
      tread = { x0: r.x1 - far, z0: r.z0, x1: r.x1 - near, z1: r.z1 };
      riser = { x0: r.x1 - far, z0: r.z0, x1: r.x1 - far, z1: r.z1 };
      riserRot = [0, -Math.PI / 2, 0];
      sideA = { x0: r.x1 - far, z0: r.z0, x1: r.x1 - near, z1: r.z0 };
      sideB = { x0: r.x1 - far, z0: r.z1, x1: r.x1 - near, z1: r.z1 };
    }
    floorRect(group, tread, top, material);
    plane(group, riser.x1 - riser.x0 || riser.z1 - riser.z0, stairs.rise, material,
      [(riser.x0 + riser.x1) / 2, top - stairs.rise / 2, (riser.z0 + riser.z1) / 2], riserRot);
    const sideHeight = basin.depth + top;
    for (const side of [sideA, sideB]) {
      const alongX = Math.abs(side.z1 - side.z0) < 1e-9;
      plane(group, alongX ? side.x1 - side.x0 : side.z1 - side.z0, sideHeight, material,
        [(side.x0 + side.x1) / 2, -basin.depth + sideHeight / 2, (side.z0 + side.z1) / 2],
        alongX ? [0, 0, 0] : [0, Math.PI / 2, 0]);
    }
  }
}

/** Deck island block: top at y = 0, sides down to -depth. */
export function islandBlock(group, island, depth, material) {
  floorRect(group, island, 0, material);
  wallSeg(group, { x0: island.x0, z0: island.z0, x1: island.x1, z1: island.z0 }, -depth, 0, material);
  wallSeg(group, { x0: island.x0, z0: island.z1, x1: island.x1, z1: island.z1 }, -depth, 0, material);
  wallSeg(group, { x0: island.x0, z0: island.z0, x1: island.x0, z1: island.z1 }, -depth, 0, material);
  wallSeg(group, { x0: island.x1, z0: island.z0, x1: island.x1, z1: island.z1 }, -depth, 0, material);
}

/** Raised landing block: top at landing.y, sides from baseY. */
export function landingBlock(group, landing, baseY, material) {
  floorRect(group, landing.rect, landing.y, material);
  wallSeg(group, { x0: landing.rect.x0, z0: landing.rect.z0, x1: landing.rect.x1, z1: landing.rect.z0 }, baseY, landing.y, material);
  wallSeg(group, { x0: landing.rect.x0, z0: landing.rect.z1, x1: landing.rect.x1, z1: landing.rect.z1 }, baseY, landing.y, material);
  wallSeg(group, { x0: landing.rect.x0, z0: landing.rect.z0, x1: landing.rect.x0, z1: landing.rect.z1 }, baseY, landing.y, material);
  wallSeg(group, { x0: landing.rect.x1, z0: landing.rect.z0, x1: landing.rect.x1, z1: landing.rect.z1 }, baseY, landing.y, material);
}

/** Monumental stair: `steps` slabs climbing from run.from to run.to. */
export function stairRunSteps(group, run, material) {
  const r = run.rect;
  for (let i = 0; i < run.steps; i += 1) {
    const t0 = i / run.steps;
    const t1 = (i + 1) / run.steps;
    const top = run.from + ((i + 1) / run.steps) * (run.to - run.from);
    const slice = run.axis === 'z'
      ? (run.enter === 'N' || run.enter === 'W'
        ? { x0: r.x0, z0: r.z0 + (r.z1 - r.z0) * t0, x1: r.x1, z1: r.z0 + (r.z1 - r.z0) * t1 }
        : { x0: r.x0, z0: r.z1 - (r.z1 - r.z0) * t1, x1: r.x1, z1: r.z1 - (r.z1 - r.z0) * t0 })
      : (run.enter === 'N' || run.enter === 'W'
        ? { x0: r.x0 + (r.x1 - r.x0) * t0, z0: r.z0, x1: r.x0 + (r.x1 - r.x0) * t1, z1: r.z1 }
        : { x0: r.x1 - (r.x1 - r.x0) * t1, z0: r.z0, x1: r.x1 - (r.x1 - r.x0) * t0, z1: r.z1 });
    floorRect(group, slice, top, material);
    // Riser facing the previous step.
    const riserZ = run.axis === 'z' ? (run.enter === 'N' || run.enter === 'W' ? slice.z0 : slice.z1) : null;
    const riserX = run.axis === 'x' ? (run.enter === 'N' || run.enter === 'W' ? slice.x0 : slice.x1) : null;
    const riseHeight = (run.to - run.from) / run.steps;
    if (riserZ !== null) {
      wallSeg(group, { x0: slice.x0, z0: riserZ, x1: slice.x1, z1: riserZ }, top - riseHeight, top, material);
    } else {
      wallSeg(group, { x0: riserX, z0: slice.z0, x1: riserX, z1: slice.z1 }, top - riseHeight, top, material);
    }
  }
}

/** Metal handrail along one edge of a rect (posts + two rails). */
export function handrailEdge(group, r, side, material, inset = 0.18) {
  const height = 0.95;
  const points = [];
  if (side === 'N' || side === 'S') {
    const z = side === 'N' ? r.z0 - inset : r.z1 + inset;
    for (let x = r.x0 + 0.2; x <= r.x1 - 0.19; x += 1.4) points.push([x, z]);
    addRail(group, [r.x0 + 0.2, z], [r.x1 - 0.2, z], height, material);
  } else {
    const x = side === 'W' ? r.x0 - inset : r.x1 + inset;
    for (let z = r.z0 + 0.2; z <= r.z1 - 0.19; z += 1.4) points.push([x, z]);
    addRail(group, [x, r.z0 + 0.2], [x, r.z1 - 0.2], height, material);
  }
  const postGeo = new THREE.CylinderGeometry(0.03, 0.03, height, 8);
  for (const [x, z] of points) {
    const post = new THREE.Mesh(postGeo, material);
    post.position.set(x, height / 2, z);
    post.castShadow = true;
    group.add(post);
  }
}

function addRail(group, a, b, height, material) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const length = Math.hypot(dx, dz);
  for (const y of [height, height - 0.4]) {
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, length, 10), material);
    rail.position.set((a[0] + b[0]) / 2, y, (a[1] + b[1]) / 2);
    rail.rotation.z = Math.PI / 2;
    if (Math.abs(dz) > 1e-9) rail.rotation.y = Math.PI / 2;
    rail.castShadow = true;
    group.add(rail);
  }
}

/** Recessed wall niche with a warm lamp (ref 1). */
export function niche(group, side, wallLine, u, materials, y = 2.1) {
  const depth = 0.14;
  const w = 0.9;
  const h = 1.5;
  const inward = side === 'N' ? 1 : side === 'S' ? -1 : 0;
  const inwardX = side === 'W' ? 1 : side === 'E' ? -1 : 0;
  const px = side === 'N' || side === 'S' ? u : wallLine + inwardX * (depth / 2 + 0.01);
  const pz = side === 'N' || side === 'S' ? wallLine + inward * (depth / 2 + 0.01) : u;
  const box = new THREE.Mesh(new THREE.BoxGeometry(side === 'N' || side === 'S' ? w : depth, h, side === 'N' || side === 'S' ? depth : w), materials.dark);
  box.position.set(px, y, pz);
  group.add(box);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), materials.lampLight);
  lamp.position.set(
    side === 'N' || side === 'S' ? u : wallLine + inwardX * (depth + 0.1),
    y + 0.2,
    side === 'N' || side === 'S' ? wallLine + inward * (depth + 0.1) : u
  );
  group.add(lamp);
}

/** Lifebuoy ring on a wall (ref 1). */
export function lifebuoy(group, side, wallLine, u, materials, y = 1.7) {
  const inward = side === 'N' ? 0.1 : side === 'S' ? -0.1 : 0;
  const inwardX = side === 'W' ? 0.1 : side === 'E' ? -0.1 : 0;
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.13, 10, 28), materials.lifebuoy);
  mesh.position.set(
    side === 'N' || side === 'S' ? u : wallLine + inwardX,
    y,
    side === 'N' || side === 'S' ? wallLine + inward : u
  );
  if (side === 'E' || side === 'W') mesh.rotation.y = Math.PI / 2;
  mesh.castShadow = true;
  group.add(mesh);
}

/** Glowing window panel on a wall. */
export function windowPanel(group, side, wallLine, u0, u1, y0, y1, material) {
  const inward = side === 'N' ? 0.06 : side === 'S' ? -0.06 : 0;
  const inwardX = side === 'W' ? 0.06 : side === 'E' ? -0.06 : 0;
  const alongX = side === 'N' || side === 'S';
  const width = alongX ? u1 - u0 : u1 - u0;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, y1 - y0), material);
  mesh.position.set(
    alongX ? (u0 + u1) / 2 : wallLine + inwardX,
    (y0 + y1) / 2,
    alongX ? wallLine + inward : (u0 + u1) / 2
  );
  if (!alongX) mesh.rotation.y = Math.PI / 2;
  if (side === 'S') mesh.rotation.y = Math.PI;
  if (side === 'E') mesh.rotation.y = -Math.PI / 2;
  group.add(mesh);
  return mesh;
}

/** Ceiling with a round oculus: drum + soft glow disc above (ref 3). */
export function oculusCeiling(group, r, y, holeRadius, material, glowMaterial) {
  const shape = new THREE.Shape();
  shape.moveTo(r.x0, r.z0);
  shape.lineTo(r.x1, r.z0);
  shape.lineTo(r.x1, r.z1);
  shape.lineTo(r.x0, r.z1);
  shape.closePath();
  const hole = new THREE.Path();
  const cx = (r.x0 + r.x1) / 2;
  const cz = (r.z0 + r.z1) / 2;
  hole.absarc(cx, cz, holeRadius, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const geometry = new THREE.ShapeGeometry(shape, 48);
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i += 1) uv.setXY(i, uv.getX(i) / METERS_PER_TEXTURE, uv.getY(i) / METERS_PER_TEXTURE);
  uv.needsUpdate = true;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = Math.PI / 2;
  mesh.position.y = y;
  mesh.receiveShadow = true;
  group.add(mesh);

  const drum = new THREE.Mesh(
    new THREE.CylinderGeometry(holeRadius, holeRadius, 1.6, 40, 1, true),
    material
  );
  drum.position.set(cx, y + 0.8, cz);
  group.add(drum);
  const glow = new THREE.Mesh(new THREE.CircleGeometry(holeRadius * 0.96, 40), glowMaterial);
  glow.rotation.x = Math.PI / 2;
  glow.position.set(cx, y + 1.55, cz);
  group.add(glow);
}

/** Barrel vault ceiling over a rect, springing at springY (ref 2). */
export function vaultCeiling(group, r, springY, material) {
  const long = r.x1 - r.x0 >= r.z1 - r.z0;
  const length = long ? r.x1 - r.x0 : r.z1 - r.z0;
  const radius = (long ? r.z1 - r.z0 : r.x1 - r.x0) / 2;
  const geometry = new THREE.CylinderGeometry(radius, radius, length, 28, 1, true, -Math.PI / 2, Math.PI);
  geometry.rotateZ(Math.PI / 2);
  geometry.rotateX(-Math.PI / 2);
  if (!long) geometry.rotateY(Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set((r.x0 + r.x1) / 2, springY, (r.z0 + r.z1) / 2);
  mesh.receiveShadow = true;
  group.add(mesh);
  return radius;
}

/** Arch rib across the corridor at (x, z) (ref 2). */
export function archRib(group, r, at, radius, springY, material) {
  const long = r.x1 - r.x0 >= r.z1 - r.z0;
  const geometry = new THREE.TorusGeometry(radius + 0.1, 0.12, 8, 28, Math.PI);
  const mesh = new THREE.Mesh(geometry, material);
  if (long) {
    mesh.position.set((r.x0 + r.x1) / 2, springY, at);
  } else {
    mesh.rotation.y = Math.PI / 2;
    mesh.position.set(at, springY, (r.z0 + r.z1) / 2);
  }
  mesh.castShadow = true;
  group.add(mesh);
}

/** Light shaft: bright quad on the wall plus a glow patch on the floor (ref 6). */
export function lightShaft(group, side, wallLine, u, width, y0, y1, materials, roomSideInset = 1.1) {
  windowPanel(group, side, wallLine, u - width / 2, u + width / 2, y0, y1, materials.shaftLight);
  const inward = side === 'N' ? 1 : side === 'S' ? -1 : 0;
  const inwardX = side === 'W' ? 1 : side === 'E' ? -1 : 0;
  const patch = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.9, 2.4), materials.shaftLight);
  patch.rotation.x = -Math.PI / 2;
  patch.position.set(
    side === 'N' || side === 'S' ? u : wallLine + inwardX * roomSideInset,
    0.02,
    side === 'N' || side === 'S' ? wallLine + inward * roomSideInset : u
  );
  patch.material = materials.shaftLight.clone();
  patch.material.transparent = true;
  patch.material.opacity = 0.35;
  group.add(patch);
}

/** Stepped, ribbed sloped ceiling with a lit window grid (ref 5). */
export function slopedRibCeiling(group, r, side, height, materials) {
  const steps = 14;
  const drop = 2.1;
  const alongX = side === 'N' || side === 'S';
  const span = alongX ? r.z1 - r.z0 : r.x1 - r.x0;
  for (let i = 0; i < steps; i += 1) {
    const t0 = i / steps;
    const t1 = (i + 1) / steps;
    const y = height - drop * t0;
    const slice = alongX
      ? (side === 'N' ? { x0: r.x0, z0: r.z0 + span * t0, x1: r.x1, z1: r.z0 + span * t1 } : { x0: r.x0, z0: r.z1 - span * t1, x1: r.x1, z1: r.z1 - span * t0 })
      : (side === 'W' ? { x0: r.x0 + span * t0, z0: r.z0, x1: r.x0 + span * t1, z1: r.z1 } : { x0: r.x1 - span * t1, z0: r.z0, x1: r.x1 - span * t0, z1: r.z1 });
    floorRect(group, slice, y, materials.ceiling);
    const nextY = height - drop * t1;
    const edge = alongX
      ? (side === 'N' ? { x0: r.x0, z0: slice.z1, x1: r.x1, z1: slice.z1 } : { x0: r.x0, z0: slice.z0, x1: r.x1, z1: slice.z0 })
      : (side === 'W' ? { x0: slice.x1, z0: r.z0, x1: slice.x1, z1: r.z1 } : { x0: slice.x0, z0: r.z0, x1: slice.x0, z1: r.z1 });
    wallSeg(group, edge, nextY, y, materials.ceiling);
  }
  // Lit window grid on the sloped side wall.
  const cols = 4;
  const rows = 3;
  const wallSpan = alongX ? r.x1 - r.x0 : r.z1 - r.z0;
  for (let c = 0; c < cols; c += 1) {
    for (let rw = 0; rw < rows; rw += 1) {
      const u0 = (alongX ? r.x0 : r.z0) + ((c + 0.25) / cols) * wallSpan;
      const u1 = (alongX ? r.x0 : r.z0) + ((c + 0.75) / cols) * wallSpan;
      const y0 = height - drop - 0.4 + rw * 0.9;
      windowPanel(group, side, side === 'N' ? r.z0 : side === 'S' ? r.z1 : side === 'W' ? r.x0 : r.x1, u0, u1, y0, y0 + 0.55, materials.windowLight);
    }
  }
}

/** Axis-aligned pipe segment between two points. */
export function pipeRun(group, a, b, radius, material) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  const length = Math.hypot(dx, dy, dz);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 12), material);
  mesh.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  if (Math.abs(dx) > 1e-9) mesh.rotation.z = Math.PI / 2;
  else if (Math.abs(dz) > 1e-9) mesh.rotation.x = Math.PI / 2;
  mesh.castShadow = true;
  group.add(mesh);
  return mesh;
}

/** Vertical riser pipe with brackets in a room corner. */
export function riserPipe(group, x, z, y0, y1, material) {
  pipeRun(group, [x, y0, z], [x, y1, z], 0.11, material);
  for (let y = y0 + 1.2; y < y1 - 0.4; y += 2.2) {
    const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.3), material);
    bracket.position.set(x, y, z);
    group.add(bracket);
  }
}

/** Floor drain: dark disc with a metal grate (стоки). */
export function floorDrain(group, x, z, radius, y, materials) {
  const disc = new THREE.Mesh(new THREE.CircleGeometry(radius, 20), materials.dark);
  disc.rotation.x = -Math.PI / 2;
  disc.position.set(x, y + 0.015, z);
  group.add(disc);
  for (let i = 0; i < 3; i += 1) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(radius * 1.8, 0.03, 0.05), materials.metal);
    bar.position.set(x, y + 0.03, z + (i - 1) * radius * 0.5);
    group.add(bar);
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.04, 6, 20), materials.metal);
  ring.rotation.x = Math.PI / 2;
  ring.position.set(x, y + 0.03, z);
  group.add(ring);
}

/** Wall overflow grate at the water line (сток на стене). */
export function overflowGrate(group, side, wallLine, u, y, materials) {
  const inward = side === 'N' ? 0.05 : side === 'S' ? -0.05 : 0;
  const inwardX = side === 'W' ? 0.05 : side === 'E' ? -0.05 : 0;
  const alongX = side === 'N' || side === 'S';
  const box = new THREE.Mesh(new THREE.BoxGeometry(alongX ? 1.1 : 0.1, 0.5, alongX ? 0.1 : 1.1), materials.dark);
  box.position.set(alongX ? u : wallLine + inwardX, y, alongX ? wallLine + inward : u);
  group.add(box);
  for (let i = -1; i <= 1; i += 1) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(alongX ? 1.0 : 0.04, 0.04, alongX ? 0.04 : 1.0), materials.metal);
    bar.position.set(alongX ? u : wallLine + inwardX + 0.04, y + i * 0.15, alongX ? wallLine + inward + 0.04 : u);
    group.add(bar);
  }
}

/** Inflow pipe discharging over a basin, with a falling water streak. */
export function inflowPipe(group, side, wallLine, u, y, reach, materials) {
  const inward = side === 'N' ? 1 : side === 'S' ? -1 : 0;
  const inwardX = side === 'W' ? 1 : side === 'E' ? -1 : 0;
  const startX = side === 'N' || side === 'S' ? u : wallLine;
  const startZ = side === 'N' || side === 'S' ? wallLine : u;
  const endX = startX + inwardX * reach;
  const endZ = startZ + inward * reach;
  pipeRun(group, [startX, y, startZ], [endX, y, endZ], 0.16, materials.metal);
  pipeRun(group, [startX, y + 0.5, startZ], [startX, y, startZ], 0.16, materials.metal);
  const mouth = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.3, 12), materials.metal);
  mouth.position.set(endX, y - 0.1, endZ);
  group.add(mouth);
  const streak = new THREE.Mesh(new THREE.PlaneGeometry(0.22, y + 0.3), materials.shaftLight.clone());
  streak.material.transparent = true;
  streak.material.opacity = 0.28;
  streak.position.set(endX, (y - 0.2) / 2 - 0.6, endZ);
  group.add(streak);
}

/** Dark hatch with a glow seam above a stairwell landing. */
export function hatchGlow(group, r, y, materials) {
  const lid = new THREE.Mesh(new THREE.PlaneGeometry(r.x1 - r.x0, r.z1 - r.z0), materials.dark);
  lid.rotation.x = Math.PI / 2;
  lid.position.set((r.x0 + r.x1) / 2, y - 0.02, (r.z0 + r.z1) / 2);
  group.add(lid);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry((r.x1 - r.x0) * 0.8, (r.z1 - r.z0) * 0.8), materials.stripLight);
  glow.rotation.x = Math.PI / 2;
  glow.position.set((r.x0 + r.x1) / 2, y - 0.05, (r.z0 + r.z1) / 2);
  group.add(glow);
}

/** Hatch shaft: dark walls descending, plus a simple ladder. */
export function hatchShaft(group, hole, depth, materials) {
  const y0 = -Math.min(depth, 3.6);
  wallSeg(group, { x0: hole.x0, z0: hole.z0, x1: hole.x1, z1: hole.z0 }, y0, 0, materials.dark);
  wallSeg(group, { x0: hole.x0, z0: hole.z1, x1: hole.x1, z1: hole.z1 }, y0, 0, materials.dark);
  wallSeg(group, { x0: hole.x0, z0: hole.z0, x1: hole.x0, z1: hole.z1 }, y0, 0, materials.dark);
  wallSeg(group, { x0: hole.x1, z0: hole.z0, x1: hole.x1, z1: hole.z1 }, y0, 0, materials.dark);
  floorRect(group, hole, y0, materials.dark);
  // Ladder on the north side of the shaft.
  const lx0 = hole.x0 + 0.35;
  const lx1 = hole.x1 - 0.35;
  pipeRun(group, [lx0, y0 + 0.2, hole.z0 + 0.12], [lx0, 0.4, hole.z0 + 0.12], 0.035, materials.metal);
  pipeRun(group, [lx1, y0 + 0.2, hole.z0 + 0.12], [lx1, 0.4, hole.z0 + 0.12], 0.035, materials.metal);
  for (let y = y0 + 0.5; y < 0.3; y += 0.35) {
    pipeRun(group, [lx0, y, hole.z0 + 0.12], [lx1, y, hole.z0 + 0.12], 0.025, materials.metal);
  }
}

/** Ceiling beams/slabs (ref 7). */
export function ceilingBeams(group, r, y, materials, count = 4) {
  const alongX = r.x1 - r.x0 >= r.z1 - r.z0;
  for (let i = 0; i < count; i += 1) {
    const t = (i + 0.5) / count;
    const geometry = new THREE.BoxGeometry(alongX ? r.x1 - r.x0 : 1.1, 0.7, alongX ? 1.1 : r.z1 - r.z0);
    const mesh = new THREE.Mesh(geometry, materials.beam);
    mesh.position.set(
      alongX ? (r.x0 + r.x1) / 2 : r.x0 + (r.x1 - r.x0) * t,
      y - 0.45,
      alongX ? r.z0 + (r.z1 - r.z0) * t : (r.z0 + r.z1) / 2
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
}

/**
 * Procedural ceiling fixture (panel or strip): metal housing recessed into
 * the ceiling plus a bright unlit face. `along` is the horizontal axis the
 * long side follows ('x' or 'z').
 */
export function lightFixture(group, fixture, materials) {
  const { x, z, y, shape, along } = fixture;
  const len = fixture.len ?? 2.8;
  const wid = fixture.wid ?? 0.6;
  const alongZ = along === 'z';
  const face = materials.emissiveFor(fixture.color ?? '#dffcff');

  if (shape === 'panel') {
    const housing = new THREE.Mesh(new THREE.BoxGeometry(wid + 0.22, 0.16, wid + 0.22), materials.metal);
    housing.position.set(x, y + 0.08, z);
    group.add(housing);
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(wid, wid), face);
    pane.rotation.x = Math.PI / 2;
    pane.position.set(x, y - 0.005, z);
    group.add(pane);
    return;
  }

  const housing = new THREE.Mesh(
    new THREE.BoxGeometry(alongZ ? wid : len, 0.12, alongZ ? len : wid),
    materials.metal
  );
  housing.position.set(x, y + 0.06, z);
  group.add(housing);
  const pane = new THREE.Mesh(
    new THREE.PlaneGeometry(alongZ ? wid : len, alongZ ? len : wid),
    face
  );
  pane.rotation.x = Math.PI / 2;
  pane.position.set(x, y - 0.005, z);
  group.add(pane);
}

/**
 * Recessed wall window glowing "from nowhere" (the classic Poolrooms look):
 * a bright pane set back into a shallow niche, tiled reveals, a metal frame
 * with mullions, a sill and a soft additive halo spilling into the room.
 */
export function wallWindow(group, win, wallLine, materials) {
  const side = win.side;
  const alongX = side === 'N' || side === 'S';
  const dir = side === 'N' || side === 'W' ? 1 : -1;
  const depth = 0.3;
  const w = win.u1 - win.u0;
  const h = win.y1 - win.y0;
  const uMid = (win.u0 + win.u1) / 2;
  const yMid = (win.y0 + win.y1) / 2;
  const px = alongX ? uMid : wallLine;
  const pz = alongX ? wallLine : uMid;
  const nx = alongX ? 0 : dir;
  const nz = alongX ? dir : 0;
  const color = win.color ?? '#fff1cf';
  const face = materials.emissiveFor(color);

  const faceRotation = () => {
    if (side === 'S') return Math.PI;
    if (side === 'W') return Math.PI / 2;
    if (side === 'E') return -Math.PI / 2;
    return 0;
  };

  // Bright pane at the back of the niche.
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.08, h - 0.08), face);
  pane.position.set(px + nx * depth, yMid, pz + nz * depth);
  pane.rotation.y = faceRotation();
  group.add(pane);

  // Tiled reveals: top/bottom and both sides of the niche.
  for (const yAt of [win.y0, win.y1]) {
    const reveal = new THREE.Mesh(
      new THREE.PlaneGeometry(alongX ? w : depth, alongX ? depth : w),
      materials.wall
    );
    reveal.rotation.x = Math.PI / 2;
    reveal.position.set(px + nx * depth / 2, yAt, pz + nz * depth / 2);
    group.add(reveal);
  }
  for (const uAt of [win.u0, win.u1]) {
    const reveal = new THREE.Mesh(new THREE.PlaneGeometry(depth, h), materials.wall);
    if (alongX) reveal.rotation.y = Math.PI / 2;
    reveal.position.set(alongX ? uAt : px + nx * depth / 2, yMid, alongX ? pz + nz * depth / 2 : uAt);
    group.add(reveal);
  }

  // Metal frame around the opening.
  const t = 0.1;
  for (const yAt of [win.y0 - t / 2, win.y1 + t / 2]) {
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(alongX ? w + t * 2 : t, t, alongX ? t : w + t * 2),
      materials.metal
    );
    bar.position.set(alongX ? uMid : px + nx * 0.02, yAt, alongX ? pz + nz * 0.02 : uMid);
    group.add(bar);
  }
  for (const uAt of [win.u0, win.u1]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(t, h + t * 2, t), materials.metal);
    bar.position.set(alongX ? uAt : px + nx * 0.02, yMid, alongX ? pz + nz * 0.02 : uAt);
    group.add(bar);
  }

  // Mullions: one vertical, one horizontal across the pane.
  const mullionDepth = depth * 0.6;
  const vBar = new THREE.Mesh(new THREE.BoxGeometry(0.05, h - 0.1, 0.05), materials.metal);
  vBar.position.set(px + nx * mullionDepth, yMid, pz + nz * mullionDepth);
  group.add(vBar);
  const hBar = new THREE.Mesh(
    new THREE.BoxGeometry(alongX ? w - 0.1 : 0.05, 0.05, alongX ? 0.05 : w - 0.1),
    materials.metal
  );
  hBar.position.set(px + nx * mullionDepth, win.y0 + h * 0.62, pz + nz * mullionDepth);
  group.add(hBar);

  // Sill protruding into the room.
  const sill = new THREE.Mesh(
    new THREE.BoxGeometry(alongX ? w + 0.24 : 0.4, 0.08, alongX ? 0.4 : w + 0.24),
    materials.metal
  );
  sill.position.set(px + nx * 0.14, win.y0 - 0.045, pz + nz * 0.14);
  group.add(sill);

  // Soft additive halo just inside the wall: the "light from nowhere" bloom.
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(w * 2.0, h * 1.8), materials.glowFor(color));
  halo.position.set(px + nx * 0.12, yMid, pz + nz * 0.12);
  halo.rotation.y = faceRotation();
  group.add(halo);
}
