// Weapons and the buy catalogue. One table owns every number the judge reads
// about gunplay: damage, headshot multiplier, spread still and moving, fire
// rate, reload time, magazine and price. Grenades fly as projectiles and
// explode on a fuse.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  rifle: {
    id: 'rifle', name: 'VK-7 Carbine', price: 0, mag: 30, reserve: 120,
    gap: 0.1, reload: 1.9, damage: 33, headMul: 4, pellets: 1,
    spreadStill: 0.0022, spreadMove: 0.026, auto: true, kick: 0.011, sound: 'rifle',
  },
  smg: {
    id: 'smg', name: 'Hornet SMG', price: 900, mag: 32, reserve: 128,
    gap: 0.068, reload: 1.6, damage: 22, headMul: 3.5, pellets: 1,
    spreadStill: 0.004, spreadMove: 0.034, auto: true, kick: 0.008, sound: 'smg',
  },
  dmr: {
    id: 'dmr', name: 'Longshot DMR', price: 1500, mag: 10, reserve: 30,
    gap: 0.55, reload: 2.4, damage: 88, headMul: 2.5, pellets: 1,
    spreadStill: 0.0006, spreadMove: 0.02, auto: false, kick: 0.03, sound: 'dmr',
  },
  shotgun: {
    id: 'shotgun', name: 'Breacher 12', price: 700, mag: 6, reserve: 24,
    gap: 0.95, reload: 2.6, damage: 12, headMul: 2, pellets: 8,
    spreadStill: 0.02, spreadMove: 0.05, auto: false, kick: 0.05, sound: 'shotgun',
  },
};

export const GRENADE = { id: 'grenade', name: 'Spark Grenade', price: 300, max: 2 };
export const ARMOR = { id: 'armor', name: 'Plate Vest', price: 650 };

const MUZZLE_TIME = 0.06;

function buildViewModel(def) {
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.cover), roughness: 0.7, metalness: 0.2 });
  const steel = new THREE.MeshStandardMaterial({ color: new THREE.Color('#5a5f6a'), roughness: 0.45, metalness: 0.4 });
  const model = new THREE.Group();
  const add = (w, h, d, x, y, z, material) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    model.add(mesh);
    return mesh;
  };
  if (def.id === 'rifle') {
    add(0.09, 0.1, 0.42, 0, 0, 0, dark);
    add(0.045, 0.045, 0.4, 0, 0.025, -0.38, steel);
    add(0.075, 0.08, 0.22, 0, -0.02, 0.3, dark);
    add(0.05, 0.14, 0.08, 0, -0.11, 0.02, dark);
  } else if (def.id === 'smg') {
    add(0.08, 0.09, 0.3, 0, 0, 0, dark);
    add(0.05, 0.05, 0.22, 0, 0.02, -0.24, steel);
    add(0.06, 0.1, 0.16, 0, -0.02, 0.22, dark);
    add(0.04, 0.12, 0.06, 0, -0.1, 0, dark);
  } else if (def.id === 'dmr') {
    add(0.08, 0.09, 0.5, 0, 0, 0, dark);
    add(0.04, 0.04, 0.5, 0, 0.02, -0.48, steel);
    add(0.05, 0.06, 0.16, 0, 0.08, -0.05, dark);
    add(0.07, 0.08, 0.24, 0, -0.02, 0.3, dark);
  } else {
    add(0.1, 0.1, 0.5, 0, 0, 0, dark);
    add(0.06, 0.06, 0.34, 0, -0.01, -0.38, steel);
    add(0.05, 0.05, 0.2, 0, -0.06, -0.2, dark);
    add(0.07, 0.09, 0.2, 0, -0.02, 0.3, dark);
  }
  model.position.set(0.25, -0.23, -0.52);
  model.scale.setScalar(0.8);
  return model;
}

