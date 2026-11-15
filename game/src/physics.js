// Shared body physics: a capsule approximated as a box, resolved one axis at
// a time against the world's colliders, so neither the player nor a bot is ever
// swallowed by a wall. One module, used by both.
import * as THREE from 'three';

const GRAVITY = 20;

export function makeBody(x, y, z, radius, height) {
  return {
    position: new THREE.Vector3(x, y, z),
    velocity: new THREE.Vector3(),
    radius,
    height,
    onGround: true,
  };
}

// The reusable probe box: allocated once, never per frame.
const probe = new THREE.Box3();

export function overlapsAt(colliders, x, y, z, radius, height, lift) {
  probe.min.set(x - radius, y + lift, z - radius);
  probe.max.set(x + radius, y + height - lift, z + radius);
  for (let i = 0; i < colliders.length; i += 1) {
    if (probe.intersectsBox(colliders[i])) return colliders[i];
  }
  return null;
}

// Gravity plus axis-separated horizontal motion. `move` is the horizontal
// velocity already computed by the caller (m/s). Returns nothing.
export function stepBody(body, colliders, dt, moveX, moveZ) {
  body.velocity.y -= GRAVITY * dt;
  const nextX = body.position.x + moveX * dt;
  if (!overlapsAt(colliders, nextX, body.position.y, body.position.z, body.radius, body.height, 0.04)) {
    body.position.x = nextX;
  }
  const nextZ = body.position.z + moveZ * dt;
  if (!overlapsAt(colliders, body.position.x, body.position.y, nextZ, body.radius, body.height, 0.04)) {
    body.position.z = nextZ;
  }
  body.position.y += body.velocity.y * dt;
  body.onGround = false;
  const hit = overlapsAt(colliders, body.position.x, body.position.y, body.position.z, body.radius, body.height, 0);
  if (hit && body.velocity.y <= 0) {
    body.position.y = hit.max.y;
    body.velocity.y = 0;
    body.onGround = true;
  } else if (hit) {
    body.position.y = hit.min.y - body.height;
    body.velocity.y = 0;
  }
  if (body.position.y < 0) {
    body.position.y = 0;
    body.velocity.y = 0;
    body.onGround = true;
  }
  if (body.velocity.y < -30) body.velocity.y = -30;
}
