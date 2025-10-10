// ===================== Supabase =====================
const supabase = window.supabase.createClient(
  "https://bztovbzqubypgdskypjt.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ6dG92YnpxdWJ5cGdkc2t5cGp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkyODM2NTIsImV4cCI6MjA3NDg1OTY1Mn0.DkWqGmN0B-9AUj7kr6B11hhhnB0b2BKFpOsnrixFNQU"
);

// ===================== Game State =====================
// ===================== Config (no forward refs) =====================
const gameConfig = {
  type: Phaser.AUTO,
  width: 600,
  height: 900,
  backgroundColor: '#fafafa',
scale: {
  mode: Phaser.Scale.FIT,
  autoCenter: Phaser.Scale.CENTER_BOTH,
  parent: 'phaser-game',
  width: Math.max(window.innerWidth, 400),
  height: Math.max(window.innerHeight, 700)
}

}


const GRID_SIZE = 5;
const CELL_SIZE = 110;

// Responsive scaling: adjust cell size for small screens
if (window.innerWidth < 500) {
  CELL_SIZE = 70;
  gameConfig.width = 400;
  gameConfig.height = 700;
} else if (window.innerWidth < 800) {
  CELL_SIZE = 90;
  gameConfig.width = 500;
  gameConfig.height = 850;
}



let grid = [];
let score = 0;

let scoreText;
let rowScoreLabels = [];
let colScoreLabels = [];

// scoring (best-achieved per line)
let rowScores  = Array(GRID_SIZE).fill(0); // 0/5/15/25
let colScores  = Array(GRID_SIZE).fill(0); // 0/5/15/25
let rowBestLen = Array(GRID_SIZE).fill(0); // 0/3/4/5
let colBestLen = Array(GRID_SIZE).fill(0); // 0/3/4/5

// cache for dictionary checks
let wordCache = Object.create(null);

// Mini-leaderboard UI refs
let miniLBHeader = null;
let miniLBTexts = [];   // array of 5 text objects

// letter deck
let currentLetter = '';
let nextLetter = '';

// Swap mechanic
let swapsUsed = 0;           // how many swaps used (max 3)
let swapIndicators = [];     // circle "lights" at bottom of board


// ===================== Letter Distribution =====================
const scrabbleDistribution = {
  A: 10, B: 5, C: 3, D: 6, E: 15,
  F: 3, G: 4, H: 3, I: 9, J: 1,
  K: 2, L: 6, M: 4, N: 8, O: 9,
  P: 3, Q: 1, R: 8, S: 5, T: 8,
  U: 5, V: 2, W: 2, X: 1, Y: 2, Z: 1
};
const weightedLetters = [];
for (const [letter, count] of Object.entries(scrabbleDistribution)) {
  for (let i = 0; i < count; i++) weightedLetters.push(letter);
}

// ===================== Scenes =====================
// Main gameplay scene
class MainScene extends Phaser.Scene {
  constructor() {
    super('MainScene');
  }
  preload() { preload.call(this); }
  create()  { create.call(this); }
  update()  { update.call(this); }
}

// ===================== Summary Scene =====================
class SummaryScene extends Phaser.Scene {
  constructor() { super('SummaryScene'); }

