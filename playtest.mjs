// Automated play-test for EMBERLINE — drives the real game in headless Chrome
// via CDP and asserts the core loop: deploy -> buy -> live -> move -> aim ->
// shoot -> bots shoot back -> round ends -> next round. Uses the window.__ember
// test hook only to observe state (and, where the headless pointer-lock path
// cannot move the mouse, to set the aim yaw/pitch directly).
// NOTE: headless SwiftShader renders at ~4 fps, so the fixed-step sim runs at
// ~0.42x wall time here; waits are sized for that. On real hardware the sim
// runs at full speed. Viewport is 640x400 to keep frames as fast as possible.
// Usage: node playtest.mjs
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const goUrl = `file:///tmp/go-game.html?to=${encodeURIComponent('http://example.com:8080/')}`;
const created = await fetch(`http://127.0.0.1:9222/json/new?${goUrl}`, { method: 'PUT' }).then((r) => r.json());
const ws = new WebSocket(created.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0;
const pending = new Map();
const errors = [];
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { res, rej } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) rej(new Error(JSON.stringify(msg.error)));
    else res(msg.result);
  } else if (msg.method === 'Runtime.exceptionThrown') {
    errors.push(`exception: ${(msg.params.exceptionDetails.exception?.description || '').slice(0, 300)}`);
  } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
    errors.push(`console.error: ${msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ')}`);
  }
};
const send = (m, p = {}) => new Promise((res, rej) => { const mid = ++id; pending.set(mid, { res, rej }); ws.send(JSON.stringify({ id: mid, method: m, params: p })); });
const ev = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('eval failed: ' + JSON.stringify(r.exceptionDetails).slice(0, 300));
  return r.result ? r.result.value : undefined;
};
const key = async (code, type, keyText) => send('Input.dispatchKeyEvent', { type, code, key: keyText || code.replace('Key', '').replace('Digit', '').toLowerCase(), windowsVirtualKeyCode: 0 });
const mouse = async (type, x, y, button = 'left') => send('Input.dispatchMouseEvent', { type, x, y, button, clickCount: 1 });
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};
const waitFor = async (fn, timeoutMs, label) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await fn()) return true;
    await sleep(300);
  }
  console.log(`TIMEOUT waiting for: ${label}`);
  return false;
};

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 640, height: 400, deviceScaleFactor: 1, mobile: false });
await sleep(3000);

check('game mounts, __ember hook present', await ev(`!!window.__ember && !!window.__ember.state`));
check('starts in menu phase', (await ev(`window.__ember.state.phase`)) === 'menu', await ev(`window.__ember.state.phase`));

