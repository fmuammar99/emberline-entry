// Effects: tracers, impact sparks and the explosion. Everything is pooled:
// a fixed set of meshes is reused, so the hot loop never allocates. Tracers
// are thin stretched boxes; sparks are small boxes with velocity and gravity.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const TRACER_COUNT = 24;
const SPARK_COUNT = 48;
const TRACER_LIFE = 0.07;
const SPARK_LIFE = 0.35;

export function createFx(scene) {
  const tracerGeo = new THREE.BoxGeometry(0.02, 0.02, 1);
  const tracerMats = {
    ink: new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.ink), transparent: true, opacity: 0.9 }),
    enemy: new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.enemy), transparent: true, opacity: 0.9 }),
    lamp: new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.lamp), transparent: true, opacity: 0.9 }),
  };
  const tracers = [];
  for (let i = 0; i < TRACER_COUNT; i += 1) {
    const mesh = new THREE.Mesh(tracerGeo, tracerMats.ink);
    mesh.visible = false;
    scene.add(mesh);
    tracers.push({ mesh, life: 0 });
  }
  let tracerNext = 0;

  const sparkGeo = new THREE.BoxGeometry(0.05, 0.05, 0.05);
  const sparkMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.lamp) });
  const sparks = [];
  for (let i = 0; i < SPARK_COUNT; i += 1) {
    const mesh = new THREE.Mesh(sparkGeo, sparkMat);
    mesh.visible = false;
    scene.add(mesh);
    sparks.push({ mesh, life: 0, velocity: new THREE.Vector3() });
  }
  let sparkNext = 0;

  const blast = new THREE.Mesh(
    new THREE.SphereGeometry(1, 20, 14),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.lamp), transparent: true, opacity: 0 }),
  );
  blast.visible = false;
  scene.add(blast);
  const blastLight = new THREE.PointLight(new THREE.Color(PALETTE.lamp), 0, 30, 1.5);
  scene.add(blastLight);
  let blastLife = 0;
  const blastPos = new THREE.Vector3();

  // Reused temporaries for tracer placement.
  const mid = new THREE.Vector3();

  function tracer(from, to, color) {
    const item = tracers[tracerNext];
    tracerNext = (tracerNext + 1) % TRACER_COUNT;
    const length = from.distanceTo(to);
    if (length < 0.1) return;
    item.mesh.material = tracerMats[color] || tracerMats.ink;
    mid.addVectors(from, to).multiplyScalar(0.5);
    item.mesh.position.copy(mid);
    item.mesh.lookAt(to);
    item.mesh.scale.set(1, 1, length);
    item.mesh.visible = true;
    item.life = TRACER_LIFE;
  }

  function impact(point, count = 6) {
    for (let n = 0; n < count; n += 1) {
      const item = sparks[sparkNext];
      sparkNext = (sparkNext + 1) % SPARK_COUNT;
      item.mesh.position.copy(point);
      item.velocity.set(
        (Math.random() * 2 - 1) * 3,
        Math.random() * 3.5,
        (Math.random() * 2 - 1) * 3,
      );
      item.mesh.visible = true;
      item.life = SPARK_LIFE * (0.6 + Math.random() * 0.4);
    }
  }

  function explosion(pos) {
    blastPos.copy(pos);
    blast.position.copy(pos);
    blast.visible = true;
    blastLife = 0.6;
    blastLight.position.copy(pos);
    blastLight.position.y = 1.5;
    impact(pos, 20);
  }

  function step(dt) {
    for (const item of tracers) {
      if (item.life <= 0) continue;
      item.life -= dt;
      if (item.life <= 0) item.mesh.visible = false;
    }
    for (const item of sparks) {
      if (item.life <= 0) continue;
      item.life -= dt;
      if (item.life <= 0) {
        item.mesh.visible = false;
        continue;
      }
      item.velocity.y -= 14 * dt;
      item.mesh.position.addScaledVector(item.velocity, dt);
      if (item.mesh.position.y < 0.02) {
        item.mesh.position.y = 0.02;
        item.velocity.y *= -0.4;
      }
    }
    if (blastLife > 0) {
      blastLife -= dt;
      const k = 1 - Math.max(0, blastLife) / 0.6;
      const scale = 1 + k * 7;
      blast.scale.setScalar(scale);
      blast.material.opacity = Math.max(0, 0.75 * (1 - k));
      blastLight.intensity = Math.max(0, 120 * (1 - k));
      if (blastLife <= 0) {
        blast.visible = false;
        blastLight.intensity = 0;
      }
    }
  }

  return { tracer, impact, explosion, step };
}