  async create(data) {
    const { words = [], total = 0 } = data;

    // Sort words descending by score
    const sortedWords = [...words].sort((a, b) => b.score - a.score);

    // Dim background
    this.add.rectangle(300, 380, 600, 760, 0x000000, 0.5).setDepth(0);

    // Card
    const card = this.add.rectangle(300, 380, 460, 500, 0xffffff, 1)
      .setStrokeStyle(3, 0x222222)
      .setOrigin(0.5)
      .setDepth(0);
    this.tweens.add({ targets: card, alpha: 1, duration: 250 });

    // Title + total
    this.add.text(300, 160, 'Game Over', {
      fontFamily: 'Arial Black, Verdana, sans-serif',
      fontSize: '32px',
      color: '#111'
    }).setOrigin(0.5).setDepth(1);

    this.add.text(300, 210, `Total Score: ${total}`, {
      fontFamily: 'Arial Black, Verdana, sans-serif',
      fontSize: '22px',
      color: '#333'
    }).setOrigin(0.5).setDepth(1);

    // Headers
    this.add.text(160, 250, 'Word', { fontSize: '18px', color: '#555' }).setDepth(1);
    this.add.text(440, 250, 'Pts', { fontSize: '18px', color: '#555' }).setOrigin(1,0).setDepth(1);

    // Word list (max 10 shown)
    let y = 275;
    sortedWords.slice(0,10).forEach(w => {
      this.add.text(160, y, w.word, { fontSize: '18px', color: '#111' }).setDepth(1);
      this.add.text(440, y, w.score.toString(), { fontSize: '18px', color: '#111' })
          .setOrigin(1,0).setDepth(1);
      y += 26;
    });

    // Buttons
    const makeBtn = (label, x, y, onClick) => {
      const btn = this.add.rectangle(x, y, 160, 44, 0x333333, 1)
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true })
        .setDepth(1);
      const text = this.add.text(x, y, label, {
        fontFamily: 'Arial Black, Verdana, sans-serif',
        fontSize: '18px',
        color: '#fff'
      }).setOrigin(0.5).setDepth(1);
      btn.on('pointerover', () => btn.setFillStyle(0x555555));
      btn.on('pointerout',  () => btn.setFillStyle(0x333333));
      btn.on('pointerdown', onClick);
    };

makeBtn('Leaderboard', 200, 540, () => this.scene.start('LeaderboardScene'));
makeBtn('New Game', 400, 540, () => { resetGameState(); this.scene.start('MainScene'); });

  }
}



// Leaderboard scene
class LeaderboardScene extends Phaser.Scene {
  constructor() { super('LeaderboardScene'); }

  async create() {
    // Overlay & card
    this.add.rectangle(300, 380, 600, 760, 0x000000, 0.5).setDepth(0);
    const card = this.add.rectangle(300, 380, 460, 460, 0xffffff, 1)
      .setStrokeStyle(3, 0x222222)
      .setOrigin(0.5)
      .setDepth(0);
    this.tweens.add({ targets: card, alpha: 1, duration: 250 });

    // Title
    this.add.text(300, 180, 'Top 5 Scores', {
      fontFamily: 'Arial Black, Verdana, sans-serif',
      fontSize: '28px',
      color: '#111'
    }).setOrigin(0.5).setDepth(1);

    // Fetch scores
    const { data: scores = [] } = await supabase
      .from('scores')
      .select('*')
      .order('score', { ascending: false })
      .limit(5);

    // List
    let y = 240;
    scores.forEach((s, i) => {
      this.add.text(120, y, `${i+1}. ${s.name}`, { fontSize: '20px', color: '#111' }).setDepth(1);
      this.add.text(330, y, `${s.score}`, { fontSize: '20px', color: '#111' })
          .setOrigin(1,0).setDepth(1);
      const date = new Date(s.created_at).toLocaleDateString('en-US',{month:'2-digit',day:'2-digit'});
      this.add.text(400, y, date, { fontSize: '20px', color: '#666' }).setOrigin(0,0).setDepth(1);
      y += 32;
    });

    // New Game button
    const btn = this.add.rectangle(300, 520, 160, 44, 0x333333, 1)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .setDepth(1);
    const text = this.add.text(300, 520, 'New Game', {
      fontFamily: 'Arial Black, Verdana, sans-serif',
      fontSize: '18px',
      color: '#fff'
    }).setOrigin(0.5).setDepth(1);
    btn.on('pointerover', () => btn.setFillStyle(0x555555));
    btn.on('pointerout',  () => btn.setFillStyle(0x333333));
    btn.on('pointerdown', () => { resetGameState(); this.scene.start('MainScene'); });
  }
}


// ===================== Name Entry Scene =====================
class NameEntryScene extends Phaser.Scene {
  constructor() { super('NameEntryScene'); }

