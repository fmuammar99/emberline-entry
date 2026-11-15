// The economy: money earned by kills, plants and round wins, spent in the
// buy menu between rounds. Prices are the balance: a win streak buys the DMR,
// a loss still affords the shotgun.
import { WEAPONS, GRENADE, ARMOR } from './weapons.js';

export const KILL_REWARD = 300;
export const WIN_REWARD = 325;
export const LOSS_REWARD = 200;
export const PLANT_REWARD = 300;

export const CATALOG = [
  { id: 'smg', name: WEAPONS.smg.name, price: WEAPONS.smg.price, kind: 'weapon' },
  { id: 'shotgun', name: WEAPONS.shotgun.name, price: WEAPONS.shotgun.price, kind: 'weapon' },
  { id: 'dmr', name: WEAPONS.dmr.name, price: WEAPONS.dmr.price, kind: 'weapon' },
  { id: 'grenade', name: GRENADE.name, price: GRENADE.price, kind: 'grenade' },
  { id: 'armor', name: ARMOR.name, price: ARMOR.price, kind: 'armor' },
];

export function createEconomy(state) {
  return {
    balance() {
      return state.money;
    },
    earn(amount) {
      state.money += amount;
    },
    // Returns the item bought, or null when it cannot be bought.
    buy(item) {
      if (state.money < item.price) return null;
      if (item.kind === 'weapon' && state.weapons.state.owned[item.id]) return null;
      if (item.kind === 'grenade' && state.weapons.state.grenades >= GRENADE.max) return null;
      if (item.kind === 'armor' && state.player.state.armor >= 100) return null;
      state.money -= item.price;
      if (item.kind === 'weapon') state.weapons.buy(item.id);
      else if (item.kind === 'grenade') state.weapons.state.grenades += 1;
      else if (item.kind === 'armor') state.player.state.armor = 100;
      return item;
    },
  };
}
