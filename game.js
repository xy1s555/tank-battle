'use strict';

/* =========================================================
   坦克大战 · Tank Battle
   A dependency-free HTML5 Canvas game.
   ========================================================= */

/* ---------- 常量 ---------- */
const CELL = 32;
const COLS = 13;
const ROWS = 13;
const FIELD = COLS * CELL;          // 416
const TILE = CELL / 2;              // 16
const TCOLS = COLS * 2;             // 26
const TROWS = ROWS * 2;             // 26
const TANK_SIZE = 26;
const BULLET_SIZE = 6;

const DIRS = {
  up:    { x: 0, y: -1, angle: 0 },
  right: { x: 1, y: 0, angle: Math.PI / 2 },
  down:  { x: 0, y: 1, angle: Math.PI },
  left:  { x: -1, y: 0, angle: -Math.PI / 2 },
};
const DIR_NAMES = ['up', 'right', 'down', 'left'];

const T = {
  EMPTY: 0,
  BRICK: 1,
  STEEL: 2,
  WATER: 3,
  GRASS: 4,
};

const PLAYER_SPAWN_CELL = { col: 4, row: 12 };
const ENEMY_SPAWN_CELLS = [
  { col: 0, row: 0 },
  { col: 6, row: 0 },
  { col: 12, row: 0 },
];

/* ---------- 关卡 ---------- */
const LEVELS = [
  {
    name: '钢铁前哨',
    total: 8,
    maxOnField: 3,
    pool: ['basic', 'basic', 'basic', 'basic'],
    map: [
      '.............',
      '..#..#..#..#.',
      '..#..#..#..#.',
      '..#..#..#..#.',
      '..#..#..#..#.',
      '..#..#..#..#.',
      '.............',
      '..#..#..#..#.',
      '..#..#..#..#.',
      '..#..#..#..#.',
      '....#####....',
      '....#####....',
      '.....#B#.....',
    ],
  },
  {
    name: '水域防线',
    total: 10,
    maxOnField: 4,
    pool: ['basic', 'basic', 'basic', 'fast', 'fast', 'power', 'armor'],
    map: [
      '.............',
      '.#.#.#.#.#.#.',
      '.#.#.#.#.#.#.',
      '....@...@....',
      '.##..~~~..##.',
      '.##..~~~..##.',
      '.....~~~.....',
      '.##..~~~..##.',
      '.##..~~~..##.',
      '....@...@....',
      '.............',
      '....#####....',
      '.....#B#.....',
    ],
  },
  {
    name: '丛林要塞',
    total: 12,
    maxOnField: 5,
    pool: ['basic', 'fast', 'fast', 'power', 'power', 'armor', 'armor'],
    map: [
      '.............',
      '.%%%.#.#.%%%.',
      '.%%%.#.#.%%%.',
      '......#.#....',
      '..##..###..##',
      '..##.......##',
      '..##..@@@..##',
      '..##.......##',
      '..##..###..##',
      '......#.#....',
      '.%%%.#.#.%%%.',
      '....#####....',
      '.....#B#.....',
    ],
  },
];

/* ---------- 敌人属性 ---------- */
const ENEMY_TYPES = {
  basic: {
    speed: 52,
    hp: 1,
    bulletSpeed: 220,
    score: 100,
    color: '#aab6c6',
    accent: '#5d6b7d',
  },
  fast: {
    speed: 94,
    hp: 1,
    bulletSpeed: 250,
    score: 200,
    color: '#f4c95d',
    accent: '#8a6a12',
  },
  power: {
    speed: 57,
    hp: 1,
    bulletSpeed: 340,
    score: 300,
    color: '#e879f9',
    accent: '#86198f',
  },
  armor: {
    speed: 46,
    hp: 3,
    bulletSpeed: 230,
    score: 400,
    color: '#5eead4',
    accent: '#0f766e',
  },
};

const POWERUPS = {
  shield: { glyph: '护', color: '#38bdf8' },
  star:   { glyph: '星', color: '#fbbf24' },
  life:   { glyph: '命', color: '#34d399' },
  bomb:   { glyph: '爆', color: '#f87171' },
};

/* ---------- DOM ---------- */
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const els = {
  score: document.getElementById('score'),
  highscore: document.getElementById('highscore'),
  level: document.getElementById('level'),
  enemies: document.getElementById('enemies'),
  lives: document.getElementById('lives'),
  stars: document.getElementById('stars'),
  overlay: document.getElementById('overlay'),
  banner: document.getElementById('banner'),
  pauseBtn: document.getElementById('pauseBtn'),
  muteBtn: document.getElementById('muteBtn'),
  fireBtn: document.getElementById('fireBtn'),
};

/* ---------- 状态 ---------- */
let state = 'menu'; // menu | playing | paused | levelclear | gameover | victory
let levelIndex = 0;
let score = 0;
let highScore = 0;
let lives = 3;
let grid = null;
let base = null;
let player = null;
let enemies = [];
let bullets = [];
let powerups = [];
let particles = [];
let rings = [];
let floaters = [];
let totalEnemies = 0;
let maxOnField = 4;
let levelPool = [];
let killed = 0;
let spawned = 0;
let spawnTimer = 0;
let respawnTimer = 0;
let endReason = null;
let endTimer = 0;
let shake = 0;
let flash = 0;
let time = 0;
let muted = false;
let overlayClearTimer = 0;
let lastTime = 0;
let dpr = 1;
let vignetteGradient = null;

/* ---------- 输入 ---------- */
const pressed = new Set();
let heldDirs = [];
let touchDirs = [];
let touchFiring = false;

/* =========================================================
   工具
   ========================================================= */
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const rand2 = (a, b) => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

function pad(n, len) {
  return String(Math.max(0, Math.floor(n))).padStart(len, '0');
}

function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function cellTopLeft(col, row, size = TANK_SIZE) {
  return {
    x: col * CELL + (CELL - size) / 2,
    y: row * CELL + (CELL - size) / 2,
  };
}

function rrect(x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/* =========================================================
   音效（WebAudio 合成，无外部资源）
   ========================================================= */
const sfx = {
  ctx: null,
  muted: false,

  init() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        this.ctx = new AC();
      } catch {
        return;
      }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  },

  get on() {
    return !!this.ctx && !this.muted;
  },

  tone(freq, dur, { type = 'square', vol = 0.045, endFreq = null, delay = 0 } = {}) {
    if (!this.on) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, freq), t0);
    if (endFreq) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t0 + dur);
    }
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur);
  },

  noise(dur, vol = 0.12, cutoff = 900) {
    if (!this.on) return;
    const c = this.ctx;
    const len = Math.max(1, Math.ceil(c.sampleRate * dur));
    const buffer = c.createBuffer(1, len, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    }
    const src = c.createBufferSource();
    src.buffer = buffer;
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const gain = c.createGain();
    gain.gain.value = vol;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(c.destination);
    src.start();
  },

  shoot(isPlayer) {
    this.tone(isPlayer ? 560 : 330, 0.07, {
      type: 'square',
      vol: 0.03,
      endFreq: isPlayer ? 190 : 120,
    });
  },

  brick() {
    this.noise(0.055, 0.09, 1800);
  },

  steel() {
    this.tone(1250, 0.05, { type: 'square', vol: 0.025, endFreq: 760 });
  },

  explosion(big = false) {
    this.noise(big ? 0.5 : 0.28, big ? 0.24 : 0.15, big ? 480 : 850);
    this.tone(big ? 85 : 140, big ? 0.4 : 0.22, {
      type: 'sawtooth',
      vol: big ? 0.09 : 0.06,
      endFreq: 38,
    });
  },

  powerup() {
    [523, 659, 784, 1046].forEach((f, i) => {
      this.tone(f, 0.1, { type: 'triangle', vol: 0.045, delay: i * 0.065 });
    });
  },

  pause() {
    this.tone(440, 0.08, { type: 'sine', vol: 0.04, endFreq: 360 });
  },

  levelClear() {
    [523, 659, 784, 1046, 1318].forEach((f, i) => {
      this.tone(f, 0.18, { type: 'square', vol: 0.035, delay: i * 0.11 });
    });
  },

  gameOver() {
    [392, 330, 262, 196].forEach((f, i) => {
      this.tone(f, 0.34, {
        type: 'sawtooth',
        vol: 0.045,
        endFreq: f * 0.88,
        delay: i * 0.18,
      });
    });
  },
};