  create(data) {
    const { total, words } = data;

    // Match SummaryScene and LeaderboardScene card placement
    const centerX = 300;
    const centerY = 380;

    // Dim background
    this.add.rectangle(centerX, centerY, 600, 760, 0x000000, 0.5);

    // Card (same size as others)
    const card = this.add.rectangle(centerX, centerY, 460, 260, 0xffffff)
      .setStrokeStyle(3, 0x222222)
      .setOrigin(0.5);

    // Title
    this.add.text(centerX, centerY - 70, 'New High Score!', {
      fontFamily: 'Arial Black, Verdana, sans-serif',
      fontSize: '26px',
      color: '#111'
    }).setOrigin(0.5);

    // Score
    this.add.text(centerX, centerY - 30, `Your Score: ${total}`, {
      fontFamily: 'Arial Black, Verdana, sans-serif',
      fontSize: '20px',
      color: '#333'
    }).setOrigin(0.5);

    // --- HTML Input ---
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Enter your name';
    input.style.position = 'absolute';
    input.style.width = '220px';
    input.style.padding = '6px';
    input.style.fontSize = '16px';
    input.style.border = '2px solid #333';
    input.style.borderRadius = '6px';
    input.style.textAlign = 'center';
    input.style.background = '#fff';
    input.style.zIndex = '10';

    // Position input centered above Submit button
    const canvasBounds = this.sys.canvas.getBoundingClientRect();
    const inputX = canvasBounds.left + 190; // (600 canvas width - 220 input width)/2 = 190
    const inputY = canvasBounds.top + (centerY - 10); // same vertical alignment as others
    input.style.left = `${inputX}px`;
    input.style.top = `${inputY}px`;
    document.body.appendChild(input);

    // --- Submit Button ---
    const btnY = centerY + 60;
    const btn = this.add.rectangle(centerX, btnY, 140, 40, 0x333333)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    const text = this.add.text(centerX, btnY, 'Submit', {
      fontFamily: 'Arial Black, Verdana, sans-serif',
      fontSize: '18px',
      color: '#fff'
    }).setOrigin(0.5);

    btn.on('pointerover', () => btn.setFillStyle(0x555555));
    btn.on('pointerout',  () => btn.setFillStyle(0x333333));

    btn.on('pointerdown', async () => {
      const playerName = input.value.trim() || 'Anonymous';
      document.body.removeChild(input);

      // Save to Supabase
      const { data, error } = await supabase
        .from('scores')
        .insert([{ name: playerName, score: total }])
        .select();

      if (error) {
        console.error('Supabase insert error:', error);
        alert('⚠️ Unable to save score — check console for details.');
      } else {
        console.log('✅ Score inserted:', data);
      }

      // Go to summary card next
      this.scene.start('SummaryScene', { words, total });
    });

    // Recenter input if window resizes
    window.addEventListener('resize', () => {
      const rect = this.sys.canvas.getBoundingClientRect();
      input.style.left = `${rect.left + 190}px`;
      input.style.top  = `${rect.top + (centerY - 10)}px`;
    });
  }
}



// ===================== Phaser lifecycle fns used by MainScene =====================
function preload() {}