// Deploy with a REAL mouse click (a user gesture), so pointer lock can engage.
const btn = await ev(`(() => { const r = document.getElementById('play').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
await mouse('mousePressed', btn.x, btn.y);
await mouse('mouseReleased', btn.x, btn.y);
await sleep(800);
check('deploy starts buy phase', (await ev(`window.__ember.state.phase`)) === 'buy', await ev(`window.__ember.state.phase`));
check('buy panel auto-opens, pointer stays free to shop', await ev(`!document.getElementById('buy').hidden && !document.pointerLockElement`));

// Buy the Breacher 12 shotgun ($700, affordable from $800).
const bought = await ev(`(() => {
  const items = [...document.querySelectorAll('.buy-item')];
  const shotgun = items.find((b) => b.textContent.includes('Breacher'));
  if (!shotgun) return 'no shotgun button';
  shotgun.click();
  return window.__ember.state.money + '|' + window.__ember.weapons.state.current;
})()`);
check('buy shotgun: money 800 -> 100, weapon switches', bought === '100|shotgun', String(bought));

// Click Deploy in the buy panel: the pointer locks and the panel closes.
const deployBtn = await ev(`(() => { const r = document.getElementById('deploy').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
await mouse('mousePressed', deployBtn.x, deployBtn.y);
await mouse('mouseReleased', deployBtn.x, deployBtn.y);
await sleep(800);
check('Deploy locks the pointer and closes the buy panel', await ev(`!!document.pointerLockElement && document.getElementById('buy').hidden`));

// Mouse look: move the mouse while pointer-locked and confirm the yaw turns.
const yaw0 = await ev(`window.__ember.player.state.yaw`);
await mouse('mouseMoved', 320, 200);
await mouse('mouseMoved', 380, 200);
await mouse('mouseMoved', 440, 200);
await sleep(1500);
const yaw1 = await ev(`window.__ember.player.state.yaw`);
check('mouse look turns the view (pointer lock)', Math.abs(yaw1 - yaw0) > 0.01, `${yaw0.toFixed(3)} -> ${yaw1.toFixed(3)}`);

// Wait for the live phase (15 s buy phase, ~36 s wall at headless sim speed).
await waitFor(async () => (await ev(`window.__ember.state.phase`)) === 'live', 90000, 'live phase');
check('live phase reached', (await ev(`window.__ember.state.phase`)) === 'live');
check('round 1, score 0-0', await ev(`window.__ember.state.round === 1 && window.__ember.state.score.you === 0 && window.__ember.state.score.them === 0`));

// Movement: hold W for 3 s and confirm the player advances.
const pos0 = await ev(`window.__ember.player.state.body.position.toArray().map((v) => v.toFixed(2)).join(',')`);
await key('KeyW', 'rawKeyDown', 'w');
await sleep(3000);
await key('KeyW', 'keyUp', 'w');
const pos1 = await ev(`window.__ember.player.state.body.position.toArray().map((v) => v.toFixed(2)).join(',')`);
check('WASD movement moves the player', pos0 !== pos1, `${pos0} -> ${pos1}`);

// Switch back to the rifle (key 1) for the shooting test, then stage a clear
// line of sight down the mid gap: player at (0,0,4), a holding bot at (0,0,-8).
await key('Digit1', 'rawKeyDown', '1');
await key('Digit1', 'keyUp', '1');
await sleep(500);
check('weapon select key 1 -> rifle', (await ev(`window.__ember.weapons.state.current`)) === 'rifle');
await ev(`(() => {
  const e = window.__ember;
  e.player.state.body.position.set(0, 0, 4);
  e.player.state.yaw = 0; e.player.state.pitch = 0;
  const bot = e.bots.list[0];
  bot.body.position.set(0, 0, -8);
  bot.meshes.group.position.set(0, 0, -8);
  bot.mode = 'patrol';
  bot.holdUntil = e.state.time + 30;
  bot.yaw = 0; // face north, away from the player: no vision, no strafing.
})()`);
const ammo0 = await ev(`window.__ember.weapons.state.mag`);
const botHp0 = await ev(`window.__ember.bots.list[0].health`);
for (let i = 0; i < 8; i++) {
  await ev(`(() => {
    const p = window.__ember.player.state.body.position;
    const bot = window.__ember.bots.list[0];
    const t = bot.body.position;
    const dx = t.x - p.x, dz = t.z - p.z, dy = 1.1 - 1.6;
    window.__ember.player.state.yaw = Math.atan2(-dx, -dz);
    window.__ember.player.state.pitch = Math.atan2(dy, Math.hypot(dx, dz));
  })()`);
  // Hold the trigger ~400 ms: at ~4 fps a shorter press can fall between two
  // fixed steps and never register as held.
  await mouse('mousePressed', 320, 200);
  await sleep(400);
  await mouse('mouseReleased', 320, 200);
  await sleep(400);
}
const ammo1 = await ev(`window.__ember.weapons.state.mag`);
const botHp1 = await ev(`window.__ember.bots.list[0].health`);
const shotsHits = await ev(`window.__ember.state.shots + '/' + window.__ember.state.hits`);
check('mouse click fires (ammo decreases)', ammo1 < ammo0, `${ammo0} -> ${ammo1} (shots/hits ${shotsHits})`);
check('shots damage the aimed bot', botHp1 < botHp0, `${botHp0} -> ${botHp1} (shots/hits ${shotsHits})`);

// Bots shoot back: stage a second, live bot in the open with a clear lane to
// the player, force it to engage, and wait. (list[0] is dead from the
// shooting test above, so it cannot be the shooter.)
await ev(`(() => {
  const e = window.__ember;
  const bot = e.bots.list[1];
  bot.body.position.set(-3, 0, -6);
  bot.meshes.group.position.set(-3, 0, -6);
  bot.mode = 'engage';
  bot.lastSeen.copy(e.player.state.body.position);
  bot.lastSeenAt = e.state.time;
  bot.reactAt = e.state.time;
})()`);
const hp0 = await ev(`window.__ember.player.state.health`);
await sleep(10000);
const hp1 = await ev(`window.__ember.player.state.health`);
check('defender bots shoot back (player takes damage)', hp1 < hp0, `${hp0} -> ${hp1}`);

// Round end: fast-forward the live round clock to 99.5 s and wait for end.
await ev(`window.__ember.state.phaseTime = 99.5`);
await waitFor(async () => (await ev(`window.__ember.state.phase`)) === 'end', 15000, 'end phase');
check('round ends on timeout', (await ev(`window.__ember.state.phase`)) === 'end');
check('round-end banner shown', await ev(`!document.getElementById('overlay').hidden && document.getElementById('overlay-title').textContent.includes('ROUND')`));

// Next round: wait for the end phase (5 s sim) to roll into buy phase of round 2.
await waitFor(async () => (await ev(`window.__ember.state.phase`)) === 'buy', 30000, 'buy phase round 2');
check('next round starts (round 2 buy phase)', (await ev(`window.__ember.state.phase`)) === 'buy' && (await ev(`window.__ember.state.round`)) === 2, `round=${await ev(`window.__ember.state.round`)}`);

console.log('\npage errors:', errors.length ? JSON.stringify(errors, null, 2) : 'none');
const fails = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - fails}/${results.length} checks passed`);
ws.close();
process.exit(fails > 0 || errors.length > 0 ? 1 : 0);