/* =========================================================
   地图
   ========================================================= */
function parseMap(level) {
  grid = new Uint8Array(TCOLS * TROWS);
  base = null;

  for (let r = 0; r < ROWS; r++) {
    const line = level.map[r] || '';
    if (line.length !== COLS) {
      console.warn(`Map row ${r} has ${line.length} chars, expected ${COLS}.`);
    }
    for (let c = 0; c < COLS; c++) {
      const ch = line[c] || '.';
      let tile = T.EMPTY;

      if (ch === '#') tile = T.BRICK;
      else if (ch === '@') tile = T.STEEL;
      else if (ch === '~') tile = T.WATER;
      else if (ch === '%') tile = T.GRASS;
      else if (ch === 'B') {
        base = {
          x: c * CELL,
          y: r * CELL,
          w: CELL,
          h: CELL,
          destroyed: false,
        };
      }

      if (tile !== T.EMPTY) {
        for (let dy = 0; dy < 2; dy++) {
          for (let dx = 0; dx < 2; dx++) {
            grid[(r * 2 + dy) * TCOLS + (c * 2 + dx)] = tile;
          }
        }
      }
    }
  }

  if (!base) {
    base = {
      x: 6 * CELL,
      y: 12 * CELL,
      w: CELL,
      h: CELL,
      destroyed: false,
    };
  }
}

function tileAt(tx, ty) {
  if (tx < 0 || ty < 0 || tx >= TCOLS || ty >= TROWS) return -1;
  return grid[ty * TCOLS + tx];
}

function setTile(tx, ty, value) {
  if (tx < 0 || ty < 0 || tx >= TCOLS || ty >= TROWS) return;
  grid[ty * TCOLS + tx] = value;
}

function rectHitsSolidTile(x, y, w, h) {
  const x0 = Math.floor(x / TILE);
  const x1 = Math.floor((x + w - 0.001) / TILE);
  const y0 = Math.floor(y / TILE);
  const y1 = Math.floor((y + h - 0.001) / TILE);

  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const t = tileAt(tx, ty);
      if (t < 0) return true;
      if (t === T.BRICK || t === T.STEEL || t === T.WATER) return true;
    }
  }
  return false;
}

function rectHitsAnyTile(x, y, w, h) {
  const x0 = Math.floor(x / TILE);
  const x1 = Math.floor((x + w - 0.001) / TILE);
  const y0 = Math.floor(y / TILE);
  const y1 = Math.floor((y + h - 0.001) / TILE);

  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (tileAt(tx, ty) !== T.EMPTY) return true;
    }
  }
  return false;
}

/* =========================================================
   实体
   ========================================================= */
function createPlayer() {
  const pos = cellTopLeft(PLAYER_SPAWN_CELL.col, PLAYER_SPAWN_CELL.row);
  return {
    x: pos.x,
    y: pos.y,
    w: TANK_SIZE,
    h: TANK_SIZE,
    dir: 'up',
    speed: 108,
    cooldown: 0,
    spawnTimer: 1,
    spawnDuration: 1,
    invulnTimer: 2.5,
    alive: true,
    isPlayer: true,
    starLevel: 0,
    tread: 0,
  };
}

function createEnemy(type, spawnCell) {
  const stats = ENEMY_TYPES[type];
  const pos = cellTopLeft(spawnCell.col, spawnCell.row);
  return {
    x: pos.x,
    y: pos.y,
    w: TANK_SIZE,
    h: TANK_SIZE,
    dir: 'down',
    speed: stats.speed,
    cooldown: 0.4,
    spawnTimer: 1.1,
    spawnDuration: 1.1,
    invulnTimer: 1.1,
    alive: true,
    isPlayer: false,
    type,
    hp: stats.hp,
    maxHp: stats.hp,
    color: stats.color,
    accent: stats.accent,
    bulletSpeed: stats.bulletSpeed,
    aiTimer: 0.3 + Math.random() * 0.5,
    shootTimer: 0.8 + Math.random() * 1.2,
    tread: 0,
    hitFlash: 0,
  };
}

function createPowerup(kind, x, y) {
  return {
    kind,
    x,
    y,
    size: 24,
    life: 14,
    alive: true,
    color: POWERUPS[kind].color,
    glyph: POWERUPS[kind].glyph,
  };
}

function addParticle(x, y, vx, vy, life, size, color, gravity = 0) {
  particles.push({
    x,
    y,
    vx,
    vy,
    life,
    maxLife: life,
    size,
    color,
    gravity,
  });
}

function addFloater(x, y, text, color) {
  floaters.push({ x, y, text, color, life: 1, maxLife: 1 });
}

function spawnExplosion(x, y, scale = 1) {
  const colors = ['#fde68a', '#fbbf24', '#f97316', '#ef4444', '#fca5a5'];
  const count = Math.round(16 * scale);
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = (30 + Math.random() * 130) * scale;
    addParticle(
      x,
      y,
      Math.cos(a) * sp,
      Math.sin(a) * sp,
      0.35 + Math.random() * 0.45,
      2 + Math.random() * 3,
      pick(colors),
      110
    );
  }
  rings.push({
    x,
    y,
    r: 4,
    maxR: 26 * scale,
    life: 0.4,
    maxLife: 0.4,
    color: 'rgba(251, 191, 36, 0.85)',
  });
  flash = Math.min(0.35, flash + 0.1);
  shake = Math.min(1, shake + 0.16 * scale);
}

function spawnSparks(x, y, color, count = 5) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 25 + Math.random() * 90;
    addParticle(
      x,
      y,
      Math.cos(a) * sp,
      Math.sin(a) * sp,
      0.15 + Math.random() * 0.25,
      1.5 + Math.random() * 2,
      color,
      60
    );
  }
}

function spawnDebris(x, y) {
  for (let i = 0; i < 5; i++) {
    addParticle(
      x + (Math.random() - 0.5) * 10,
      y + (Math.random() - 0.5) * 10,
      (Math.random() - 0.5) * 90,
      -20 - Math.random() * 85,
      0.3 + Math.random() * 0.3,
      2 + Math.random() * 2,
      pick(['#9a5433', '#c26b3e', '#6b3a25']),
      280
    );
  }
}

/* =========================================================
   移动与碰撞
   ========================================================= */
function tankOverlapsRect(x, y, w, h, ignore) {
  if (
    player &&
    player.alive &&
    player !== ignore &&
    rectsOverlap(x, y, w, h, player.x, player.y, TANK_SIZE, TANK_SIZE)
  ) {
    return true;
  }
  for (const e of enemies) {
    if (
      e.alive &&
      e !== ignore &&
      rectsOverlap(x, y, w, h, e.x, e.y, TANK_SIZE, TANK_SIZE)
    ) {
      return true;
    }
  }
  return false;
}

function canTankBeAt(tank, x, y) {
  if (x < 0 || y < 0 || x + TANK_SIZE > FIELD || y + TANK_SIZE > FIELD) {
    return false;
  }
  if (rectHitsSolidTile(x, y, TANK_SIZE, TANK_SIZE)) return false;
  if (
    base &&
    !base.destroyed &&
    rectsOverlap(x, y, TANK_SIZE, TANK_SIZE, base.x, base.y, base.w, base.h)
  ) {
    return false;
  }
  if (tankOverlapsRect(x, y, TANK_SIZE, TANK_SIZE, tank)) return false;
  return true;
}

