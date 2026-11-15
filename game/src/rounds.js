// Rounds and the match: a buy phase, a live phase, a short end banner, then
// the next round. First to five rounds takes the match; after nine rounds the
// higher score wins, a tie plays on. The module owns the clock and the score;
// main.js owns the win conditions and calls endRound.
import { BUY_SECONDS, ROUND_SECONDS, END_SECONDS, WIN_ROUNDS, MAX_ROUNDS } from './state.js';
import { WIN_REWARD, LOSS_REWARD } from './economy.js';

export function createRounds(state, hooks) {
  function startMatch() {
    state.round = 1;
    state.score.you = 0;
    state.score.them = 0;
    state.phase = 'buy';
    state.phaseTime = 0;
    state.roundWinner = null;
    state.matchWinner = null;
    hooks.onPhase('buy');
  }

  function endRound(winner, reason) {
    if (state.phase !== 'live') return;
    state.roundWinner = winner;
    if (winner === 'you') {
      state.score.you += 1;
      state.money += WIN_REWARD;
    } else {
      state.score.them += 1;
      state.money += LOSS_REWARD;
    }
    state.phase = 'end';
    state.phaseTime = 0;
    hooks.onRoundEnd(winner, reason);
  }

  function nextRound() {
    const you = state.score.you;
    const them = state.score.them;
    const decided = you >= WIN_ROUNDS || them >= WIN_ROUNDS
      || (state.round >= MAX_ROUNDS && you !== them);
    if (decided) {
      state.matchWinner = you > them ? 'you' : 'them';
      state.phase = 'match';
      state.phaseTime = 0;
      hooks.onMatchEnd(state.matchWinner);
      return;
    }
    state.round += 1;
    state.roundWinner = null;
    state.phase = 'buy';
    state.phaseTime = 0;
    hooks.onPhase('buy');
  }

  function step(dt) {
    state.phaseTime += dt;
    if (state.phase === 'buy' && state.phaseTime >= BUY_SECONDS) {
      state.phase = 'live';
      state.phaseTime = 0;
      hooks.onPhase('live');
    } else if (state.phase === 'live') {
      if (state.phaseTime >= ROUND_SECONDS) endRound('them', 'time');
    } else if (state.phase === 'end' && state.phaseTime >= END_SECONDS) {
      nextRound();
    }
  }

  return {
    startMatch,
    endRound,
    step,
    timeLeft() {
      if (state.phase === 'buy') return Math.max(0, BUY_SECONDS - state.phaseTime);
      if (state.phase === 'live') return Math.max(0, ROUND_SECONDS - state.phaseTime);
      return 0;
    },
  };
}
