// The objective: plant the charge at A or B, then defend it until it blows.
// The player channels the plant with E inside a site; a living defender can
// channel the defuse once it is planted. The bomb owns its own state machine;
// rounds.js reads the outcome.
import * as THREE from 'three';
import { PLANT_SECONDS, DEFUSE_SECONDS, BOMB_SECONDS } from './state.js';

export function createBomb(scene, world) {
  const device = new THREE.Group();
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.22, 0.26),
    new THREE.MeshStandardMaterial({ color: new THREE.Color('#1a1e28'), roughness: 0.5, metalness: 0.4 }),
  );
  const light = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 8, 6),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff5a4a') }),
  );
  light.position.set(0, 0.14, 0);
  device.add(box, light);
  device.visible = false;
  scene.add(device);

  const state = {
    status: 'idle',
    site: null,
    plant: 0,
    defuse: 0,
    timer: BOMB_SECONDS,
    defuser: null,
    pos: new THREE.Vector3(),
    beepAt: 0,
  };

  function nearestSite(pos) {
    for (const key of ['A', 'B']) {
      const site = world.sites[key];
      const dx = pos.x - site.center.x;
      const dz = pos.z - site.center.z;
      if (Math.hypot(dx, dz) <= site.radius) return key;
    }
    return null;
  }

  return {
    state,
    device,
    siteAt(pos) {
      return nearestSite(pos);
    },
    startPlant(siteKey) {
      state.status = 'planting';
      state.site = siteKey;
      state.plant = 0;
      const site = world.sites[siteKey];
      state.pos.set(site.center.x, 0.12, site.center.z);
    },
    cancelPlant() {
      state.status = 'idle';
      state.site = null;
      state.plant = 0;
    },
    step(dt, time, hooks) {
      if (state.status === 'planting') {
        state.plant += dt / PLANT_SECONDS;
        if (state.plant >= 1) {
          state.status = 'planted';
          state.timer = BOMB_SECONDS;
          state.defuse = 0;
          state.beepAt = time;
          device.position.copy(state.pos);
          device.visible = true;
          hooks.onPlanted(state.site);
        }
      } else if (state.status === 'planted') {
        state.timer -= dt;
        const interval = Math.max(0.25, state.timer / BOMB_SECONDS);
        if (time >= state.beepAt) {
          state.beepAt = time + interval;
          hooks.onBeep();
        }
        light.material.color.setHex(Math.floor(time * 4) % 2 === 0 ? 0xff5a4a : 0xff9a3c);
        if (state.defuse >= 1) {
          state.status = 'defused';
          device.visible = false;
          hooks.onDefused();
        } else if (state.timer <= 0) {
          state.status = 'exploded';
          device.visible = false;
          hooks.onExploded(state.pos);
        }
      }
    },
    reset() {
      state.status = 'idle';
      state.site = null;
      state.plant = 0;
      state.defuse = 0;
      state.timer = BOMB_SECONDS;
      state.defuser = null;
      device.visible = false;
    },
  };
}