function moveTank(tank, dir, dt) {
  const d = DIRS[dir];
  const dist = tank.speed * dt;
  const nx = tank.x + d.x * dist;
  const ny = tank.y + d.y * dist;

  if (canTankBeAt(tank, nx, ny)) {
    tank.x = nx;
    tank.y = ny;
    tank.tread = (tank.tread || 0) + dist;
    return true;
  }

  // 转角辅助：前进被挡住时，沿垂直方向轻微滑动，帮助对准通道
  for (let step = 1; step <= 6; step++) {
    if (d.y !== 0) {
      // 纵向移动 → 横向微调
      for (const sign of [-1, 1]) {
        const tx = tank.x + sign * step;
        if (canTankBeAt(tank, tx, ny)) {
          tank.x = tx;
          tank.y = ny;
          tank.tread = (tank.tread || 0) + dist;
          return true;
        }
      }
    } else {
      // 横向移动 → 纵向微调
      for (const sign of [-1, 1]) {
        const ty = tank.y + sign * step;
        if (canTankBeAt(tank, nx, ty)) {
          tank.x = nx;
          tank.y = ty;
          tank.tread = (tank.tread || 0) + dist;
          return true;
        }
      }
    }
  }

  return false;
}

/* =========================================================
   射击
   ========================================================= */
function countBullets(tank) {
  let n = 0;
  for (const b of bullets) {
    if (b.alive && b.owner === tank) n++;
  }
  return n;
}

function playerBulletSpeed() {
  return [300, 350, 420][player ? player.starLevel : 0] || 300;
}

function playerReload() {
  return [0.42, 0.3, 0.22][player ? player.starLevel : 0] || 0.42;
}

function maxBulletsFor(tank) {
  if (!tank.isPlayer) return 1;
  return [1, 2, 2][player ? player.starLevel : 0] || 1;
}

function tryFire(tank) {
  if (!tank || !tank.alive || tank.cooldown > 0 || tank.spawnTimer > 0) {
    return false;
  }
  if (countBullets(tank) >= maxBulletsFor(tank)) return false;

  const d = DIRS[tank.dir];
  const cx = tank.x + TANK_SIZE / 2;
  const cy = tank.y + TANK_SIZE / 2;
  bullets.push({
    x: cx + d.x * (TANK_SIZE / 2 + 3) - BULLET_SIZE / 2,
    y: cy + d.y * (TANK_SIZE / 2 + 3) - BULLET_SIZE / 2,
    w: BULLET_SIZE,
    h: BULLET_SIZE,
    dir: tank.dir,
    speed: tank.isPlayer ? playerBulletSpeed() : tank.bulletSpeed,
    isPlayer: !!tank.isPlayer,
    owner: tank,
    alive: true,
  });

  tank.cooldown = tank.isPlayer ? playerReload() : 0.85 + Math.random() * 0.8;
  sfx.shoot(!!tank.isPlayer);
  return true;
}

/* =========================================================
   游戏流程
   ========================================================= */
function loadHighScore() {
  try {
    highScore = Number(localStorage.getItem('tank-battle-highscore')) || 0;
  } catch {
    highScore = 0;
  }
}

function saveHighScore() {
  try {
    localStorage.setItem('tank-battle-highscore', String(highScore));
  } catch {
    /* ignore */
  }
}

function loadMuted() {
  try {
    muted = localStorage.getItem('tank-battle-muted') === '1';
  } catch {
    muted = false;
  }
  sfx.muted = muted;
}

function updateHud() {
  els.score.textContent = pad(score, 6);
  els.highscore.textContent = pad(highScore, 6);
  els.level.textContent = `${Math.min(levelIndex + 1, LEVELS.length)} / ${LEVELS.length}`;
  els.enemies.textContent = String(Math.max(0, totalEnemies - killed));
  els.lives.textContent = `♥ ×${Math.max(0, lives)}`;
  const stars = player ? player.starLevel : 0;
  els.stars.textContent = '★'.repeat(stars) + '☆'.repeat(Math.max(0, 2 - stars));
  els.pauseBtn.disabled = !(state === 'playing' || state === 'paused');
  els.pauseBtn.textContent = state === 'paused' ? '继续' : '暂停';
  els.muteBtn.textContent = muted ? '音效：关' : '音效：开';
  els.muteBtn.classList.toggle('off', muted);
}

function addScore(n) {
  score += n;
  if (score > highScore) {
    highScore = score;
    saveHighScore();
  }
  updateHud();
}

function resetInputs() {
  pressed.clear();
  heldDirs = [];
  touchDirs = [];
  touchFiring = false;
  if (els.fireBtn) els.fireBtn.classList.remove('active');
  document.querySelectorAll('.dpad-btn.active').forEach((b) => b.classList.remove('active'));
}

function startGame() {
  sfx.init();
  resetInputs();
  state = 'playing';
  score = 0;
  lives = 3;
  levelIndex = 0;
  hideOverlay();
  loadLevel(0);
  banner('第 1 关');
  updateHud();
}

function loadLevel(index, demo = false) {
  levelIndex = index;
  const lv = LEVELS[index];
  totalEnemies = lv.total;
  maxOnField = lv.maxOnField;
  levelPool = lv.pool.slice();

  parseMap(lv);
  enemies = [];
  bullets = [];
  powerups = [];
  particles = [];
  rings = [];
  floaters = [];
  killed = 0;
  spawned = 0;
  spawnTimer = demo ? Infinity : 0.9;
  respawnTimer = 0;
  endReason = null;
  endTimer = 0;
  shake = 0;
  flash = 0;
  player = demo ? null : createPlayer();
  updateHud();
}

function nextLevel() {
  const next = levelIndex + 1;
  if (next >= LEVELS.length) {
    state = 'victory';
    showVictory();
    updateHud();
    return;
  }
  loadLevel(next);
  state = 'playing';
  hideOverlay();
  banner(`第 ${next + 1} 关`);
  updateHud();
}

function pauseGame() {
  if (state !== 'playing') return;
  state = 'paused';
  resetInputs();
  showPaused();
  updateHud();
  sfx.pause();
}

function resumeGame() {
  if (state !== 'paused') return;
  state = 'playing';
  hideOverlay();
  updateHud();
  lastTime = performance.now();
}

function triggerEnd(reason) {
  if (endReason) return;
  endReason = reason;
  endTimer = 1.8;
}

function endGame(reason) {
  state = 'gameover';
  resetInputs();
  saveHighScore();
  showGameOver(reason);
  updateHud();
  sfx.gameOver();
}

function checkLevelClear() {
  if (endReason || killed < totalEnemies) return;
  for (const e of enemies) {
    if (e.alive) return;
  }

  addScore(500 + levelIndex * 250);
  if (levelIndex >= LEVELS.length - 1) {
    state = 'victory';
    showVictory();
  } else {
    state = 'levelclear';
    showLevelClear();
  }
  updateHud();
  sfx.levelClear();
}

/* =========================================================
   更新逻辑
   ========================================================= */
function currentDir() {
  if (touchDirs.length) return touchDirs[touchDirs.length - 1];
  if (heldDirs.length) return heldDirs[heldDirs.length - 1];
  return null;
}

function isFiring() {
  return touchFiring || pressed.has('Space') || pressed.has('KeyJ');
}

function updatePlayer(dt) {
  if (!player) return;

  player.cooldown = Math.max(0, player.cooldown - dt);
  if (player.invulnTimer > 0) player.invulnTimer = Math.max(0, player.invulnTimer - dt);
  if (!player.alive) return;

  if (player.spawnTimer > 0) {
    player.spawnTimer = Math.max(0, player.spawnTimer - dt);
    return;
  }

  const dir = currentDir();
  if (dir) {
    player.dir = dir;
    moveTank(player, dir, dt);
  }
  if (isFiring()) tryFire(player);
}

function tryRespawn() {
  if (lives <= 0 || !player) return;
  const pos = cellTopLeft(PLAYER_SPAWN_CELL.col, PLAYER_SPAWN_CELL.row);
  if (
    tankOverlapsRect(pos.x, pos.y, TANK_SIZE, TANK_SIZE, player) ||
    rectHitsSolidTile(pos.x, pos.y, TANK_SIZE, TANK_SIZE)
  ) {
    respawnTimer = 0.4;
    return;
  }
  Object.assign(player, createPlayer());
  updateHud();
}

