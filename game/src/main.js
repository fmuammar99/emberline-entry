// Boot and the one loop: a fixed 60 Hz simulation feeding a render at the
// display's rate. Combat resolution, grenades, the bomb, rounds and the HUD
// all live here; the systems own their own state. ?shot=start|combat|plant|end
// with &seed=N sets up a deterministic frame for a capture, renders it twice,
// then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { mulberry32 } from './rng.js';
import { createState } from './state.js';
import { buildMap } from './map.js';
import { createPlayer } from './player.js';
import { createWeapons, createGrenade } from './weapons.js';
import { createBots } from './bots.js';
import { createBomb } from './bomb.js';
import { createEconomy, KILL_REWARD, PLANT_REWARD, CATALOG } from './economy.js';
import { createRounds } from './rounds.js';
import { createFx } from './fx.js';
import { createHud } from './hud.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;
const liveSeed = (Date.now() % 2147483647) || 1;

const state = createState(shot ? seed : liveSeed);
const random = shot ? state.rng : mulberry32(liveSeed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.sky);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.sky), 28, 70);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const world = buildMap(scene);
const fx = createFx(scene);
const audio = createAudio();
const player = createPlayer(world.colliders, world.spawns.attack);
const weapons = createWeapons(camera);
const economy = createEconomy(state);
const hud = createHud();
const input = createInput(renderer.domElement, onLockChange);

state.player = player;
state.weapons = weapons;

const bomb = createBomb(scene, world);
const bots = createBots(scene, world, state, {
  onPlayerHit(damage, fromPos, crit) {
    if (state.phase !== 'live' || !player.state.alive) return;
    const dealt = player.damage(damage);
    if (dealt > 0) {
      audio.hurt();
      hud.damageFlash(0.25 + Math.min(0.5, damage / 40));
    }
    if (!player.state.alive) {
      hud.feed(`You were dropped${crit ? ' — headshot' : ''}.`);
      if (state.bomb.status !== 'planted') rounds.endRound('them', 'You were eliminated.');
    }
  },
  tracer(from, to, color) {
    fx.tracer(from, to, color);
  },
  sound(name, distance) {
    if (name === 'enemyShot') audio.enemyShot(distance);
  },
});

const rounds = createRounds(state, {
  onPhase(phase) {
    if (phase === 'buy') resetRound();
    if (phase === 'live') {
      hud.hideBuy();
      hud.hideOverlay();
      hud.setObjective(state.bomb.status === 'idle'
        ? 'Plant the charge at A or B — or clear every defender.'
        : 'Charge planted. Hold the site.');
    }
  },
  onRoundEnd(winner, reason) {
    hud.showOverlay('roundEnd', { winner, reason: roundReason(reason) });
    if (winner === 'you') audio.roundWin();
    else audio.roundLose();
  },
  onMatchEnd(winner) {
    hud.showOverlay('matchEnd', { winner, you: state.score.you, them: state.score.them });
  },
});

const raycaster = new THREE.Raycaster();
raycaster.far = 90;
// Read-only test hook: lets an automated play-test observe the live sim
// (positions, health, phase, bot state) without touching the DOM HUD.
window.__ember = { state, player, bots, bomb, rounds, economy, weapons, world };
// The raycast target list is built once: world surfaces plus every bot's
// torso and head. A dead bot's meshes stay in it and read as a body hit.
const shootTargets = world.shootables.slice();
for (const bot of bots.list) shootTargets.push(bot.meshes.torso, bot.meshes.head);
const direction = new THREE.Vector3();
const muzzlePos = new THREE.Vector3();
const eyePos = new THREE.Vector3();
const tempVec = new THREE.Vector3();

// The bot context is one object, updated in place every step, so the AI
// never allocates while it thinks.
const botCtx = {
  time: 0,
  playerPos: new THREE.Vector3(),
  playerAlive: true,
  playerSpeed: 0,
  playerCrouching: false,
  shotPos: null,
  shotAt: -99,
};

