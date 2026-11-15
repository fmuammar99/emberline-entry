// Procedural sound: every effect is synthesized with WebAudio, so the game
// ships no audio files and loads nothing over the network. The context is
// created on the first user gesture; calls before that are no-ops.
export function createAudio() {
  let context = null;
  let noiseBuffer = null;
  let master = null;

  function ensure() {
    if (context) return true;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = 0.5;
      master.connect(context.destination);
      const length = context.sampleRate;
      noiseBuffer = context.createBuffer(1, length, context.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
      return true;
    } catch {
      return false;
    }
  }

  function noise(when, duration, filterFreq, gainValue, type = 'lowpass') {
    const source = context.createBufferSource();
    source.buffer = noiseBuffer;
    source.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const gain = context.createGain();
    gain.gain.setValueAtTime(gainValue, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(when);
    source.stop(when + duration + 0.05);
  }

  function tone(when, freq, duration, gainValue, type = 'sine', slideTo = 0) {
    const osc = context.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, when);
    if (slideTo > 0) osc.frequency.exponentialRampToValueAtTime(slideTo, when + duration);
    const gain = context.createGain();
    gain.gain.setValueAtTime(gainValue, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(when);
    osc.stop(when + duration + 0.05);
  }

  return {
    unlock() {
      if (ensure() && context.state === 'suspended') context.resume();
    },
    shot(kind) {
      if (!ensure()) return;
      const now = context.currentTime;
      if (kind === 'shotgun') noise(now, 0.22, 900, 0.9);
      else if (kind === 'dmr') noise(now, 0.16, 1400, 0.8);
      else if (kind === 'smg') noise(now, 0.08, 2200, 0.5);
      else noise(now, 0.12, 1800, 0.65);
      tone(now, 160, 0.08, 0.25, 'square', 60);
    },
    enemyShot(distance) {
      if (!ensure()) return;
      const now = context.currentTime;
      const volume = Math.max(0.05, 0.5 - distance * 0.012);
      noise(now, 0.1, 1200, volume);
    },
    dryFire() {
      if (!ensure()) return;
      tone(context.currentTime, 900, 0.03, 0.15, 'square');
    },
    reload() {
      if (!ensure()) return;
      const now = context.currentTime;
      tone(now, 500, 0.05, 0.2, 'square');
      tone(now + 0.25, 350, 0.05, 0.2, 'square');
      tone(now + 1.5, 700, 0.06, 0.25, 'square');
    },
    hit(kill) {
      if (!ensure()) return;
      const now = context.currentTime;
      tone(now, kill ? 1400 : 1000, 0.06, 0.3, 'sine');
      if (kill) tone(now + 0.07, 1800, 0.09, 0.3, 'sine');
    },
    hurt() {
      if (!ensure()) return;
      const now = context.currentTime;
      tone(now, 220, 0.15, 0.35, 'sawtooth', 110);
    },
    beep(planted) {
      if (!ensure()) return;
      tone(context.currentTime, planted ? 1200 : 800, 0.07, 0.25, 'sine');
    },
    plantDone() {
      if (!ensure()) return;
      const now = context.currentTime;
      tone(now, 700, 0.1, 0.3, 'sine');
      tone(now + 0.12, 1050, 0.14, 0.3, 'sine');
    },
    explosion() {
      if (!ensure()) return;
      const now = context.currentTime;
      noise(now, 1.4, 300, 1.0);
      tone(now, 90, 1.1, 0.6, 'sine', 35);
    },
    grenadeThrow() {
      if (!ensure()) return;
      noise(context.currentTime, 0.15, 3000, 0.15, 'bandpass');
    },
    buy() {
      if (!ensure()) return;
      const now = context.currentTime;
      tone(now, 880, 0.07, 0.25, 'sine');
      tone(now + 0.08, 1320, 0.1, 0.25, 'sine');
    },
    roundWin() {
      if (!ensure()) return;
      const now = context.currentTime;
      [523, 659, 784].forEach((freq, i) => tone(now + i * 0.12, freq, 0.18, 0.3, 'sine'));
    },
    roundLose() {
      if (!ensure()) return;
      const now = context.currentTime;
      [392, 330, 262].forEach((freq, i) => tone(now + i * 0.14, freq, 0.2, 0.3, 'sine'));
    },
    click() {
      if (!ensure()) return;
      tone(context.currentTime, 600, 0.04, 0.2, 'square');
    },
  };
}