function hitPlayer() {
  if (!player || !player.alive || player.invulnTimer > 0 || player.spawnTimer > 0) {
    return;
  }
  player.alive = false;
  player.spawnTimer = 0;
  lives = Math.max(0, lives - 1);
  player.starLevel = 0;
  bullets = bullets.filter((b) => !b.isPlayer);
  spawnExplosion(player.x + TANK_SIZE / 2, player.y + TANK_SIZE / 2, 1.3);
  sfx.explosion(false);
  updateHud();

  if (lives > 0) {
    respawnTimer = 1.5;
  } else {
    triggerEnd('lives');
  }
}

function killEnemy(enemy, quiet = false) {
  if (!enemy || !enemy.alive) return;
  enemy.alive = false;
  killed++;
  addScore(ENEMY_TYPES[enemy.type].score);
  const cx = enemy.x + TANK_SIZE / 2;
  const cy = enemy.y + TANK_SIZE / 2;
  spawnExplosion(cx, cy, 1.15);
  if (!quiet) sfx.explosion(false);
  if (!quiet && Math.random() < 0.18) dropPowerupAt(cx, cy);
  updateHud();
}

function hitEnemy(enemy) {
  enemy.hp--;
  enemy.hitFlash = 0.12;
  if (enemy.hp <= 0) {
    killEnemy(enemy);
  } else {
    spawnSparks(
      enemy.x + TANK_SIZE / 2,
      enemy.y + TANK_SIZE / 2,
      '#fda4af',
      4
    );
    sfx.steel();
  }
}

function triggerBomb() {
  flash = 0.55;
  shake = 1;
  rings.push({
    x: FIELD / 2,
    y: FIELD / 2,
    r: 10,
    maxR: FIELD * 0.75,
    life: 0.5,
    maxLife: 0.5,
    color: 'rgba(248, 113, 113, 0.9)',
  });
  for (const e of enemies) {
    if (e.alive) killEnemy(e, true);
  }
  sfx.explosion(true);
  addFloater(FIELD / 2, FIELD / 2 - 30, '全屏轰炸！', '#f87171');
}

function collectPowerup(p) {
  if (!p.alive) return;
  p.alive = false;
  sfx.powerup();
  addScore(300);

  const cx = p.x + p.size / 2;
  const cy = p.y + p.size / 2;

  switch (p.kind) {
    case 'shield':
      player.invulnTimer = Math.max(player.invulnTimer, 8);
      addFloater(cx, cy, '护盾 +8s', '#38bdf8');
      break;
    case 'star':
      if (player.starLevel < 2) {
        player.starLevel++;
        addFloater(cx, cy, '火力升级', '#fbbf24');
      } else {
        addScore(500);
        addFloater(cx, cy, '+500', '#fbbf24');
      }
      break;
    case 'life':
      lives++;
      addFloater(cx, cy, '生命 +1', '#34d399');
      break;
    case 'bomb':
      triggerBomb();
      break;
    default:
      break;
  }
  updateHud();
}

function updatePowerups(dt) {
  for (const p of powerups) {
    if (!p.alive) continue;
    p.life -= dt;
    if (p.life <= 0) {
      p.alive = false;
      continue;
    }
    if (
      player &&
      player.alive &&
      player.spawnTimer <= 0 &&
      rectsOverlap(p.x, p.y, p.size, p.size, player.x, player.y, TANK_SIZE, TANK_SIZE)
    ) {
      collectPowerup(p);
    }
  }
  powerups = powerups.filter((p) => p.alive);
}

function findPowerupSpot() {
  for (let i = 0; i < 80; i++) {
    const col = 1 + Math.floor(Math.random() * (COLS - 2));
    const row = 1 + Math.floor(Math.random() * (ROWS - 2));
    const x = col * CELL + 4;
    const y = row * CELL + 4;
    if (rectHitsAnyTile(x, y, 24, 24)) continue;
    if (base && rectsOverlap(x, y, 24, 24, base.x, base.y, base.w, base.h)) continue;
    if (tankOverlapsRect(x, y, 24, 24, null)) continue;
    return { x, y };
  }
  return null;
}

function dropPowerupAt() {
  if (powerups.filter((p) => p.alive).length >= 2) return;
  const spot = findPowerupSpot();
  if (!spot) return;
  const kind = pick([
    'star', 'star', 'star',
    'shield', 'shield',
    'life',
    'bomb',
  ]);
  powerups.push(createPowerup(kind, spot.x, spot.y));
}

function chooseEnemyDir(enemy, avoidDir = null) {
  const targets = [];
  if (base && !base.destroyed) {
    targets.push({ x: base.x + CELL / 2, y: base.y + CELL / 2 });
  }
  if (player && player.alive) {
    targets.push({ x: player.x + TANK_SIZE / 2, y: player.y + TANK_SIZE / 2 });
  }
  if (targets.length === 0) {
    enemy.dir = pick(DIR_NAMES);
    return;
  }

  let target = targets[0];
  if (targets.length > 1 && Math.random() < 0.35) target = targets[1];

  const cx = enemy.x + TANK_SIZE / 2;
  const cy = enemy.y + TANK_SIZE / 2;
  const dx = target.x - cx;
  const dy = target.y - cy;
  const options = [];
  if (Math.abs(dx) > 20) options.push(dx > 0 ? 'right' : 'left');
  if (Math.abs(dy) > 20) options.push(dy > 0 ? 'down' : 'up');

  let dir;
  if (options.length && Math.random() < 0.8) {
    dir = pick(options);
  } else {
    dir = pick(DIR_NAMES);
  }

  if (dir === avoidDir && Math.random() < 0.85) {
    dir = pick(DIR_NAMES.filter((d) => d !== avoidDir));
  }
  enemy.dir = dir;
}

function aimAtTarget(enemy) {
  const targets = [];
  if (player && player.alive) {
    targets.push({
      x: player.x + TANK_SIZE / 2,
      y: player.y + TANK_SIZE / 2,
    });
  }

  const cx = enemy.x + TANK_SIZE / 2;
  const cy = enemy.y + TANK_SIZE / 2;

  // 基地只在敌人靠近时才成为瞄准目标，避免开局远程狙击
  if (base && !base.destroyed) {
    const bx = base.x + CELL / 2;
    const by = base.y + CELL / 2;
    if (Math.hypot(bx - cx, by - cy) < CELL * 5) {
      targets.push({ x: bx, y: by });
    }
  }

  for (const t of targets) {
    if (Math.abs(cx - t.x) < 22) {
      enemy.dir = t.y < cy ? 'up' : 'down';
      return true;
    }
    if (Math.abs(cy - t.y) < 22) {
      enemy.dir = t.x < cx ? 'left' : 'right';
      return true;
    }
  }
  return false;
}

function updateEnemies(dt) {
  for (const e of enemies) {
    if (!e.alive) continue;

    e.cooldown = Math.max(0, e.cooldown - dt);
    if (e.invulnTimer > 0) e.invulnTimer = Math.max(0, e.invulnTimer - dt);
    if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt);

    if (e.spawnTimer > 0) {
      e.spawnTimer = Math.max(0, e.spawnTimer - dt);
      continue;
    }

    e.aiTimer -= dt;
    if (e.aiTimer <= 0) {
      chooseEnemyDir(e);
      e.aiTimer = 0.45 + Math.random() * 1.4;
    }

    const moved = moveTank(e, e.dir, dt);
    if (!moved) {
      chooseEnemyDir(e, e.dir);
      e.aiTimer = 0.3 + Math.random() * 0.6;
    }

    e.shootTimer -= dt;
    if (e.shootTimer <= 0) {
      e.shootTimer = 0.8 + Math.random() * 1.4;
      if (aimAtTarget(e)) {
        tryFire(e);
      } else if (Math.random() < 0.5) {
        tryFire(e);
      }
    }
  }
}