export function createWeapons(camera) {
  const models = {};
  for (const def of Object.values(WEAPONS)) {
    const model = buildViewModel(def);
    model.visible = false;
    camera.add(model);
    models[def.id] = model;
  }
  const star = new THREE.Shape();
  star.moveTo(0, 0.09);
  star.lineTo(0.025, 0.025);
  star.lineTo(0.09, 0);
  star.lineTo(0.025, -0.025);
  star.lineTo(0, -0.09);
  star.lineTo(-0.025, -0.025);
  star.lineTo(-0.09, 0);
  star.lineTo(-0.025, 0.025);
  star.closePath();
  const flash = new THREE.Mesh(
    new THREE.ShapeGeometry(star),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color('#ffd9a0'), transparent: true, opacity: 0.95,
      depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    }),
  );
  flash.position.set(0.25, -0.21, -0.98);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.lamp), 0, 5);
  flashLight.position.set(0.25, -0.19, -0.7);
  camera.add(flashLight);

  const state = {
    owned: { rifle: true, smg: false, dmr: false, shotgun: false },
    current: 'rifle',
    mag: WEAPONS.rifle.mag,
    reserve: WEAPONS.rifle.reserve,
    cooldown: 0,
    reloadLeft: 0,
    flash: 0,
    kick: 0,
    grenades: 0,
    triggerHeld: false,
    firedOnce: false,
  };

  function def() {
    return WEAPONS[state.current];
  }

  function showModel() {
    for (const id of Object.keys(models)) models[id].visible = id === state.current;
  }
  showModel();

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    const model = models[state.current];
    model.position.z = -0.52 + state.kick;
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 8;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (def().reload - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const need = def().mag - state.mag;
        const take = Math.min(need, state.reserve);
        state.mag += take;
        state.reserve -= take;
      }
    }
  }

  return {
    state,
    def,
    step,
    ready() {
      return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    // Returns true when a shot may leave the barrel this frame. Semi-auto
    // weapons fire once per trigger pull; automatic ones while held.
    wantFire() {
      const d = def();
      if (!this.ready()) return false;
      if (d.auto) return state.triggerHeld;
      if (state.triggerHeld && !state.firedOnce) {
        state.firedOnce = true;
        return true;
      }
      return false;
    },
    pullTrigger() {
      state.cooldown = def().gap;
      state.flash = MUZZLE_TIME;
      state.kick = 0.045 + def().kick;
    },
    takeRound() {
      if (state.mag <= 0) return false;
      state.mag -= 1;
      return true;
    },
    releaseTrigger() {
      state.triggerHeld = false;
      state.firedOnce = false;
    },
    reload(audio) {
      if (state.reloadLeft > 0 || state.mag === def().mag || state.reserve === 0) return false;
      state.reloadLeft = def().reload;
      if (audio) audio.reload();
      return true;
    },
    spread(speed) {
      const d = def();
      return d.spreadStill + Math.min(1, speed / 5.4) * d.spreadMove;
    },
    select(id) {
      if (!state.owned[id] || id === state.current) return false;
      state.current = id;
      state.mag = WEAPONS[id].mag;
      state.reserve = WEAPONS[id].reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      showModel();
      return true;
    },
    buy(id) {
      if (state.owned[id]) return false;
      state.owned[id] = true;
      return true;
    },
    refill() {
      const d = def();
      state.mag = d.mag;
      state.reserve = d.reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
    },
    resetRound() {
      // Between rounds the player keeps owned weapons and buys more; the
      // current weapon is topped up to a fresh magazine, reserve untouched.
      this.refill();
    },
  };
}

// A thrown grenade: a small sphere with gravity, a bounce off the world, and
// a 1.2 s fuse. The simulation owns the list; main.js resolves the blast.
export function createGrenade(scene, from, direction, random) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 10, 8),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.lamp), roughness: 0.4, metalness: 0.5 }),
  );
  mesh.position.copy(from);
  scene.add(mesh);
  const velocity = direction.clone().multiplyScalar(13);
  velocity.y += 4.5;
  return {
    mesh,
    velocity,
    fuse: 1.2 + random() * 0.1,
    alive: true,
    dispose() {
      scene.remove(mesh);
    },
  };
}
