// The map: EMBERLINE yard, an original 40 x 30 m industrial yard at dusk. Two
// bomb sites (A west, B east), three lanes in (A long, mid doors, B short), and
// cover built from shipping containers, crates and barrels. Every solid box is
// a collider for bodies and a surface bullets stop on; the site beacons are
// light only, so they never block a shot.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const SITE_A = new THREE.Vector3(-15, 0, -10);
const SITE_B = new THREE.Vector3(15, 0, -10);

export function buildMap(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'ink' ? 0.5 : 0.92,
      metalness: name === 'rust' || name === 'slate' || name === 'olive' ? 0.25 : 0.03,
    });
  }
  const beamA = new THREE.MeshBasicMaterial({
    color: new THREE.Color(PALETTE.lamp), transparent: true, opacity: 0.05,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const beamB = new THREE.MeshBasicMaterial({
    color: new THREE.Color(PALETTE.siteB), transparent: true, opacity: 0.05,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });

  const colliders = [];
  const shootables = [];

  function box(width, height, depth, x, y, z, material, solid = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (solid) {
      colliders.push(new THREE.Box3().setFromObject(mesh));
      shootables.push(mesh);
    }
    return mesh;
  }

  function barrel(x, z) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.0, 12), materials.rust);
    mesh.position.set(x, 0.5, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    const box3 = new THREE.Box3(
      new THREE.Vector3(x - 0.42, 0, z - 0.42),
      new THREE.Vector3(x + 0.42, 1.0, z + 0.42),
    );
    colliders.push(box3);
    shootables.push(mesh);
    return mesh;
  }

  function lamp(x, z, color) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 5.2, 8), materials.cover);
    pole.position.set(x, 2.6, z);
    pole.castShadow = true;
    group.add(pole);
    colliders.push(new THREE.Box3(
      new THREE.Vector3(x - 0.1, 0, z - 0.1),
      new THREE.Vector3(x + 0.1, 5.2, z + 0.1),
    ));
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.24), materials.ink);
    head.position.set(x, 5.2, z);
    group.add(head);
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 10, 8),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color) }),
    );
    glow.position.set(x, 5.05, z);
    group.add(glow);
    const light = new THREE.PointLight(new THREE.Color(color), 22, 18, 1.8);
    light.position.set(x, 4.9, z);
    scene.add(light);
    return light;
  }

  // Floor and the four outer walls, 5 m high, open to the dusk sky.
  box(40.4, 0.4, 30.4, 0, -0.2, 0, 'wall');
  box(0.4, 5, 30.4, -20.2, 2.5, 0, 'wall');
  box(0.4, 5, 30.4, 20.2, 2.5, 0, 'wall');
  box(40.4, 5, 0.4, 0, 2.5, -15.2, 'wall');
  box(40.4, 5, 0.4, 0, 2.5, 15.2, 'wall');

  // Mid doors: two container stacks facing each other with a 2.4 m gap, the
  // fastest way from spawn to the sites and the riskiest sightline on the map.
  box(6, 2.6, 2.4, -4.2, 1.3, -2, 'rust');
  box(6, 2.6, 2.4, 4.2, 1.3, -2, 'olive');
  box(6, 2.6, 2.4, -4.2, 3.9, -2, 'slate');
  box(2.4, 1.1, 2.4, -5.5, 0.55, 2.2, 'cover');
  box(2.4, 1.1, 2.4, 5.5, 0.55, 2.2, 'cover');

  // A long (west lane): a container wall to duck behind, then crates to the site.
  box(2.4, 2.6, 6, -17.5, 1.3, 4, 'slate');
  box(1.1, 1.1, 1.1, -14.5, 0.55, 0, 'cover');
  box(1.1, 1.1, 1.1, -13.4, 0.55, 0, 'cover');
  box(1.1, 2.2, 1.1, -14.5, 1.1, -1.2, 'cover');
  box(3.2, 1.1, 1.2, -17.5, 0.55, -6.5, 'cover');
  box(1.2, 2.6, 2.4, -11, 1.3, -8.5, 'rust');
  barrel(-16.5, -3);
  barrel(-18.2, -8.2);

  // B short (east lane): a mirror with its own angles, not a copy.
  box(2.4, 2.6, 6, 17.5, 1.3, 2, 'olive');
  box(1.1, 1.1, 1.1, 14.5, 0.55, -1.5, 'cover');
  box(1.1, 1.1, 1.1, 13.4, 0.55, -2.6, 'cover');
  box(2.4, 1.1, 3.2, 17.5, 0.55, -5.5, 'cover');
  box(1.2, 2.6, 2.4, 11, 1.3, -8.5, 'slate');
  barrel(16.5, 5);
  barrel(13.8, -6.8);

  // Defender side: low cover in front of each site and a crate to stand on.
  box(2.4, 1.1, 1.2, -15, 0.55, -6.2, 'cover');
  box(2.4, 1.1, 1.2, 15, 0.55, -6.2, 'cover');
  box(1.1, 0.9, 1.1, -11.5, 0.45, -12.5, 'cover');
  box(1.1, 0.9, 1.1, 11.5, 0.45, -12.5, 'cover');
  box(4.8, 2.6, 1.2, -8, 1.3, -13.5, 'rust');
  box(4.8, 2.6, 1.2, 8, 1.3, -13.5, 'olive');

  // Attacker side: a couple of crates to stage behind before the push.
  box(2.4, 1.1, 1.2, -4, 0.55, 8.5, 'cover');
  box(2.4, 1.1, 1.2, 4, 0.55, 8.5, 'cover');
  barrel(-7.5, 10.5);
  barrel(7.5, 10.5);

  // Site beacons: a light beam and a glowing ring on the floor, so a site
  // reads from anywhere on the map. Neither blocks movement nor bullets.
  const rings = [];
  function beacon(center, material, colorName) {
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 7, 24, 1, true), material);
    beam.position.set(center.x, 3.5, center.z);
    group.add(beam);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.4, 2.9, 32),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(PALETTE[colorName]), transparent: true, opacity: 0.7,
        side: THREE.DoubleSide,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(center.x, 0.03, center.z);
    group.add(ring);
    rings.push(ring);
    return ring;
  }
  beacon(SITE_A, beamA, 'lamp');
  beacon(SITE_B, beamB, 'siteB');

  // Light: a cold dusk key from the north-west, warm lamps at the four
  // staging points, and a sky/ground gradient so shadows stay readable.
  const sky = new THREE.HemisphereLight(new THREE.Color('#3a4666'), new THREE.Color(PALETTE.sky), 1.5);
  scene.add(sky);
  const key = new THREE.DirectionalLight(new THREE.Color('#cfd8ff'), 2.4);
  key.position.set(-14, 20, -10);
  key.target.position.set(0, 0, 2);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -26;
  key.shadow.camera.right = 26;
  key.shadow.camera.top = 26;
  key.shadow.camera.bottom = -26;
  key.shadow.camera.far = 70;
  key.shadow.bias = -0.0006;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(new THREE.Color('#7fb2c9'), 1.0);
  fill.position.set(8, 10, 26);
  scene.add(fill);
  const lamps = [
    lamp(6, 12, PALETTE.lamp),
    lamp(-7.5, -2, PALETTE.lamp),
    lamp(-15, -10, PALETTE.lamp),
    lamp(15, -10, PALETTE.siteB),
  ];

  return {
    colliders,
    shootables,
    group,
    sites: {
      A: { center: SITE_A.clone(), radius: 3.0, color: 'lamp' },
      B: { center: SITE_B.clone(), radius: 3.0, color: 'siteB' },
    },
    spawns: {
      attack: new THREE.Vector3(0, 0, 12.5),
      defend: new THREE.Vector3(0, 0, -12.5),
    },
    routes: {
      A: [
        new THREE.Vector3(-8, 0, -8),
        new THREE.Vector3(-12, 0, -9),
        new THREE.Vector3(-15, 0, -10),
        new THREE.Vector3(-13, 0, -12.5),
      ],
      B: [
        new THREE.Vector3(8, 0, -8),
        new THREE.Vector3(12, 0, -9),
        new THREE.Vector3(15, 0, -10),
        new THREE.Vector3(13, 0, -12.5),
      ],
      mid: [
        new THREE.Vector3(-3, 0, -5),
        new THREE.Vector3(0, 0, -4),
        new THREE.Vector3(3, 0, -5),
        new THREE.Vector3(0, 0, -7),
      ],
      flex: [
        new THREE.Vector3(-5, 0, -6),
        new THREE.Vector3(-9, 0, -5),
        new THREE.Vector3(-6, 0, -9),
      ],
    },
    bounds: { minX: -19.6, maxX: 19.6, minZ: -14.6, maxZ: 14.6 },
    update(dt, time) {
      const pulse = 0.55 + Math.sin(time * 2.2) * 0.2;
      for (const ring of rings) ring.material.opacity = pulse;
      for (let i = 0; i < lamps.length; i += 1) {
        lamps[i].intensity = 22 + Math.sin(time * 7 + i * 2.1) * 1.2;
      }
    },
  };
}
