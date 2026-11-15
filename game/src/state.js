// The one state object: every system reads and writes this, and nothing else
// holds game state. main.js builds it and hands it to the systems.
import * as THREE from 'three';
import { mulberry32 } from './rng.js';

export const BUY_SECONDS = 15;
export const ROUND_SECONDS = 100;
export const END_SECONDS = 5;
export const PLANT_SECONDS = 3;
export const DEFUSE_SECONDS = 5;
export const BOMB_SECONDS = 35;
export const WIN_ROUNDS = 5;
export const MAX_ROUNDS = 9;

export function createState(seed) {
  return {
    seed,
    rng: mulberry32(seed),
    time: 0,
    tick: 0,
    phase: 'menu', // menu | buy | live | end | match
    phaseTime: 0,
    round: 1,
    score: { you: 0, them: 0 },
    money: 800,
    kills: 0,
    shots: 0,
    hits: 0,
    player: null,
    bots: [],
    bomb: {
      status: 'idle', // idle | planting | planted | defused | exploded
      site: null,
      plant: 0,
      defuse: 0,
      timer: BOMB_SECONDS,
      defuser: null,
      pos: new THREE.Vector3(),
    },
    weapons: null,
    grenades: [],
    feed: [],
    ghost: false,
    roundWinner: null,
    matchWinner: null,
    roundEndAt: 0,
  };
}