function pickSpawnPoint() {
  const free = ENEMY_SPAWN_CELLS.filter((cell) => {
    const pos = cellTopLeft(cell.col, cell.row);
    return !tankOverlapsRect(pos.x, pos.y, TANK_SIZE, TANK_SIZE, null);
  });
  return free.length ? pick(free) : null;
}

function updateSpawning(dt) {
  if (endReason) return;
  if (spawned >= totalEnemies) return;

  let aliveCount = 0;
  for (const e of enemies) {
    if (e.alive) aliveCount++;
  }
  if (aliveCount >= maxOnField) return;

  spawnTimer -= dt;
  if (spawnTimer > 0) return;

  const point = pickSpawnPoint();
  if (!point) {
    spawnTimer = 0.4;
    return;
  }

  const type = pick(levelPool);
  enemies.push(createEnemy(type, point));
  spawned++;
  spawnTimer = Math.max(1.2, 2.3 - levelIndex * 0.25) + Math.random() * 0.8;

  const cx = point.col * CELL + CELL / 2;
  const cy = point.row * CELL + CELL / 2;
  rings.push({
    x: cx,
    y: cy,
    r: 2,
    maxR: 20,
    life: 0.5,
    maxLife: 0.5,
    color: 'rgba(125, 211, 252, 0.8)',
  });
  updateHud();
}

function breakPairAt(tx, ty, dir) {
  const cells = [];
  if (dir === 'up' || dir === 'down') {
    const pairX = Math.floor(tx / 2) * 2;
    cells.push([pairX, ty], [pairX + 1, ty]);
  } else {
    const pairY = Math.floor(ty / 2) * 2;
    cells.push([tx, pairY], [tx, pairY + 1]);
  }

  for (const [x, y] of cells) {
    if (tileAt(x, y) === T.BRICK) {
      setTile(x, y, T.EMPTY);
      spawnDebris(x * TILE + TILE / 2, y * TILE + TILE / 2);
    }
  }
}

function breakSteelPair(tx, ty, dir) {
  const cells = [];
  if (dir === 'up' || dir === 'down') {
    const pairX = Math.floor(tx / 2) * 2;
    cells.push([pairX, ty], [pairX + 1, ty]);
  } else {
    const pairY = Math.floor(ty / 2) * 2;
    cells.push([tx, pairY], [tx, pairY + 1]);
  }

  for (const [x, y] of cells) {
    if (tileAt(x, y) === T.STEEL) {
      setTile(x, y, T.EMPTY);
      spawnSparks(x * TILE + TILE / 2, y * TILE + TILE / 2, '#cbd5e1', 4);
    }
  }
}

function resolveBulletTerrain(b) {
  const x0 = Math.floor(b.x / TILE);
  const x1 = Math.floor((b.x + b.w - 0.001) / TILE);
  const y0 = Math.floor(b.y / TILE);
  const y1 = Math.floor((b.y + b.h - 0.001) / TILE);
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;

  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const t = tileAt(tx, ty);
      if (t !== T.BRICK && t !== T.STEEL) continue;

      b.alive = false;

      if (t === T.BRICK) {
        breakPairAt(tx, ty, b.dir);
        sfx.brick();
      } else if (b.isPlayer && player && player.starLevel >= 2) {
        breakSteelPair(tx, ty, b.dir);
        sfx.brick();
      } else {
        spawnSparks(cx, cy, '#cbd5e1', 5);
        sfx.steel();
      }
      return true;
    }
  }
  return false;
}

function resolveBulletTank(b) {
  if (b.isPlayer) {
    for (const e of enemies) {
      if (!e.alive) continue;
      if (!rectsOverlap(b.x, b.y, b.w, b.h, e.x, e.y, TANK_SIZE, TANK_SIZE)) {
        continue;
      }
      b.alive = false;
      if (e.spawnTimer > 0 || e.invulnTimer > 0) {
        spawnSparks(b.x + b.w / 2, b.y + b.h / 2, '#7dd3fc', 4);
      } else {
        hitEnemy(e);
      }
      return true;
    }
  } else if (player && player.alive) {
    if (!rectsOverlap(b.x, b.y, b.w, b.h, player.x, player.y, TANK_SIZE, TANK_SIZE)) {
      return false;
    }
    b.alive = false;
    if (player.spawnTimer > 0 || player.invulnTimer > 0) {
      spawnSparks(b.x + b.w / 2, b.y + b.h / 2, '#7dd3fc', 4);
    } else {
      hitPlayer();
    }
    return true;
  }
  return false;
}

function destroyBase() {
  if (!base || base.destroyed) return;
  base.destroyed = true;
  spawnExplosion(base.x + CELL / 2, base.y + CELL / 2, 2);
  flash = 0.5;
  shake = 1;
  sfx.explosion(true);
  triggerEnd('base');
}

function resolveBullet(b) {
  // 出界
  if (b.x < -b.w || b.y < -b.h || b.x > FIELD || b.y > FIELD) {
    b.alive = false;
    return;
  }

  // 基地
  if (
    base &&
    !base.destroyed &&
    rectsOverlap(b.x, b.y, b.w, b.h, base.x, base.y, base.w, base.h)
  ) {
    b.alive = false;
    destroyBase();
    return;
  }

  if (resolveBulletTerrain(b)) return;
  resolveBulletTank(b);
}

function updateBullets(dt) {
  for (const b of bullets) {
    if (!b.alive) continue;
    const d = DIRS[b.dir];
    const total = b.speed * dt;
    const steps = Math.max(1, Math.ceil(total / 6));
    const step = total / steps;

    for (let i = 0; i < steps && b.alive; i++) {
      b.x += d.x * step;
      b.y += d.y * step;
      resolveBullet(b);
    }
  }

  // 玩家子弹可以打掉敌方子弹
  for (let i = 0; i < bullets.length; i++) {
    const a = bullets[i];
    if (!a.alive) continue;
    for (let j = i + 1; j < bullets.length; j++) {
      const b = bullets[j];
      if (!b.alive || a.isPlayer === b.isPlayer) continue;
      if (rectsOverlap(a.x, a.y, a.w, a.h, b.x, b.y, b.w, b.h)) {
        a.alive = false;
        b.alive = false;
        spawnSparks((a.x + b.x) / 2 + 3, (a.y + b.y) / 2 + 3, '#fde68a', 4);
        sfx.steel();
        break;
      }
    }
  }

  bullets = bullets.filter((b) => b.alive);
}

function updateEffects(dt) {
  for (const p of particles) {
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += (p.gravity || 0) * dt;
    p.vx *= Math.pow(0.35, dt);
  }
  particles = particles.filter((p) => p.life > 0);

  for (const r of rings) r.life -= dt;
  rings = rings.filter((r) => r.life > 0);

  for (const f of floaters) f.life -= dt;
  floaters = floaters.filter((f) => f.life > 0);

  shake = Math.max(0, shake - dt * 2.5);
  flash = Math.max(0, flash - dt * 2.2);
}

function update(dt) {
  updatePlayer(dt);

  if (respawnTimer > 0) {
    respawnTimer -= dt;
    if (respawnTimer <= 0) tryRespawn();
  }

  updateEnemies(dt);
  updateBullets(dt);
  updatePowerups(dt);
  updateEffects(dt);
  updateSpawning(dt);

  if (endReason) {
    endTimer -= dt;
    if (endTimer <= 0) {
      endGame(endReason);
      return;
    }
  } else if (state === 'playing') {
    checkLevelClear();
  }
}

function updateAmbient(dt) {
  if (state === 'paused') return;
  updateEffects(dt);
}

/* =========================================================
   渲染
   ========================================================= */
function setupCanvas() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(FIELD * dpr);
  canvas.height = Math.round(FIELD * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  vignetteGradient = ctx.createRadialGradient(
    FIELD / 2, FIELD / 2, FIELD * 0.3,
    FIELD / 2, FIELD / 2, FIELD * 0.74
  );
  vignetteGradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vignetteGradient.addColorStop(1, 'rgba(0, 0, 0, 0.45)');
}