function create() {
  const GRID_LEFT = (gameConfig.width - GRID_SIZE * CELL_SIZE) / 2;
  const GRID_TOP  = 100;

  // Grid
  for (let row = 0; row < GRID_SIZE; row++) {
    grid[row] = [];
    for (let col = 0; col < GRID_SIZE; col++) {
      const x = GRID_LEFT + col * CELL_SIZE + CELL_SIZE / 2;
      const y = GRID_TOP  + row * CELL_SIZE + CELL_SIZE / 2;

      const rect = this.add.rectangle(x, y, CELL_SIZE, CELL_SIZE, 0xffffff)
        .setStrokeStyle(2, 0x000000)
        .setInteractive();

      const highlight = this.add.rectangle(x, y, CELL_SIZE - 6, CELL_SIZE - 6, 0xffffff, 0);

      const letterText = this.add.text(x, y, '', {
        fontFamily: 'Arial Black, Verdana, sans-serif',
        fontSize: '32px',
        fontStyle: 'bold',
        color: '#000'
      }).setOrigin(0.5);

      rect.on('pointerdown', () => placeLetter(row, col));

      grid[row][col] = {
        rect,
        highlightRect: highlight,
        letterText,
        filled: false,
        rowValid: false,
        colValid: false,
      };
    }
  }

  // ===================== Top UI Row =====================
  const uiY = 10;

  this.onDeckText = this.add.text(20, uiY, 'On Deck: ', {
    fontFamily: 'Arial Black, Verdana, sans-serif',
    fontSize: '20px',
    fontStyle: 'bold',
    color: '#333'
  }).setOrigin(0, 0);

  const centerX = gameConfig.width / 2;
  this.nextLetterBox = this.add.rectangle(centerX, uiY, 80, 80, 0xffffff, 1)
    .setStrokeStyle(3, 0x000000)
    .setOrigin(0.5, 0);

  this.nextLetterText = this.add.text(centerX, uiY + 40, '', {
    fontFamily: 'Arial Black, Verdana, sans-serif',
    fontSize: '48px',
    fontStyle: 'bold',
    color: '#007bff'
  }).setOrigin(0.5);

  scoreText = this.add.text(gameConfig.width - 20, uiY + 12, 'Score: 0', {
    fontFamily: 'Arial Black, Verdana, sans-serif',
    fontSize: '20px',
    fontStyle: 'bold',
    color: '#000'
  }).setOrigin(1, 0.5);

  // Row score labels
  for (let r = 0; r < GRID_SIZE; r++) {
    const x = GRID_LEFT + GRID_SIZE * CELL_SIZE + 16;
    const y = GRID_TOP + r * CELL_SIZE + CELL_SIZE / 2;
    rowScoreLabels[r] = this.add.text(x, y, '', {
      fontFamily: 'Arial Black, Verdana, sans-serif',
      fontSize: '16px',
      fontStyle: 'bold',
      color: '#333'
    }).setOrigin(0, 0.5);
  }

  // Column score labels
  for (let c = 0; c < GRID_SIZE; c++) {
    const x = GRID_LEFT + c * CELL_SIZE + CELL_SIZE / 2;
    const y = GRID_TOP + GRID_SIZE * CELL_SIZE + 8;
    colScoreLabels[c] = this.add.text(x, y, '', {
      fontFamily: 'Arial Black, Verdana, sans-serif',
      fontSize: '16px',
      fontStyle: 'bold',
      color: '#333'
    }).setOrigin(0.5, 0);
  }

  // ===================== Swap Lights (3 total) =====================
  const lightsY = 100 + GRID_SIZE * CELL_SIZE + 60; // just below the grid
  const startX = gameConfig.width / 2 - 60;

  for (let i = 0; i < 3; i++) {
    const light = this.add.circle(startX + i * 60, lightsY, 12, 0xcccccc);
    light.setStrokeStyle(2, 0x555555);
    swapIndicators.push(light);
  }

updateSwapIndicators();


  // Label
  this.add.text(gameConfig.width / 2, lightsY + 20, 'Swaps Used', {
    fontFamily: 'Verdana, sans-serif',
    fontSize: '12px',
    color: '#555'
  }).setOrigin(0.5, 0);


    // Mini leaderboard under the grid
  initMiniLeaderboardUI(this);
  updateMiniLeaderboard(this);

  pickNextLetter();
  updateNextLetterUI(this, false);

}

function update() {}

// ===================== Helpers =====================


// --- Helper: defines friendly next-letter tendencies ---
const bigramMap = {
  A: "NTRSL", B: "REALO", C: "HAREO", D: "EARNO", E: "RSTNL",
  F: "REALO", G: "RANEO", H: "EAOIN", I: "NESTR",
  J: "UOEA", K: "NEA", L: "EAST", M: "EAIO", N: "DTEA",
  O: "RNSTL", P: "REALS", Q: "U", R: "ESTOA", S: "TEAOR", T: "HEAOR",
  U: "RSTNL", V: "AEIO", W: "AROE", X: "PEA", Y: "AEIO", Z: "EA"
};

const vowels = ["A", "E", "I", "O", "U"];
const consonants = "BCDFGHJKLMNPQRSTVWXYZ".split("");

// --- Helper: pick random item from string or array ---
function weightedPick(list) {
  if (typeof list === "string") list = list.split("");
  return list[Math.floor(Math.random() * list.length)];
}