let started = false;
let frozen = false;
let accumulator = 0;
let lastTime = performance.now();
let plantAnchor = null;
const plantAnchorVec = new THREE.Vector3();

hud.setAmmo(weapons.state.mag, weapons.state.reserve, weapons.def().name);
hud.setHealth(100, 0);
hud.setMoney(state.money);
hud.setScore(0, 0, 1);
hud.setAlive(4, 4);
hud.setObjective('Plant the charge at A or B — or clear every defender.');
hud.buyClicked = (id) => {
  const item = CATALOG.find((entry) => entry.id === id);
  if (!item) return;
  const bought = economy.buy(item);
  if (!bought) return;
  audio.buy();
  if (item.kind === 'weapon') weapons.select(id);
  hud.setMoney(state.money);
  hud.setAmmo(weapons.state.mag, weapons.state.reserve, `${weapons.def().name} · G×${weapons.state.grenades}`);
  hud.showBuy(state.money, weapons.state.owned, weapons.state.grenades);
};

function roundReason(reason) {
  if (reason === 'time') return 'Time expired with no charge planted.';
  if (reason === 'eliminated') return 'You were eliminated.';
  return reason;
}

function resetRound() {
  player.reset(world.spawns.attack, 0);
  bots.reset();
  bomb.reset();
  weapons.resetRound();
  for (const grenade of state.grenades) grenade.dispose();
  state.grenades.length = 0;
  state.ghost = false;
  plantAnchor = null;
  hud.hideOverlay();
  if (!shot) hud.showBuy(state.money, weapons.state.owned, weapons.state.grenades);
  hud.setHealth(100, 0);
  hud.setAlive(bots.aliveCount(), 4);
  hud.setBomb('idle', 0, 0, 0);
}

function syncCamera() {
  player.eyePosition(eyePos);
  camera.position.copy(eyePos);
  camera.rotation.set(player.state.pitch, player.state.yaw, 0, 'YXZ');
}

