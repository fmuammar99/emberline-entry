// The DOM HUD: crosshair, hit marker, health, ammo, timer, score, money, kill
// feed, objective, bomb status and the buy menu, plus the one overlay panel.
// It never touches the simulation; main.js pushes numbers in and reads the
// play / buy / restart callbacks out. Every setter caches its last value so a
// steady frame writes nothing to the DOM.
import { CATALOG } from './economy.js';

const COPY = {
  start: {
    title: 'EMBERLINE',
    copy: 'A dusk yard, two sites, four defenders. Plant the charge at A or B — or clear the site the loud way.',
    action: 'Click to deploy',
  },
  paused: {
    title: 'EMBERLINE',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
  roundEnd: { title: '', copy: '', action: '' },
  matchEnd: { title: '', copy: '', action: 'Play again' },
};

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const title = $('overlay-title');
  const copy = $('overlay-copy');
  const play = $('play');
  const keysList = document.querySelector('.keys');
  const buyPanel = $('buy');
  const buyList = $('buy-list');
  const buyMoney = $('buy-money');
  const vignette = $('vignette');
  const crosshair = $('crosshair');
  const hitmarker = $('hitmarker');
  const healthBar = $('health-fill');
  const healthNum = $('health-num');
  const armorNum = $('armor-num');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const weaponName = $('weapon-name');
  const moneyValue = $('money-value');
  const timerValue = $('timer-value');
  const timerLabel = $('timer-label');
  const scoreValue = $('score-value');
  const aliveValue = $('alive-value');
  const objective = $('objective');
  const bombStatus = $('bomb-status');
  const feedBox = $('feed');
  const plantBar = $('plant-fill');
  const plantWrap = $('plant');
  const plantLabel = $('plant-label');

  let lastAmmo = '';
  let lastHealth = '';
  let lastMoney = -1;
  let lastTimer = '';
  let lastScore = '';
  let lastAlive = '';
  let lastObjective = '';
  let lastBomb = '';
  let lastGap = -1;
  let hitTimer = 0;
  let vignetteTimer = 0;

  return {
    setAmmo(mag, reserve, name) {
      const key = `${mag}|${reserve}|${name}`;
      if (key === lastAmmo) return;
      lastAmmo = key;
      ammoMag.textContent = String(mag);
      ammoReserve.textContent = `/ ${reserve}`;
      weaponName.textContent = name;
      $('ammo').classList.toggle('empty', mag === 0);
    },
    setHealth(hp, armor) {
      const key = `${hp}|${armor}`;
      if (key === lastHealth) return;
      lastHealth = key;
      healthNum.textContent = String(Math.ceil(hp));
      armorNum.textContent = armor > 0 ? `+${Math.ceil(armor)}` : '';
      healthBar.style.width = `${Math.max(0, hp)}%`;
      healthBar.classList.toggle('low', hp <= 30);
    },
    setMoney(value) {
      if (value === lastMoney) return;
      lastMoney = value;
      moneyValue.textContent = `$${value}`;
      buyMoney.textContent = `$${value}`;
    },
    setTimer(seconds, phase) {
      const label = phase === 'buy' ? 'BUY' : phase === 'live' ? 'ROUND' : '';
      const text = `${label} ${Math.ceil(seconds)}`;
      if (text === lastTimer) return;
      lastTimer = text;
      timerValue.textContent = String(Math.ceil(seconds));
      timerLabel.textContent = label;
    },
    setScore(you, them, round) {
      const text = `${you} — ${them} · R${round}`;
      if (text === lastScore) return;
      lastScore = text;
      scoreValue.textContent = text;
    },
    setAlive(botsAlive, total) {
      const text = `${botsAlive}/${total} defenders up`;
      if (text === lastAlive) return;
      lastAlive = text;
      aliveValue.textContent = text;
    },
    setObjective(text) {
      if (text === lastObjective) return;
      lastObjective = text;
      objective.textContent = text;
    },
    setBomb(status, timer, plant, defuse) {
      const key = `${status}|${Math.ceil(timer)}|${Math.round(plant * 100)}|${Math.round(defuse * 100)}`;
      if (key === lastBomb) return;
      lastBomb = key;
      if (status === 'planted') {
        bombStatus.textContent = `CHARGE LIVE — ${Math.ceil(timer)}s`;
        bombStatus.classList.add('live');
      } else if (status === 'planting') {
        bombStatus.textContent = 'PLANTING…';
        bombStatus.classList.remove('live');
      } else if (status === 'defused') {
        bombStatus.textContent = 'CHARGE DEFUSED';
        bombStatus.classList.remove('live');
      } else if (status === 'exploded') {
        bombStatus.textContent = 'CHARGE DETONATED';
        bombStatus.classList.remove('live');
      } else {
        bombStatus.textContent = '';
        bombStatus.classList.remove('live');
      }
      if (status === 'planting' || (status === 'planted' && defuse > 0)) {
        plantWrap.hidden = false;
        plantLabel.textContent = status === 'planting' ? 'PLANTING' : 'DEFUSE IN PROGRESS';
        plantBar.style.width = `${Math.round((status === 'planting' ? plant : defuse) * 100)}%`;
      } else {
        plantWrap.hidden = true;
      }
    },
    setCrosshairGap(px) {
      const gap = Math.round(px);
      if (gap === lastGap) return;
      lastGap = gap;
      crosshair.style.setProperty('--gap', `${gap}px`);
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on', 'kill'), holdMs);
    },
    damageFlash(strength) {
      vignette.style.opacity = String(Math.min(0.85, strength));
      clearTimeout(vignetteTimer);
      vignetteTimer = setTimeout(() => {
        vignette.style.opacity = '0';
      }, 350);
    },
    feed(text) {
      const entry = document.createElement('div');
      entry.className = 'feed-entry';
      entry.textContent = text;
      feedBox.prepend(entry);
      while (feedBox.children.length > 5) feedBox.removeChild(feedBox.lastChild);
      setTimeout(() => entry.remove(), 6000);
    },
    showBuy(money, owned, grenades) {
      buyList.innerHTML = '';
      for (const item of CATALOG) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'buy-item';
        const ownedAlready = item.kind === 'weapon' ? owned[item.id]
          : item.kind === 'grenade' ? grenades >= 2
          : false;
        button.disabled = ownedAlready || money < item.price;
        button.innerHTML = `<b>${item.name}</b><span>$${item.price}</span><em>${ownedAlready ? 'owned' : money < item.price ? 'need more' : 'buy'}</em>`;
        button.addEventListener('click', () => this.buyClicked(item.id));
        buyList.appendChild(button);
      }
      buyPanel.hidden = false;
    },
    hideBuy() {
      buyPanel.hidden = true;
    },
    buyClicked() {},
    showOverlay(mode, data) {
      if (mode === 'roundEnd') {
        title.textContent = data.winner === 'you' ? 'ROUND WON' : 'ROUND LOST';
        copy.textContent = data.reason;
        play.textContent = '';
        play.hidden = true;
        keysList.hidden = true;
        overlay.classList.add('banner');
        overlay.hidden = false;
        return;
      }
      if (mode === 'matchEnd') {
        title.textContent = data.winner === 'you' ? 'MATCH WON' : 'MATCH LOST';
        copy.textContent = `Final score ${data.you} — ${data.them}. The yard is yours to run again.`;
        play.textContent = COPY.matchEnd.action;
        play.hidden = false;
        overlay.hidden = false;
        return;
      }
      const text = COPY[mode];
      title.textContent = text.title;
      copy.textContent = text.copy;
      play.textContent = text.action;
      play.hidden = false;
      keysList.hidden = false;
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() {
      overlay.classList.remove('banner');
      keysList.hidden = false;
      overlay.hidden = true;
    },
    onPlay(handler) {
      play.addEventListener('click', handler);
    },
  };
}