function drawBackground() {
  ctx.fillStyle = '#070c12';
  ctx.fillRect(0, 0, FIELD, FIELD);

  ctx.fillStyle = 'rgba(148, 163, 184, 0.07)';
  for (let y = CELL / 2; y < FIELD; y += CELL) {
    for (let x = CELL / 2; x < FIELD; x += CELL) {
      ctx.fillRect(x, y, 1.2, 1.2);
    }
  }
}

function drawBrickTile(x, y, tx, ty) {
  ctx.fillStyle = '#4a2416';
  ctx.fillRect(x, y, TILE, TILE);

  ctx.fillStyle = (tx + ty) % 2 ? '#9a5433' : '#a55b37';
  ctx.fillRect(x + 1, y + 1, TILE - 2, 6);
  ctx.fillRect(x + 1, y + 9, 6, 6);
  ctx.fillRect(x + 9, y + 9, 6, 6);

  ctx.fillStyle = 'rgba(255, 196, 145, 0.16)';
  ctx.fillRect(x + 1, y + 1, TILE - 2, 1);
  ctx.fillRect(x + 1, y + 9, 6, 1);
  ctx.fillRect(x + 9, y + 9, 6, 1);
}

function drawSteelTile(x, y) {
  ctx.fillStyle = '#2f3844';
  ctx.fillRect(x, y, TILE, TILE);
  ctx.fillStyle = '#9aa8b8';
  ctx.fillRect(x + 1, y + 1, TILE - 2, TILE - 2);
  ctx.fillStyle = '#cbd5e1';
  ctx.fillRect(x + 2, y + 2, TILE - 4, 2);
  ctx.fillRect(x + 2, y + 2, 2, TILE - 4);
  ctx.fillStyle = '#5b6675';
  ctx.fillRect(x + 2, y + TILE - 4, TILE - 4, 2);
  ctx.fillRect(x + TILE - 4, y + 2, 2, TILE - 4);
  ctx.fillStyle = '#4a5563';
  ctx.fillRect(x + 3, y + 3, 2, 2);
  ctx.fillRect(x + TILE - 5, y + 3, 2, 2);
  ctx.fillRect(x + 3, y + TILE - 5, 2, 2);
  ctx.fillRect(x + TILE - 5, y + TILE - 5, 2, 2);
}

function drawWaterTile(x, y, tx, ty) {
  ctx.fillStyle = '#082e4a';
  ctx.fillRect(x, y, TILE, TILE);

  const phase = time * 2.4 + (tx + ty) * 0.7;
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
  ctx.lineWidth = 1;

  for (let i = 0; i < 2; i++) {
    const yy = y + 5 + i * 6 + Math.sin(phase + i * 1.6) * 1.6;
    ctx.beginPath();
    ctx.moveTo(x, yy);
    ctx.quadraticCurveTo(x + 4, yy - 2, x + 8, yy);
    ctx.quadraticCurveTo(x + 12, yy + 2, x + TILE, yy);
    ctx.stroke();
  }

  ctx.fillStyle = 'rgba(125, 211, 252, 0.12)';
  ctx.fillRect(x, y, TILE, 1);
}

function drawGrassTile(x, y, tx, ty) {
  ctx.fillStyle = 'rgba(12, 51, 31, 0.93)';
  ctx.fillRect(x, y, TILE, TILE);

  for (let i = 0; i < 3; i++) {
    const rx = x + 2 + rand2(tx * 3 + i, ty * 5 + i) * 11;
    const ry = y + 4 + rand2(tx * 7 + i, ty * 11 + i) * 9;
    ctx.fillStyle = i % 2 ? '#15803d' : '#166534';
    ctx.fillRect(rx, ry, 2, 5);
    ctx.fillStyle = 'rgba(134, 239, 172, 0.75)';
    ctx.fillRect(rx, ry, 2, 2);
  }
}

function drawTerrain(grassPass) {
  if (!grid) return;

  for (let ty = 0; ty < TROWS; ty++) {
    for (let tx = 0; tx < TCOLS; tx++) {
      const tile = grid[ty * TCOLS + tx];
      if (tile === T.EMPTY) continue;

      if (grassPass) {
        if (tile === T.GRASS) drawGrassTile(tx * TILE, ty * TILE, tx, ty);
        continue;
      }

      if (tile === T.GRASS) continue;

      const x = tx * TILE;
      const y = ty * TILE;
      if (tile === T.BRICK) drawBrickTile(x, y, tx, ty);
      else if (tile === T.STEEL) drawSteelTile(x, y);
      else if (tile === T.WATER) drawWaterTile(x, y, tx, ty);
    }
  }
}