function aimAt(point) {
  const body = player.state.body.position;
  const dx = point.x - body.x;
  const dy = point.y - (body.y + player.state.eye);
  const dz = point.z - body.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  player.state.yaw = Math.atan2(-dx, -dz);
  player.state.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function muzzleWorld(out) {
  camera.localToWorld(out.set(0.24, -0.18, -0.95));
  return out;
}

function shoot(spread) {
  const def = weapons.def();
  if (!weapons.takeRound()) {
    audio.dryFire();
    return;
  }
  state.shots += 1;
  camera.getWorldDirection(direction);
  direction.x += (random() * 2 - 1) * spread;
  direction.y += (random() * 2 - 1) * spread;
  direction.z += (random() * 2 - 1) * spread;
  direction.normalize();
  scene.updateMatrixWorld(true);
  raycaster.set(camera.position, direction);
  const hit = raycaster.intersectObjects(shootTargets, false)[0];
  muzzleWorld(muzzlePos);
  if (hit) {
    fx.tracer(muzzlePos, hit.point, 'ink');
    const bot = hit.object.userData.bot;
    if (bot) {
      const part = hit.object.userData.part;
      const amount = def.damage * (part === 'head' ? def.headMul : 1);
      const killed = bots.damage(bot, amount);
      state.hits += 1;
      hud.hitMarker(killed, shot ? 4000 : 90);
      audio.hit(killed);
      if (killed) {
        state.kills += 1;
        economy.earn(KILL_REWARD);
        hud.feed(`You dropped ${bot.name}${part === 'head' ? ' — headshot' : ''}. +$${KILL_REWARD}`);
        hud.setMoney(state.money);
        hud.setAlive(bots.aliveCount(), 4);
      }
    } else {
      fx.impact(hit.point, 6);
    }
  } else {
    tempVec.copy(camera.position).addScaledVector(direction, 90);
    fx.tracer(muzzlePos, tempVec, 'ink');
  }
  weapons.pullTrigger();
  audio.shot(def.sound);
  player.recoil(0.009 + random() * 0.004 + def.kick * 0.4, (random() * 2 - 1) * 0.004);
  botCtx.shotPos = botCtx.shotPos || new THREE.Vector3();
  botCtx.shotPos.copy(player.state.body.position);
  botCtx.shotAt = state.time;
  hud.setAmmo(weapons.state.mag, weapons.state.reserve, `${def.name} · G×${weapons.state.grenades}`);
}

function throwGrenade() {
  if (weapons.state.grenades <= 0) return;
  weapons.state.grenades -= 1;
  camera.getWorldDirection(direction);
  const grenade = createGrenade(scene, camera.position, direction, random);
  state.grenades.push(grenade);
  audio.grenadeThrow();
  hud.setAmmo(weapons.state.mag, weapons.state.reserve, `${weapons.def().name} · G×${weapons.state.grenades}`);
}

function explodeGrenade(grenade) {
  const pos = grenade.mesh.position;
  fx.explosion(pos);
  audio.explosion();
  for (const bot of bots.list) {
    if (!bot.alive) continue;
    const dist = bot.body.position.distanceTo(pos);
    if (dist < 6) {
      const amount = Math.max(20, 120 * (1 - dist / 6));
      const killed = bots.damage(bot, amount);
      if (killed) {
        state.kills += 1;
        economy.earn(KILL_REWARD);
        hud.feed(`You dropped ${bot.name} with a grenade. +$${KILL_REWARD}`);
        hud.setMoney(state.money);
        hud.setAlive(bots.aliveCount(), 4);
      }
    }
  }
  const playerDist = player.state.body.position.distanceTo(pos);
  if (playerDist < 4 && player.state.alive) {
    player.damage(Math.max(10, 60 * (1 - playerDist / 4)));
    hud.damageFlash(0.5);
    audio.hurt();
  }
  grenade.dispose();
}

function stepGrenades(dt) {
  for (let i = state.grenades.length - 1; i >= 0; i -= 1) {
    const grenade = state.grenades[i];
    grenade.fuse -= dt;
    grenade.velocity.y -= 20 * dt;
    const p = grenade.mesh.position;
    p.addScaledVector(grenade.velocity, dt);
    if (p.y < 0.09) {
      p.y = 0.09;
      grenade.velocity.y *= -0.45;
      grenade.velocity.x *= 0.7;
      grenade.velocity.z *= 0.7;
    }
    if (p.x < world.bounds.minX || p.x > world.bounds.maxX) grenade.velocity.x *= -0.45;
    if (p.z < world.bounds.minZ || p.z > world.bounds.maxZ) grenade.velocity.z *= -0.45;
    if (grenade.fuse <= 0) {
      explodeGrenade(grenade);
      state.grenades.splice(i, 1);
    }
  }
}

function step(dt) {
  state.time += dt;
  state.tick += 1;
  world.update(dt, state.time);
  rounds.step(dt);

  const live = state.phase === 'live';
  const buying = state.phase === 'buy';

  if (state.phase === 'buy' || live) {
    player.step(dt, input.state.keys);
    weapons.step(dt);
    // Look works in the buy phase too: the player may deploy early and wait
    // for the round, and the look delta must not pile up unspent.
    const look = input.takeLook();
    player.look(look.x, look.y);
  }

  if (live && player.state.alive) {
    weapons.state.triggerHeld = input.state.firing;
    if (weapons.wantFire()) {
      const speed = player.groundSpeed();
      let spread = weapons.spread(speed);
      if (player.state.crouching) spread *= 0.6;
      if (player.state.walking) spread *= 0.75;
      shoot(spread);
    }
    if (!weapons.state.triggerHeld) weapons.releaseTrigger();
    if (input.state.pressed.has('KeyR')) weapons.reload(audio);
    if (input.state.pressed.has('KeyG')) throwGrenade();
    const selectKeys = ['Digit1', 'Digit2', 'Digit3', 'Digit4'];
    const weaponIds = ['rifle', 'smg', 'dmr', 'shotgun'];
    for (let i = 0; i < 4; i += 1) {
      if (input.state.pressed.has(selectKeys[i])) {
        if (weapons.select(weaponIds[i])) {
          hud.setAmmo(weapons.state.mag, weapons.state.reserve, `${weapons.def().name} · G×${weapons.state.grenades}`);
          audio.click();
        }
      }
    }
    // Planting: press E inside a site to start, stay inside to finish.
    if (input.state.pressed.has('KeyE') && bomb.state.status === 'idle') {
      const site = bomb.siteAt(player.state.body.position);
      if (site) {
        bomb.startPlant(site);
        plantAnchorVec.copy(player.state.body.position);
        plantAnchor = true;
        audio.beep(false);
      }
    }
    if (bomb.state.status === 'planting') {
      const dist = player.state.body.position.distanceTo(plantAnchorVec);
      const site = bomb.siteAt(player.state.body.position);
      if (!site || dist > 2 || !player.state.alive) {
        bomb.cancelPlant();
        plantAnchor = null;
      }
    }
  }

  if (buying && input.state.pressed.has('KeyB')) {
    if (hudBuyVisible()) {
      hud.hideBuy();
      input.requestLock();
    } else {
      hud.showBuy(state.money, weapons.state.owned, weapons.state.grenades);
      // Free the mouse so the player can actually click the buy buttons.
      document.exitPointerLock();
    }
  }

  if (live) {
    botCtx.time = state.time;
    botCtx.playerPos.copy(player.state.body.position);
    botCtx.playerPos.y = player.state.body.position.y;
    botCtx.playerAlive = player.state.alive;
    botCtx.playerSpeed = player.groundSpeed();
    botCtx.playerCrouching = player.state.crouching;
    bots.step(dt, botCtx);
    bomb.step(dt, state.time, {
      onPlanted(site) {
        economy.earn(PLANT_REWARD);
        hud.feed(`Charge planted at Site ${site}. +$${PLANT_REWARD}`);
        hud.setMoney(state.money);
        audio.plantDone();
        hud.setObjective('Charge planted. Hold the site until it blows.');
      },
      onBeep() {
        audio.beep(true);
      },
      onDefused() {
        rounds.endRound('them', 'The charge was defused.');
      },
      onExploded(pos) {
        fx.explosion(pos);
        audio.explosion();
        rounds.endRound('you', 'The charge detonated.');
      },
    });
    stepGrenades(dt);
    fx.step(dt);
  }
  if (state.phase === 'end' || state.phase === 'match') fx.step(dt);

  // Win and loss checks, once per step, only while the round is live.
  if (live) {
    if (bots.aliveCount() === 0) {
      rounds.endRound('you', 'Every defender is down.');
    } else if (!player.state.alive && bomb.state.status !== 'planted' && bomb.state.status !== 'planting') {
      rounds.endRound('them', 'You were eliminated.');
    } else if (!player.state.alive && bomb.state.status === 'planted') {
      state.ghost = true;
    }
  }

  if (state.phase === 'buy' || live) syncCamera();
  syncHud();
}

function hudBuyVisible() {
  return !document.getElementById('buy').hidden;
}

function syncHud() {
  const p = player.state;
  hud.setHealth(p.health, p.armor);
  hud.setMoney(state.money);
  hud.setTimer(rounds.timeLeft(), state.phase);
  hud.setScore(state.score.you, state.score.them, state.round);
  hud.setAlive(bots.aliveCount(), 4);
  hud.setBomb(bomb.state.status, bomb.state.timer, bomb.state.plant, bomb.state.defuse);
  const speed = player.groundSpeed();
  const gap = 6 + weapons.spread(speed) * 380 + speed * 1.2;
  hud.setCrosshairGap(gap);
  if (state.phase === 'live') {
    if (!p.alive && state.ghost) hud.setObjective('You are down — the charge decides the round.');
    else if (bomb.state.status === 'planted') hud.setObjective('Charge planted. Hold the site.');
    else hud.setObjective('Plant the charge at A or B — or clear every defender.');
  }
}

function onLockChange(locked) {
  if (shot) return;
  audio.unlock();
  if (locked) {
    started = true;
    hud.hideOverlay();
    hud.hideBuy();
  } else if (state.phase === 'live' && !state.ghost && player.state.alive) {
    hud.showOverlay('paused');
  }
}

hud.onPlay(() => {
  if (shot) return;
  audio.unlock();
  if (state.phase === 'menu' || state.phase === 'match') {
    rounds.startMatch();
  }
  // Lock the pointer when resuming a live round (paused overlay), but not
  // when a round is about to start: the buy panel opens first and the player
  // shops with the mouse, locking the pointer with the Deploy button.
  if (state.phase !== 'buy') input.requestLock();
});

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    if (state.phase === 'menu') {
      // A slow cinematic orbit behind the start panel.
      const angle = state.time * 0.08;
      camera.position.set(Math.sin(angle) * 16, 8, Math.cos(angle) * 16);
      camera.lookAt(0, 1, -2);
      state.time += dt;
      world.update(dt, state.time);
      fx.step(dt);
    } else {
      accumulator += dt;
      let steps = 0;
      while (accumulator >= FIXED_STEP && steps < 5) {
        step(FIXED_STEP);
        accumulator -= FIXED_STEP;
        steps += 1;
      }
      if (accumulator > FIXED_STEP * 5) accumulator = 0;
    }
  }
  renderer.render(scene, camera);
  input.endFrame();
}

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function runShot(name) {
  hud.hideOverlay();
  hud.hideBuy();
  rounds.startMatch();
  state.phase = 'live';
  state.phaseTime = 0;
  resetRound();
  state.phase = 'live';
  state.phaseTime = 0;
  if (name === 'start') {
    player.reset(world.spawns.attack, 0);
    settle(30);
    // Elevated establishing view: the cover shows the yard, the lanes and
    // both site beacons from just above head height.
    player.state.body.position.y = 2.2;
    aimAt(new THREE.Vector3(-4, 0.5, -10));
  } else if (name === 'combat') {
    player.state.body.position.set(0, 0, 4);
    player.state.yaw = 0;
    player.state.pitch = 0;
    const bot = bots.list[0];
    bot.body.position.set(0, 0, -8);
    bot.meshes.group.position.set(0, 0, -8);
    bot.mode = 'engage';
    bot.lastSeen.copy(player.state.body.position);
    bot.lastSeenAt = state.time;
    bot.reactAt = state.time;
    const bot2 = bots.list[1];
    bot2.body.position.set(-5, 0, -6);
    bot2.meshes.group.position.set(-5, 0, -6);
    settle(12);
    aimAt(new THREE.Vector3(0, 1.1, -8));
    shoot(0);
    settle(2);
  } else if (name === 'plant') {
    player.state.body.position.set(-13.5, 0, -8.5);
    player.state.yaw = -0.5;
    player.state.pitch = 0;
    plantAnchorVec.copy(player.state.body.position);
    plantAnchor = true;
    bomb.startPlant('A');
    bomb.state.plant = 0.7;
    settle(6);
  } else {
    // end: two defenders down, round won banner up.
    bots.list[0].alive = false;
    bots.list[0].fall = 1;
    bots.list[0].meshes.group.rotation.x = -1.45;
    bots.list[1].alive = false;
    bots.list[1].fall = 1;
    bots.list[1].meshes.group.rotation.x = -1.45;
    state.score.you = 2;
    state.score.them = 1;
    player.state.body.position.set(0, 0, 2);
    player.state.yaw = 0.4;
    settle(20);
    hud.showOverlay('roundEnd', { winner: 'you', reason: 'The charge detonated at Site A.' });
  }
  syncCamera();
  syncHud();
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    if (state.phase !== 'menu') syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

document.getElementById('deploy').addEventListener('click', () => {
  if (shot) return;
  audio.unlock();
  hud.hideBuy();
  input.requestLock();
});

syncCamera();
if (shot) runShot(shot);
else requestAnimationFrame(frame);