// --- Helper: get vowel/consonant ratio ---
function getVowelRatio() {
  let filledLetters = [];
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      const ch = grid[r][c]?.letterText?.text || "";
      if (ch) filledLetters.push(ch);
    }
  }
  if (filledLetters.length === 0) return 0.4; // default
  const vowelCount = filledLetters.filter(l => vowels.includes(l)).length;
  return vowelCount / filledLetters.length;
}

// --- Smart Letter Picker ---
function pickNextLetter() {
  const useBigram = Math.random() < 0.7;  // 70% chance use smart weighting

  // Initialization
  if (!currentLetter) {
    currentLetter = weightedPick(weightedLetters);
    nextLetter = weightedPick(weightedLetters);
    return;
  }

  // Shift current to next
  currentLetter = nextLetter;

  // --- Phase 1: Vowel balancing ---
  const vowelRatio = getVowelRatio();
  if (vowelRatio < 0.35) {
    // Too few vowels, force a vowel ~40% of the time
    if (Math.random() < 0.4) {
      nextLetter = weightedPick(vowels);
      return;
    }
  } else if (vowelRatio > 0.55) {
    // Too many vowels, bias toward consonants
    if (Math.random() < 0.4) {
      nextLetter = weightedPick(consonants);
      return;
    }
  }

  // --- Phase 2: Bigram weighting ---
  const options = bigramMap[currentLetter];
  if (useBigram && options) {
    nextLetter = weightedPick(options);
  } else {
    nextLetter = weightedPick(weightedLetters);
  }
}


function updateNextLetterUI(scene, animate = false) {
  scene.onDeckText.setText(`On Deck: ${nextLetter}`);
  scene.nextLetterText.setText(currentLetter);
  if (animate) {
    scene.tweens.add({
      targets: [scene.nextLetterBox, scene.nextLetterText],
      scale: 1.1,
      duration: 120,
      yoyo: true,
      ease: 'Quad.easeOut'
    });
  }
}

function ptsForLen(L) {
  return L === 3 ? 5 : L === 4 ? 15 : L === 5 ? 25 : 0;
}

function isBoardFull() {
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      if (!grid[r][c].filled) return false;
    }
  }
  return true;
}

function initMiniLeaderboardUI(scene) {
  // Clear old (in case of hot reload)
  if (miniLBHeader) miniLBHeader.destroy();
  miniLBTexts.forEach(t => t.destroy());
  miniLBTexts = [];

  // Compute bottom-of-grid
  const GRID_BOTTOM = 100 + GRID_SIZE * CELL_SIZE; // GRID_TOP is 100 in your code
  const startY = GRID_BOTTOM + 120;                 // below col labels

  // Header
  miniLBHeader = scene.add.text(gameConfig.width / 2, startY, 'Top 5 All-Time', {
    fontFamily: 'Arial Black, Verdana, sans-serif',
    fontSize: '14px',
    fontStyle: 'bold',
    color: '#444'
  }).setOrigin(0.5, 0);

  // Placeholder rows
  const lineY = startY + 20;
  for (let i = 0; i < 5; i++) {
    const t = scene.add.text(300, lineY + i * 16, '', {
      fontFamily: 'Verdana, sans-serif',
      fontSize: '12px',
      color: '#555'
    }).setOrigin(0.5, 0);
    miniLBTexts.push(t);
  }

  // Fetch & populate
  updateMiniLeaderboard(scene);
}

  function updateSwapIndicators() {
    for (let i = 0; i < 3; i++) {
      if (!swapIndicators[i]) continue;
      if (i < swapsUsed) {
        swapIndicators[i].setFillStyle(0x00cc66);  // green for used
      } else {
        swapIndicators[i].setFillStyle(0xcccccc);  // grey for unused
      }
    }
  }


async function updateMiniLeaderboard(scene) {
  const { data: scores, error } = await supabase
    .from('scores')
    .select('name, score, created_at')
    .order('score', { ascending: false })
    .limit(5);

  if (error) {
    console.error('Mini LB error:', error);
    miniLBTexts.forEach((t, i) => t.setText(i === 0 ? '— leaderboard unavailable —' : ''));
    return;
  }

  // Render lines
  const rows = scores || [];
  for (let i = 0; i < 5; i++) {
    const s = rows[i];
    if (!s) {
      miniLBTexts[i].setText('');
      continue;
    }
    const date = new Date(s.created_at).toLocaleDateString();
    // Example: "1) Alex — 95 (7/2/2025)"
    miniLBTexts[i].setText(`${i + 1}) ${s.name || '—'} — ${s.score} (${date})`);
  }
}