function drawBase() {
  if (!base) return;
  const x = base.x;
  const y = base.y;

  if (base.destroyed) {
    ctx.fillStyle = '#141b24';
    rrect(x + 1, y + 1, CELL - 2, CELL - 2, 5);
    ctx.fill();

    ctx.fillStyle = '#39424f';
    ctx.fillRect(x + 6, y + 16, 9, 7);
    ctx.fillRect(x + 18, y + 11, 7, 12);
    ctx.fillRect(x + 11, y + 7, 6, 6);

    ctx.fillStyle = '#1f2731';
    ctx.fillRect(x + 4, y + 24, 24, 3);

    ctx.strokeStyle = 'rgba(248, 113, 113, 0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 9, y + 9);
    ctx.lineTo(x + 23, y + 23);
    ctx.moveTo(x + 23, y + 9);
    ctx.lineTo(x + 9, y + 23);
    ctx.stroke();
    return;
  }

  ctx.fillStyle = '#101820';
  rrect(x + 1, y + 1, CELL - 2, CELL - 2, 5);
  ctx.fill();
  ctx.strokeStyle = 'rgba(251, 191, 36, 0.28)';
  ctx.lineWidth = 1;
  rrect(x + 1.5, y + 1.5, CELL - 3, CELL - 3, 5);
  ctx.stroke();

  const cx = x + CELL / 2;
  const cy = y + CELL / 2;

  // 底座圆盘
  ctx.fillStyle = '#0d141c';
  ctx.beginPath();
  ctx.arc(cx, cy, 14.5, 0, Math.PI * 2);
  ctx.fill();

  const ringGlow = 0.35 + 0.15 * Math.sin(time * 2.4);
  ctx.strokeStyle = `rgba(251, 191, 36, ${ringGlow})`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, 14, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = 'rgba(127, 29, 29, 0.5)';
  ctx.beginPath();
  ctx.arc(cx, cy + 1, 11, 0, Math.PI * 2);
  ctx.fill();

  // 金鹰徽章
  ctx.save();
  ctx.translate(cx, y + 15);
  ctx.shadowColor = 'rgba(251, 191, 36, 0.6)';
  ctx.shadowBlur = 7;
  ctx.fillStyle = '#fbbf24';
  ctx.beginPath();
  ctx.moveTo(0, -8);       // 头顶
  ctx.lineTo(2.6, -5);
  ctx.lineTo(1.8, -3.8);
  ctx.lineTo(7.5, -5.2);   // 右翼上扬
  ctx.lineTo(11, -2.2);
  ctx.lineTo(5, -0.6);
  ctx.lineTo(10.5, 2);     // 右侧羽尖
  ctx.lineTo(3.6, 2.4);
  ctx.lineTo(2.8, 8);      // 身体右侧
  ctx.lineTo(0.9, 11.5);   // 尾羽
  ctx.lineTo(-0.9, 11.5);
  ctx.lineTo(-2.8, 8);
  ctx.lineTo(-3.6, 2.4);
  ctx.lineTo(-10.5, 2);    // 左侧羽尖
  ctx.lineTo(-5, -0.6);
  ctx.lineTo(-11, -2.2);
  ctx.lineTo(-7.5, -5.2);  // 左翼上扬
  ctx.lineTo(-1.8, -3.8);
  ctx.lineTo(-2.6, -5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // 鹰眼
  ctx.fillStyle = '#111820';
  ctx.fillRect(cx - 2, y + 9, 1.5, 1.5);
  ctx.fillRect(cx + 0.7, y + 9, 1.5, 1.5);

  // 基座
  ctx.fillStyle = 'rgba(251, 191, 36, 0.3)';
  ctx.fillRect(x + 9, y + 27, 14, 1.5);
}

function drawSpawnEffect(tank) {
  const cx = tank.x + TANK_SIZE / 2;
  const cy = tank.y + TANK_SIZE / 2;
  const progress = 1 - tank.spawnTimer / tank.spawnDuration;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(time * 7);
  ctx.strokeStyle = `rgba(125, 211, 252, ${0.35 + 0.55 * (1 - progress)})`;
  ctx.lineWidth = 2;
  for (let i = 0; i < 2; i++) {
    ctx.rotate(Math.PI / 4);
    ctx.strokeRect(-11, -11, 22, 22);
  }
  ctx.rotate(-time * 3);
  ctx.strokeStyle = 'rgba(251, 191, 36, 0.75)';
  ctx.beginPath();
  ctx.arc(0, 0, 4 + progress * 15, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawTank(tank) {
  const cx = tank.x + TANK_SIZE / 2;
  const cy = tank.y + TANK_SIZE / 2;
  const isPlayer = tank.isPlayer;
  const body = isPlayer ? '#f6c445' : tank.color;
  const dark = isPlayer ? '#7c5200' : tank.accent;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(DIRS[tank.dir].angle);

  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  rrect(-13, -12, 26, 25, 5);
  ctx.fill();

  ctx.fillStyle = dark;
  rrect(-13, -12, 6, 24, 2);
  ctx.fill();
  rrect(7, -12, 6, 24, 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.lineWidth = 1;
  const tread = Math.floor((tank.tread || 0) / 3) % 4;
  for (let yy = -12 + tread; yy < 12; yy += 4) {
    ctx.beginPath();
    ctx.moveTo(-13, yy);
    ctx.lineTo(-7, yy);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(7, yy);
    ctx.lineTo(13, yy);
    ctx.stroke();
  }

  ctx.fillStyle = body;
  rrect(-8, -10, 16, 20, 3);
  ctx.fill();

  ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
  rrect(-7, -9, 4, 17, 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
  ctx.fillRect(-6, 8, 12, 2);

  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.arc(0, -1, 6, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(0, -1, 4.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = dark;
  ctx.fillRect(-2.5, -18, 5, 13);
  ctx.fillStyle = body;
  ctx.fillRect(-1.5, -18, 3, 11);

  ctx.fillStyle = '#10161f';
  ctx.fillRect(-2.5, -19, 5, 3);

  if (tank.hitFlash > 0) {
    ctx.fillStyle = `rgba(255, 255, 255, ${tank.hitFlash * 4})`;
    rrect(-13, -12, 26, 25, 5);
    ctx.fill();
  }

  ctx.restore();
}

function drawShield(tank) {
  const cx = tank.x + TANK_SIZE / 2;
  const cy = tank.y + TANK_SIZE / 2;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(time * 2.5);
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.85)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.arc(0, 0, 18, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

function drawHpPips(tank) {
  const w = 5;
  const gap = 2;
  const total = tank.maxHp;
  const startX = tank.x + TANK_SIZE / 2 - (total * (w + gap) - gap) / 2;

  for (let i = 0; i < total; i++) {
    ctx.fillStyle = i < tank.hp ? '#fb7185' : 'rgba(148, 163, 184, 0.25)';
    ctx.fillRect(startX + i * (w + gap), tank.y - 6, w, 2.5);
  }
}

function drawTanks() {
  for (const e of enemies) {
    if (!e.alive) continue;
    if (e.spawnTimer > 0) {
      drawSpawnEffect(e);
      continue;
    }
    drawTank(e);
    if (e.invulnTimer > 0) drawShield(e);
    if (e.maxHp > 1) drawHpPips(e);
  }

  if (player && player.alive) {
    if (player.spawnTimer > 0) {
      drawSpawnEffect(player);
    } else {
      drawTank(player);
      if (player.invulnTimer > 0) drawShield(player);
    }
  }
}

function drawPowerups() {
  for (const p of powerups) {
    if (!p.alive) continue;
    if (p.life < 4 && Math.floor(time * 8) % 2 === 0) continue;

    const pulse = 1 + Math.sin(time * 4 + p.x * 0.1) * 0.05;
    ctx.save();
    ctx.translate(p.x + p.size / 2, p.y + p.size / 2);
    ctx.scale(pulse, pulse);

    ctx.shadowColor = p.color;
    ctx.shadowBlur = 14;
    ctx.fillStyle = 'rgba(8, 13, 20, 0.94)';
    rrect(-12, -12, 24, 24, 6);
    ctx.fill();
    ctx.strokeStyle = p.color;
    ctx.lineWidth = 1.5;
    rrect(-12, -12, 24, 24, 6);
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.fillStyle = p.color;
    ctx.font = '700 13px "Microsoft YaHei", "PingFang SC", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(p.glyph, 0, 1);
    ctx.restore();
  }
}

function drawBullets() {
  for (const b of bullets) {
    if (!b.alive) continue;
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(DIRS[b.dir].angle);

    ctx.fillStyle = b.isPlayer
      ? 'rgba(253, 230, 138, 0.28)'
      : 'rgba(252, 165, 165, 0.25)';
    ctx.fillRect(-2, 2, 4, 11);

    ctx.shadowColor = b.isPlayer ? '#fbbf24' : '#f87171';
    ctx.shadowBlur = 8;
    ctx.fillStyle = b.isPlayer ? '#fef3c7' : '#fee2e2';
    rrect(-3, -4, 6, 7, 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }

  for (const r of rings) {
    const k = 1 - r.life / r.maxLife;
    ctx.globalAlpha = clamp(r.life / r.maxLife, 0, 1);
    ctx.strokeStyle = r.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.r + (r.maxR - r.r) * k, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
}

function drawFloaters() {
  ctx.font = '700 11px "Microsoft YaHei", "PingFang SC", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (const f of floaters) {
    const k = 1 - f.life / f.maxLife;
    ctx.globalAlpha = clamp(f.life / f.maxLife, 0, 1);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y - 6 - k * 16);
  }
  ctx.globalAlpha = 1;
}

function render() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, FIELD, FIELD);

  drawBackground();
  if (!grid) return;

  ctx.save();
  if (shake > 0.01) {
    const s = shake * 5;
    ctx.translate(Math.sin(time * 87.3) * s, Math.cos(time * 71.7) * s);
  }

  drawTerrain(false);
  drawBase();
  drawPowerups();
  drawTanks();
  drawBullets();
  drawParticles();
  drawFloaters();
  drawTerrain(true);
  ctx.restore();

  if (flash > 0.01) {
    ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(0.5, flash)})`;
    ctx.fillRect(0, 0, FIELD, FIELD);
  }

  if (vignetteGradient) {
    ctx.fillStyle = vignetteGradient;
    ctx.fillRect(0, 0, FIELD, FIELD);
  }
}

/* =========================================================
   界面面板
   ========================================================= */
function showOverlay(html) {
  clearTimeout(overlayClearTimer);
  els.overlay.innerHTML = html;
  els.overlay.classList.add('visible');
}

function hideOverlay() {
  els.overlay.classList.remove('visible');
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
  clearTimeout(overlayClearTimer);
  overlayClearTimer = window.setTimeout(() => {
    if (!els.overlay.classList.contains('visible')) {
      els.overlay.innerHTML = '';
    }
  }, 300);
}

function showMenu() {
  showOverlay(`
    <div class="panel">
      <p class="eyebrow">HTML5 CANVAS ARCADE</p>
      <h1 class="title">坦克大战</h1>
      <p class="subtitle">TANK BATTLE</p>
      <p class="tagline">守住基地，消灭所有敌军坦克。<br>三关战役，等你来战。</p>
      <button class="btn primary" data-action="start" type="button">开始游戏</button>
      <div class="menu-keys">
        <span><kbd>WASD</kbd> / <kbd>方向键</kbd> 移动</span>
        <span><kbd>空格</kbd> / <kbd>J</kbd> 射击　<kbd>P</kbd> 暂停</span>
      </div>
    </div>
  `);
}

function showPaused() {
  showOverlay(`
    <div class="panel">
      <p class="eyebrow">PAUSED</p>
      <h2 class="screen-title">已暂停</h2>
      <p class="tagline">喘口气，敌军也在等你。</p>
      <button class="btn primary" data-action="resume" type="button">继续游戏</button>
      <button class="btn secondary" data-action="restart" type="button">重新开始</button>
    </div>
  `);
}

function showLevelClear() {
  const next = levelIndex + 1;
  showOverlay(`
    <div class="panel">
      <p class="eyebrow">STAGE ${levelIndex + 1} CLEAR</p>
      <h2 class="screen-title">关卡完成</h2>
      <p class="tagline">你守住了基地！<br>下一关：${LEVELS[next].name}</p>
      <div class="score-line"><span>本局得分</span><strong>${pad(score, 6)}</strong></div>
      <button class="btn primary" data-action="next" type="button">进入第 ${next + 1} 关</button>
    </div>
  `);
}

function showGameOver(reason) {
  showOverlay(`
    <div class="panel">
      <p class="eyebrow">GAME OVER</p>
      <h2 class="screen-title danger">游戏结束</h2>
      <p class="tagline">${
        reason === 'base' ? '基地被摧毁了……' : '你的坦克全部损失了……'
      }</p>
      <div class="score-line"><span>最终得分</span><strong>${pad(score, 6)}</strong></div>
      <div class="score-line"><span>历史最高</span><strong>${pad(highScore, 6)}</strong></div>
      <button class="btn primary" data-action="restart" type="button">再来一局</button>
    </div>
  `);
}

function showVictory() {
  showOverlay(`
    <div class="panel">
      <p class="eyebrow">ALL STAGES CLEAR</p>
      <h2 class="screen-title victory">胜利！</h2>
      <p class="tagline">敌军全线溃败，基地安然无恙。<br>指挥官，干得漂亮！</p>
      <div class="score-line"><span>最终得分</span><strong>${pad(score, 6)}</strong></div>
      <div class="score-line"><span>历史最高</span><strong>${pad(highScore, 6)}</strong></div>
      <button class="btn primary" data-action="restart" type="button">再来一局</button>
    </div>
  `);
}

function banner(text) {
  if (!els.banner) return;
  els.banner.textContent = text;
  els.banner.classList.remove('show');
  void els.banner.offsetWidth;
  els.banner.classList.add('show');
}

/* =========================================================
   输入处理
   ========================================================= */
function dirFromCode(code) {
  switch (code) {
    case 'ArrowUp':
    case 'KeyW':
      return 'up';
    case 'ArrowDown':
    case 'KeyS':
      return 'down';
    case 'ArrowLeft':
    case 'KeyA':
      return 'left';
    case 'ArrowRight':
    case 'KeyD':
      return 'right';
    default:
      return null;
  }
}

function isFireCode(code) {
  return code === 'Space' || code === 'KeyJ';
}

function toggleMute() {
  muted = !muted;
  sfx.muted = muted;
  try {
    localStorage.setItem('tank-battle-muted', muted ? '1' : '0');
  } catch {
    /* ignore */
  }
  updateHud();
}

window.addEventListener('keydown', (e) => {
  const code = e.code;
  if (
    code === 'ArrowUp' ||
    code === 'ArrowDown' ||
    code === 'ArrowLeft' ||
    code === 'ArrowRight' ||
    code === 'Space'
  ) {
    e.preventDefault();
  }
  if (e.repeat) return;

  if (code === 'KeyM') {
    toggleMute();
    return;
  }

  if (state === 'menu') {
    if (code === 'Enter' || code === 'Space') {
      startGame();
      return;
    }
  } else if (state === 'paused') {
    if (code === 'KeyP' || code === 'Escape' || code === 'Enter') {
      resumeGame();
      return;
    }
  } else if (state === 'levelclear') {
    if (code === 'Enter' || code === 'Space') {
      nextLevel();
      return;
    }
  } else if (state === 'gameover' || state === 'victory') {
    if (code === 'Enter' || code === 'Space') {
      startGame();
      return;
    }
  } else if (state === 'playing') {
    if (code === 'KeyP' || code === 'Escape') {
      pauseGame();
      return;
    }
  }

  if (state !== 'playing') return;

  const dir = dirFromCode(code);
  if (dir) {
    pressed.add(code);
    if (!heldDirs.includes(dir)) heldDirs.push(dir);
  } else if (isFireCode(code)) {
    pressed.add(code);
  }
});

window.addEventListener('keyup', (e) => {
  const code = e.code;
  const dir = dirFromCode(code);
  pressed.delete(code);

  if (dir) {
    let stillHeld = false;
    for (const c of pressed) {
      if (dirFromCode(c) === dir) {
        stillHeld = true;
        break;
      }
    }
    if (!stillHeld) heldDirs = heldDirs.filter((d) => d !== dir);
  }
});

window.addEventListener('blur', () => {
  resetInputs();
  if (state === 'playing') pauseGame();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && state === 'playing') pauseGame();
});

els.overlay.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;

  if (action === 'start' || action === 'restart') {
    startGame();
  } else if (action === 'resume') {
    resumeGame();
  } else if (action === 'next') {
    nextLevel();
  }
});

els.pauseBtn.addEventListener('click', () => {
  if (state === 'playing') {
    pauseGame();
  } else if (state === 'paused') {
    resumeGame();
  }
  els.pauseBtn.blur();
});

els.muteBtn.addEventListener('click', () => {
  toggleMute();
  els.muteBtn.blur();
});

/* ---------- 触屏方向键 ---------- */
const activePointers = new Map();

function addTouchDir(dir) {
  if (state !== 'playing') return;
  if (!touchDirs.includes(dir)) touchDirs.push(dir);
}

function removeTouchDir(dir) {
  touchDirs = touchDirs.filter((d) => d !== dir);
}

document.querySelectorAll('.dpad-btn').forEach((btn) => {
  const dir = btn.dataset.dir;

  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    btn.setPointerCapture(e.pointerId);
    activePointers.set(e.pointerId, { dir, btn });
    btn.classList.add('active');
    addTouchDir(dir);
  });

  const release = (e) => {
    const entry = activePointers.get(e.pointerId);
    if (!entry) return;
    activePointers.delete(e.pointerId);
    entry.btn.classList.remove('active');

    let dirStillHeld = false;
    for (const a of activePointers.values()) {
      if (a.dir === entry.dir) {
        dirStillHeld = true;
        break;
      }
    }
    if (!dirStillHeld) removeTouchDir(entry.dir);
  };

  btn.addEventListener('pointerup', release);
  btn.addEventListener('pointercancel', release);
  btn.addEventListener('lostpointercapture', release);
});

els.fireBtn.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  els.fireBtn.setPointerCapture(e.pointerId);
  touchFiring = true;
  els.fireBtn.classList.add('active');
  if (state === 'playing' && player) tryFire(player);
});

const releaseFire = () => {
  touchFiring = false;
  els.fireBtn.classList.remove('active');
};

els.fireBtn.addEventListener('pointerup', releaseFire);
els.fireBtn.addEventListener('pointercancel', releaseFire);
els.fireBtn.addEventListener('lostpointercapture', releaseFire);

/* =========================================================
   主循环与启动
   ========================================================= */
function loop(now) {
  if (!lastTime) lastTime = now;
  let dt = (now - lastTime) / 1000;
  lastTime = now;
  dt = Math.min(dt, 1 / 30);

  if (state !== 'paused') time += dt;

  if (state === 'playing') {
    update(dt);
  } else {
    updateAmbient(dt);
  }

  render();
  requestAnimationFrame(loop);
}

function init() {
  setupCanvas();
  loadHighScore();
  loadMuted();
  loadLevel(0, true);
  showMenu();
  updateHud();
  lastTime = performance.now();
  requestAnimationFrame(loop);
}

init();
