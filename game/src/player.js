// The player: acceleration, friction, gravity, crouch and jump over the shared
// body physics, plus health and armour. It owns no rendering; main.js reads
// its state to place the camera.
import { makeBody, stepBody } from './physics.js';

const RADIUS = 0.34;
const STAND_HEIGHT = 1.72;
const CROUCH_HEIGHT = 1.12;
const STAND_EYE = 1.6;
const CROUCH_EYE = 1.02;
const WALK_SPEED = 5.4;
const CROUCH_SPEED = 2.5;
const WALK_QUIET_SPEED = 3.1;
const GROUND_ACCEL = 46;
const AIR_ACCEL = 10;
const FRICTION = 9.5;
const JUMP_SPEED = 6.4;

export function createPlayer(colliders, spawn) {
  const body = makeBody(spawn.x, spawn.y, spawn.z, RADIUS, STAND_HEIGHT);
  const player = {
    body,
    yaw: 0,
    pitch: 0,
    eye: STAND_EYE,
    crouching: false,
    walking: false,
    health: 100,
    maxHealth: 100,
    armor: 0,
    alive: true,
    height: STAND_HEIGHT,
  };
  let moveX = 0;
  let moveZ = 0;

  function look(dx, dy, sensitivity = 0.0022) {
    player.yaw -= dx * sensitivity;
    player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch - dy * sensitivity));
  }

  function recoil(pitchKick, yawKick) {
    player.pitch = Math.min(1.45, player.pitch + pitchKick);
    player.yaw += yawKick;
  }

  function step(dt, keys) {
    if (!player.alive) return;
    const wantCrouch = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
    player.walking = keys.has('ShiftLeft') || keys.has('ShiftRight');
    if (wantCrouch && !player.crouching) {
      player.crouching = true;
      player.height = CROUCH_HEIGHT;
      body.height = CROUCH_HEIGHT;
    } else if (!wantCrouch && player.crouching) {
      player.crouching = false;
      player.height = STAND_HEIGHT;
      body.height = STAND_HEIGHT;
    }
    const eyeTarget = player.crouching ? CROUCH_EYE : STAND_EYE;
    player.eye += (eyeTarget - player.eye) * Math.min(1, dt * 12);

    const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    const sin = Math.sin(player.yaw);
    const cos = Math.cos(player.yaw);
    let wishX = 0;
    let wishZ = 0;
    if (forward || strafe) {
      wishX = -sin * forward + cos * strafe;
      wishZ = -cos * forward - sin * strafe;
      const len = Math.hypot(wishX, wishZ) || 1;
      wishX /= len;
      wishZ /= len;
    }
    const speed = player.crouching ? CROUCH_SPEED : player.walking ? WALK_QUIET_SPEED : WALK_SPEED;
    const blend = Math.min(1, ((body.onGround ? GROUND_ACCEL : AIR_ACCEL) * dt) / speed);
    body.velocity.x += (wishX * speed - body.velocity.x) * blend;
    body.velocity.z += (wishZ * speed - body.velocity.z) * blend;
    if (body.onGround && !forward && !strafe) {
      const damp = Math.max(0, 1 - FRICTION * dt);
      body.velocity.x *= damp;
      body.velocity.z *= damp;
    }
    if (keys.has('Space') && body.onGround) {
      body.velocity.y = JUMP_SPEED;
      body.onGround = false;
    }
    moveX = body.velocity.x;
    moveZ = body.velocity.z;
    stepBody(body, colliders, dt, moveX, moveZ);
  }

  function damage(amount) {
    if (!player.alive) return 0;
    let remaining = amount;
    if (player.armor > 0) {
      const absorbed = Math.min(player.armor, remaining * 0.5);
      player.armor -= absorbed;
      remaining -= absorbed;
    }
    player.health = Math.max(0, player.health - remaining);
    if (player.health <= 0) player.alive = false;
    return remaining;
  }

  function reset(spawnPoint, yawValue) {
    body.position.copy(spawnPoint);
    body.velocity.set(0, 0, 0);
    body.height = STAND_HEIGHT;
    player.yaw = yawValue;
    player.pitch = 0;
    player.eye = STAND_EYE;
    player.crouching = false;
    player.health = player.maxHealth;
    player.armor = 0;
    player.alive = true;
    player.height = STAND_HEIGHT;
  }

  return {
    state: player,
    step,
    look,
    recoil,
    damage,
    reset,
    groundSpeed() {
      return Math.hypot(body.velocity.x, body.velocity.z);
    },
    eyePosition(out) {
      out.set(body.position.x, body.position.y + player.eye, body.position.z);
      return out;
    },
  };
}