// ===================== Supabase Validation =====================
async function validateWord(word) {
  if (!word || word.length < 3) return false;
  const key = word.toLowerCase();

  if (wordCache[key] !== undefined) return wordCache[key];

  const { count, error } = await supabase
    .from("dictionary")
    .select("*", { count: "exact", head: true })
    .eq("word", key);

  if (error) {
    console.error("Supabase error:", error);
    wordCache[key] = false;
    return false;
  }

  const isValid = count > 0;
  wordCache[key] = isValid;
  return isValid;
}

// ===================== Word Builders =====================
function buildLeadingRowWord(row) {
  let s = '';
  for (let c = 0; c < GRID_SIZE; c++) {
    const ch = grid[row][c].letterText.text || '';
    if (!ch) break;
    s += ch;
  }
  return s;
}
function buildLeadingColWord(col) {
  let s = '';
  for (let r = 0; r < GRID_SIZE; r++) {
    const ch = grid[r][col].letterText.text || '';
    if (!ch) break;
    s += ch;
  }
  return s;
}

async function longestValidPrefix(word) {
  const n = Math.min(word.length, 5);
  for (let L = 5; L >= 3; L--) {
    if (L <= n) {
      const w = word.slice(0, L).toLowerCase();
      if (await validateWord(w)) return L;
    }
  }
  return 0;
}

// ===================== Highlighting =====================
function applyCellColor(row, col) {
  const cell = grid[row][col];
  let color = null;
  let alpha = 0;

  if (cell.rowValid && cell.colValid) { color = 0x66cc66; alpha = 0.5; }
  else if (cell.rowValid)            { color = 0xfff066; alpha = 0.5; }
  else if (cell.colValid)            { color = 0x66ccff; alpha = 0.5; }

  const hr = cell.highlightRect;
  const scene = hr.scene;

  if (!color) {
    scene.tweens.add({ targets: hr, alpha: 0, duration: 150 });
  } else {
    hr.setFillStyle(color, 1);
    scene.tweens.add({ targets: hr, alpha, duration: 200 });
  }
}

function refreshRowHighlights(row) {
  for (let c = 0; c < GRID_SIZE; c++) applyCellColor(row, c);
  rowScoreLabels[row].setText(rowScores[row] > 0 ? String(rowScores[row]) : '');
}

function refreshColHighlights(col) {
  for (let r = 0; r < GRID_SIZE; r++) applyCellColor(r, col);
  colScoreLabels[col].setText(colScores[col] > 0 ? String(colScores[col]) : '');
}

function grayUnusedCells() {
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      const cell = grid[r][c];
      if (!cell.rowValid && !cell.colValid) {
        const hr = cell.highlightRect;
        hr.setFillStyle(0xaaaaaa, 1);
        hr.scene.tweens.add({ targets: hr, alpha: 0.5, duration: 200 });
      }
    }
  }
}

// ===================== Row/Col recompute =====================
async function recomputeRow(row) {
  const word = buildLeadingRowWord(row);
  for (let c = 0; c < GRID_SIZE; c++) grid[row][c].rowValid = false;

  if (word.length < 3) {
    refreshRowHighlights(row);
    return;
  }

  const bestLen = await longestValidPrefix(word);
  if (bestLen >= 3) {
    for (let c = 0; c < bestLen; c++) grid[row][c].rowValid = true;
    if (bestLen > rowBestLen[row]) {
      const newPts = ptsForLen(bestLen);
      score += (newPts - rowScores[row]);
      rowScores[row] = newPts;
      rowBestLen[row] = bestLen;
    }
  }
  refreshRowHighlights(row);
}

async function recomputeColumn(col) {
  const word = buildLeadingColWord(col);
  for (let r = 0; r < GRID_SIZE; r++) grid[r][col].colValid = false;

  if (word.length < 3) {
    refreshColHighlights(col);
    return;
  }

  const bestLen = await longestValidPrefix(word);
  if (bestLen >= 3) {
    for (let r = 0; r < bestLen; r++) grid[r][col].colValid = true;
    if (bestLen > colBestLen[col]) {
      const newPts = ptsForLen(bestLen);
      score += (newPts - colScores[col]);
      colScores[col] = newPts;
      colBestLen[col] = bestLen;
    }
  }
  refreshColHighlights(col);
}

