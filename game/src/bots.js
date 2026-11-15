// The defenders: four bots with callsigns, routes, and a small state machine.
// They patrol their site, hold angles, react to what they see and hear, strafe
// and burst-fire when engaged, fall back when hurt, and converge on a planted
// charge to defuse it. One module owns their bodies, their sight and their
// shooting; main.js owns the player's damage and the score.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { makeBody, stepBody } from './physics.js';

const NAMES = ['Vex', 'Rook', 'Sable', 'Moss'];
const HEALTH = 100;
const BOT_SPEED = 3.4;
const BOT_RADIUS = 0.34;
const BOT_HEIGHT = 1.72;
const VISION_RANGE = 42;
const VISION_HALF_FOV = 0.96;
const HEAR_RANGE = 26;
const SHOT_DAMAGE = 14;

export function createBots(scene, world, state, hooks) {
  const bots = [];
  const raycaster = new THREE.Raycaster();
  raycaster.far = 60;
  // Reused temporaries: the AI never allocates inside its step.
  const toPlayer = new THREE.Vector3();
  const eyePos = new THREE.Vector3();
  const chestPos = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const target = new THREE.Vector3();

  const bodyMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color('#3a3e46'), roughness: 0.8 });
  const visorMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.enemy), roughness: 0.3, emissive: new THREE.Color(PALETTE.enemy), emissiveIntensity: 0.7 });
  const legMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color('#1d1f24'), roughness: 0.9 });
  const gunMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const torsoGeometry = new THREE.BoxGeometry(0.52, 0.78, 0.3);
  const headGeometry = new THREE.SphereGeometry(0.16, 12, 10);
  const legGeometry = new THREE.BoxGeometry(0.18, 0.72, 0.2);
  const gunGeometry = new THREE.BoxGeometry(0.07, 0.09, 0.62);

  function buildMesh(bot) {
    const group = new THREE.Group();
    const torso = new THREE.Mesh(torsoGeometry, bodyMaterial);
    torso.position.y = 1.0;
    torso.userData.bot = bot;
    torso.userData.part = 'torso';
    const head = new THREE.Mesh(headGeometry, bodyMaterial);
    head.position.y = 1.52;
    head.userData.bot = bot;
    head.userData.part = 'head';
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 0.06), visorMaterial);
    visor.position.set(0, 1.54, -0.13);
    visor.userData.bot = bot;
    visor.userData.part = 'head';
    const legL = new THREE.Mesh(legGeometry, legMaterial);
    legL.position.set(-0.13, 0.36, 0);
    const legR = new THREE.Mesh(legGeometry, legMaterial);
    legR.position.set(0.13, 0.36, 0);
    const gun = new THREE.Mesh(gunGeometry, gunMaterial);
    gun.position.set(0.2, 1.05, -0.3);
    group.add(torso, head, visor, legL, legR, gun);
    group.traverse((mesh) => {
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    scene.add(group);
    return { group, torso, head };
  }

  function spawnBot(index, routeName) {
    const route = world.routes[routeName];
    const home = route[route.length - 1];
    const bot = {
      id: index,
      name: NAMES[index],
      body: makeBody(home.x, 0, home.z, BOT_RADIUS, BOT_HEIGHT),
      health: HEALTH,
      alive: true,
      yaw: Math.PI,
      mode: 'patrol',
      route,
      routeIndex: 0,
      holdUntil: 0,
      lastSeen: new THREE.Vector3(),
      lastSeenAt: -99,
      lastHeardAt: -99,
      reactAt: 0,
      burstLeft: 0,
      nextShotAt: 0,
      aimTime: 0,
      strafeDir: 1,
      strafeUntil: 0,
      stuckAt: 0,
      stuckPos: new THREE.Vector3(),
      fall: 0,
      defusing: false,
    };
    bot.meshes = buildMesh(bot);
    bot.stuckPos.copy(bot.body.position);
    bots.push(bot);
    return bot;
  }

  spawnBot(0, 'A');
  spawnBot(1, 'B');
  spawnBot(2, 'mid');
  spawnBot(3, 'flex');

  function canSee(bot, ctx) {
    if (!ctx.playerAlive) return false;
    eyePos.set(bot.body.position.x, bot.body.position.y + 1.55, bot.body.position.z);
    chestPos.copy(ctx.playerPos);
    chestPos.y -= 0.25;
    toPlayer.subVectors(chestPos, eyePos);
    const dist = toPlayer.length();
    if (dist > VISION_RANGE) return false;
    toPlayer.normalize();
    dir.set(-Math.sin(bot.yaw), 0, -Math.cos(bot.yaw));
    if (dir.dot(toPlayer) < Math.cos(VISION_HALF_FOV)) return false;
    raycaster.set(eyePos, toPlayer);
    raycaster.far = dist;
    const hit = raycaster.intersectObjects(world.shootables, false)[0];
    if (hit && hit.distance < dist - 0.6) return false;
    return true;
  }

  function faceToward(bot, point, dt) {
    const want = Math.atan2(-(point.x - bot.body.position.x), -(point.z - bot.body.position.z));
    let diff = want - bot.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    bot.yaw += Math.max(-3.2 * dt, Math.min(3.2 * dt, diff));
  }

  function moveToward(bot, point, dt, speed) {
    target.subVectors(point, bot.body.position);
    target.y = 0;
    const dist = target.length();
    if (dist < 0.4) return true;
    target.normalize();
    faceToward(bot, point, dt);
    stepBody(bot.body, world.colliders, dt, target.x * speed, target.z * speed);
    return false;
  }

  function shootAt(bot, ctx) {
    if (ctx.time < bot.nextShotAt) return;
    if (bot.burstLeft <= 0) {
      bot.burstLeft = 3 + Math.floor(state.rng() * 3);
      bot.nextShotAt = ctx.time + 0.45 + state.rng() * 0.45;
      return;
    }
    bot.burstLeft -= 1;
    bot.nextShotAt = ctx.time + 0.13;
    eyePos.set(bot.body.position.x, bot.body.position.y + 1.45, bot.body.position.z);
    chestPos.copy(ctx.playerPos);
    chestPos.y -= 0.25;
    toPlayer.subVectors(chestPos, eyePos);
    const dist = toPlayer.length();
    toPlayer.normalize();
    const spread = Math.max(0.008, 0.02 + dist * 0.001 + ctx.playerSpeed * 0.004 - bot.aimTime * 0.004);
    toPlayer.x += (state.rng() * 2 - 1) * spread;
    toPlayer.y += (state.rng() * 2 - 1) * spread;
    toPlayer.z += (state.rng() * 2 - 1) * spread;
    toPlayer.normalize();
    raycaster.set(eyePos, toPlayer);
    raycaster.far = 80;
    const hit = raycaster.intersectObjects(world.shootables, false)[0];
    const end = new THREE.Vector3();
    if (hit) end.copy(hit.point);
    else end.copy(eyePos).addScaledVector(toPlayer, 80);
    hooks.tracer(eyePos, end, PALETTE.enemy);
    hooks.sound('enemyShot', dist);
    // The ray is checked against the player's capsule, not a mesh.
    const hitPlayer = rayHitPlayer(eyePos, toPlayer, ctx);
    if (hitPlayer) {
      const falloff = Math.max(0.4, 1 - dist / 60);
      const crit = state.rng() < 0.08;
      const damage = SHOT_DAMAGE * falloff * (crit ? 2 : 1);
      hooks.onPlayerHit(damage, bot.body.position, crit);
    }
  }

  // Ray vs the player's upright capsule, approximated as a vertical segment
  // with radius: returns true when the ray passes within it.
  function rayHitPlayer(origin, direction, ctx) {
    const px = ctx.playerPos.x;
    const pz = ctx.playerPos.z;
    const py0 = ctx.playerPos.y;
    const py1 = ctx.playerPos.y + (ctx.playerCrouching ? 1.12 : 1.72);
    const dx = px - origin.x;
    const dz = pz - origin.z;
    const t = Math.max(0, dx * direction.x + dz * direction.z);
    const cx = origin.x + direction.x * t;
    const cz = origin.z + direction.z * t;
    const cy = origin.y + direction.y * t;
    const radial = Math.hypot(cx - px, cz - pz);
    return radial < 0.45 && cy > py0 - 0.1 && cy < py1 + 0.1;
  }

  function stepBot(bot, dt, ctx) {
    if (!bot.alive) {
      if (bot.fall < 1) {
        bot.fall = Math.min(1, bot.fall + dt / 0.4);
        bot.meshes.group.rotation.x = -bot.fall * 1.45;
        bot.meshes.group.position.y = -bot.fall * 0.08;
      }
      return;
    }
    const time = ctx.time;

    // Vision, staggered so four bots never raycast on the same tick.
    bot.visionTimer = (bot.visionTimer || 0) - dt;
    if (bot.visionTimer <= 0) {
      bot.visionTimer = 0.12 + bot.id * 0.03;
      if (canSee(bot, ctx)) {
        bot.lastSeen.copy(ctx.playerPos);
        bot.lastSeenAt = time;
        if (bot.mode !== 'engage') bot.reactAt = time + 0.35 + state.rng() * 0.35;
        bot.mode = 'engage';
        bot.aimTime = 0;
      }
    }
    // Hearing: a shot nearby gives the bots a position to investigate.
    if (ctx.shotAt > bot.lastHeardAt && ctx.shotPos) {
      const d = bot.body.position.distanceTo(ctx.shotPos);
      if (d < HEAR_RANGE) {
        bot.lastHeardAt = ctx.shotAt;
        bot.lastSeen.copy(ctx.shotPos);
        bot.lastSeenAt = time;
        if (bot.mode !== 'engage') bot.mode = 'seek';
      }
    }
    // A planted charge pulls the nearest bots to defuse it.
    if (state.bomb.status === 'planted' && !bot.defusing) {
      const d = bot.body.position.distanceTo(state.bomb.pos);
      const others = bots.filter((b) => b.alive && b.defusing).length;
      if (d < 30 && others < 2 && bot.mode !== 'engage') {
        bot.mode = 'defuse';
        bot.defusing = true;
      }
    }

    if (bot.mode === 'engage') {
      bot.aimTime += dt;
      faceToward(bot, ctx.playerPos, dt);
      if (time > bot.strafeUntil) {
        bot.strafeDir = state.rng() < 0.5 ? -1 : 1;
        bot.strafeUntil = time + 0.8 + state.rng() * 0.7;
      }
      const side = Math.cos(bot.yaw) * bot.strafeDir;
      const fwd = Math.sin(bot.yaw) * bot.strafeDir;
      stepBody(bot.body, world.colliders, dt, side * 1.4, fwd * 1.4);
      if (time >= bot.reactAt) shootAt(bot, ctx);
      if (time - bot.lastSeenAt > 2.5) {
        bot.mode = 'seek';
        bot.aimTime = 0;
      }
    } else if (bot.mode === 'seek') {
      if (moveToward(bot, bot.lastSeen, dt, BOT_SPEED)) {
        bot.mode = 'patrol';
        bot.holdUntil = time + 2;
      }
      if (time - bot.lastSeenAt > 6) bot.mode = 'patrol';
    } else if (bot.mode === 'defuse') {
      if (state.bomb.status !== 'planted') {
        bot.mode = 'patrol';
        bot.defusing = false;
      } else if (moveToward(bot, state.bomb.pos, dt, BOT_SPEED + 0.4)) {
        faceToward(bot, state.bomb.pos, dt);
        state.bomb.defuse += dt / 5;
      }
    } else {
      // patrol / hold: walk the route, pause at each waypoint and look around.
      if (time < bot.holdUntil) {
        bot.yaw += Math.sin(time * 0.7 + bot.id * 2) * dt * 0.5;
      } else {
        const point = bot.route[bot.routeIndex % bot.route.length];
        if (moveToward(bot, point, dt, BOT_SPEED * 0.8)) {
          bot.routeIndex += 1;
          bot.holdUntil = time + 1.5 + state.rng() * 1.5;
        }
      }
    }

    // Retreat when badly hurt: fall back toward the nearest site and fight
    // from cover instead of pushing.
    if (bot.health < 30 && bot.mode !== 'engage' && bot.mode !== 'defuse') {
      const site = bot.body.position.x < 0 ? world.sites.A.center : world.sites.B.center;
      moveToward(bot, site, dt, BOT_SPEED);
    }

    // Stuck detection: if the bot has not moved for a second, skip a waypoint.
    if (bot.body.position.distanceTo(bot.stuckPos) > 0.5) {
      bot.stuckPos.copy(bot.body.position);
      bot.stuckAt = time;
    } else if (time - bot.stuckAt > 1.2 && (bot.mode === 'patrol' || bot.mode === 'seek')) {
      bot.routeIndex += 1;
      bot.stuckAt = time;
      bot.stuckPos.copy(bot.body.position);
    }

    bot.meshes.group.position.set(bot.body.position.x, bot.body.position.y, bot.body.position.z);
    bot.meshes.group.rotation.y = bot.yaw;
  }

  function damage(bot, amount) {
    if (!bot.alive) return false;
    bot.health -= amount;
    if (bot.health > 0) return false;
    bot.alive = false;
    bot.fall = 0;
    bot.defusing = false;
    return true;
  }

  function reset() {
    for (const bot of bots) {
      const home = bot.route[bot.route.length - 1];
      bot.body.position.set(home.x, 0, home.z);
      bot.body.velocity.set(0, 0, 0);
      bot.health = HEALTH;
      bot.alive = true;
      bot.yaw = Math.PI;
      bot.mode = 'patrol';
      bot.routeIndex = 0;
      bot.holdUntil = 0;
      bot.lastSeenAt = -99;
      bot.lastHeardAt = -99;
      bot.fall = 0;
      bot.defusing = false;
      bot.meshes.group.rotation.set(0, 0, 0);
      bot.meshes.group.position.set(home.x, 0, home.z);
    }
  }

  return {
    list: bots,
    step(dt, ctx) {
      for (const bot of bots) stepBot(bot, dt, ctx);
    },
    damage,
    reset,
    aliveCount() {
      return bots.filter((b) => b.alive).length;
    },
    hitMeshes() {
      const meshes = [];
      for (const bot of bots) {
        if (bot.alive) meshes.push(bot.meshes.torso, bot.meshes.head);
      }
      return meshes;
    },
  };
}