// ===================== Placement =====================
async function placeLetter(row, col) {
  const cell = grid[row][col];

  // If cell is filled...
  if (cell.filled) {
    // ...allow overwrite only if swaps remain
    if (swapsUsed < 3) {
      swapsUsed++;
      cell.letterText.setText(currentLetter);
      updateSwapIndicators();
    } else {
      // No swaps left
      const sceneRef = grid[0][0].rect.scene;
      const warn = sceneRef.add.text(gameConfig.width / 2, 60, 'No swaps remaining!', {
        fontFamily: 'Arial Black, Verdana, sans-serif',
        fontSize: '18px',
        color: '#cc0000'
      }).setOrigin(0.5);
      sceneRef.tweens.add({ targets: warn, alpha: 0, duration: 1200, onComplete: () => warn.destroy() });
      return;
    }
  } else {
    // normal placement if empty
    cell.filled = true;
    cell.letterText.setText(currentLetter);
  }


  cell.letterText.setText(currentLetter);
  cell.filled = true;

  await Promise.all([recomputeRow(row), recomputeColumn(col)]);
  scoreText.setText(`Score: ${score}`);

  pickNextLetter();
  const sceneRef = grid[0][0].rect.scene;
  updateNextLetterUI(sceneRef, true);

if (isBoardFull()) {
  grayUnusedCells();

  // Collect words for summary
  let words = [];
  for (let r = 0; r < GRID_SIZE; r++) {
    const w = buildLeadingRowWord(r);
    if (rowBestLen[r] >= 3) words.push({ word: w.slice(0,rowBestLen[r]), score: rowScores[r] });
  }
  for (let c = 0; c < GRID_SIZE; c++) {
    const w = buildLeadingColWord(c);
    if (colBestLen[c] >= 3) words.push({ word: w.slice(0,colBestLen[c]), score: colScores[c] });
  }

  // --- Check leaderboard threshold ---
  const { data: scores } = await supabase
    .from('scores')
    .select('*')
    .order('score', { ascending: false })
    .limit(5);

  const lowestTop5 = (scores && scores.length === 5) ? scores[4].score : 0;

  if (score > lowestTop5 || (scores && scores.length < 5)) {
    sceneRef.scene.start('NameEntryScene', { words, total: score });
  } else {
    sceneRef.scene.start('SummaryScene', { words, total: score });
  }
}

    for (let c = 0; c < GRID_SIZE; c++) {
      const w = buildLeadingColWord(c);
      if (colBestLen[c] >= 3) words.push({ word: w.slice(0,colBestLen[c]), score: colScores[c] });
    }

    sceneRef.scene.start('SummaryScene', { words, total: score });
  }


// ===================== Reset =====================
function resetGameState() {
  swapsUsed = 0;
  swapIndicators = [];
  score = 0;
  rowScores.fill(0);
  colScores.fill(0);
  rowBestLen.fill(0);
  colBestLen.fill(0);
  grid = [];
  wordCache = Object.create(null);
  currentLetter = '';
  nextLetter = '';
}

window.addEventListener('resize', () => {
  const game = Phaser.GAMES[0];
  if (game && game.scale) {
    game.scale.resize(window.innerWidth, window.innerHeight);
  }
});


// ===================== Boot Game (attach scenes here) =====================
window.addEventListener('load', () => {
  const game = new Phaser.Game({
    ...gameConfig,
    scene: [MainScene, NameEntryScene, SummaryScene, LeaderboardScene]
  });

  // Force resize after load (fixes white screen on mobile)
  setTimeout(() => {
    if (game && game.scale) {
      game.scale.resize(window.innerWidth, window.innerHeight);
    }
  }, 500);
});

window.addEventListener('resize', () => {
  const game = Phaser.GAMES[0];
  if (game && game.scale) {
    game.scale.resize(window.innerWidth, window.innerHeight);
  }
});


