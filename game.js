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
  height: 760,
  backgroundColor: '#fafafa'
};

const GRID_SIZE = 5;
const CELL_SIZE = 110;

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
    const { words, total } = data;

    this.add.text(300, 40, 'Game Summary', {
      fontSize: '28px',
      fontStyle: 'bold'
    }).setOrigin(0.5);

    // List valid words + scores
    let y = 100;
    words.forEach(w => {
      this.add.text(100, y, `${w.word}`, { fontSize: '20px' });
      this.add.text(500, y, `${w.score}`, { fontSize: '20px' }).setOrigin(1, 0);
      y += 30;
    });

    // Total score
    this.add.text(100, y + 20, 'Total Score:', {
      fontSize: '22px', fontStyle: 'bold'
    });
    this.add.text(500, y + 20, `${total}`, {
      fontSize: '22px', fontStyle: 'bold'
    }).setOrigin(1, 0);

    y += 80;

    // --- Check if score qualifies for Top 5 ---
    const { data: scores } = await supabase
      .from('scores')
      .select('*')
      .order('score', { ascending: false })
      .limit(5);

    const lowestTop5 = (scores && scores.length === 5) ? scores[4].score : 0;

    if (total > lowestTop5 || (scores && scores.length < 5)) {
      // Show prompt for player name
      this.add.text(300, y, 'You made the Top 5! Enter your name:', {
        fontSize: '20px'
      }).setOrigin(0.5);

      // Create HTML input element over canvas
      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = 'Your Name';
      input.style.position = 'absolute';
      input.style.top = `${this.sys.canvas.offsetTop + y + 20}px`;
      input.style.left = `${this.sys.canvas.offsetLeft + 150}px`;
      input.style.fontSize = '18px';
      input.maxLength = 12;
      document.body.appendChild(input);

      // Submit button
      const submitBtn = this.add.text(300, y + 60, 'Submit Score', {
        fontSize: '20px',
        backgroundColor: '#ddd',
        padding: { x: 10, y: 5 }
      }).setOrigin(0.5).setInteractive();

      submitBtn.on('pointerdown', async () => {
        const playerName = input.value.trim() || 'Anonymous';

        // Save to Supabase
        await supabase.from('scores').insert([
          { name: playerName, score: total }
        ]);

        // Remove input element
        document.body.removeChild(input);

        // Jump to leaderboard
        this.scene.start('LeaderboardScene');
      });
    }

// Centered buttons with darker style
const centerX = this.scale.width / 2;
const btnY = y + 120;

const makeBtn = (label, x, onClick) => {
  const btn = this.add.text(x, btnY, label, {
    fontSize: '20px',
    fontFamily: 'Arial Black, Verdana, sans-serif',
    backgroundColor: '#888',           // darker default
    color: '#fff',
    padding: { x: 14, y: 8 }
  }).setOrigin(0.5).setInteractive({ useHandCursor: true });

  btn.on('pointerover', () => btn.setStyle({ backgroundColor: '#666' })); // hover darker
  btn.on('pointerout',  () => btn.setStyle({ backgroundColor: '#888' }));
  btn.on('pointerdown', onClick);
  return btn;
};

makeBtn('Return to Game', centerX - 120, () => {
  resetGameState();
  this.scene.start('MainScene');
});

makeBtn('See Leaderboard', centerX + 120, () => {
  this.scene.start('LeaderboardScene');
});

  }
}


// Leaderboard scene
class LeaderboardScene extends Phaser.Scene {
  constructor() { super('LeaderboardScene'); }

  async create() {
    this.add.text(300, 40, 'Leaderboard', { fontSize: '28px', fontStyle: 'bold' }).setOrigin(0.5);

    const { data: scores } = await supabase
      .from('scores')
      .select('*')
      .order('score', { ascending: false })
      .limit(5);

    let y = 100;
    (scores || []).forEach((s, i) => {
      this.add.text(100, y, `${i+1}. ${s.name}`, { fontSize: '20px' });
      this.add.text(400, y, `${s.score}`, { fontSize: '20px' }).setOrigin(1,0);
      this.add.text(500, y, `${new Date(s.created_at).toLocaleDateString()}`, { fontSize: '16px' }).setOrigin(1,0);
      y += 30;
    });

    const backBtn = this.add.text(300, y+80, 'Return to Game', {
      fontSize: '20px', backgroundColor:'#ddd', padding:{x:10,y:5}
    }).setOrigin(0.5).setInteractive();

    backBtn.on('pointerdown', () => {
      resetGameState();
      this.scene.start('MainScene');
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

    // Mini leaderboard under the grid
  initMiniLeaderboardUI(this);
  updateMiniLeaderboard(this);

  pickNextLetter();
  updateNextLetterUI(this, false);

}

function update() {}

// ===================== Helpers =====================
function pickNextLetter() {
  if (!currentLetter) {
    currentLetter = weightedLetters[Math.floor(Math.random() * weightedLetters.length)];
    nextLetter = weightedLetters[Math.floor(Math.random() * weightedLetters.length)];
  } else {
    currentLetter = nextLetter;
    nextLetter = weightedLetters[Math.floor(Math.random() * weightedLetters.length)];
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
  const startY = GRID_BOTTOM + 34;                 // below col labels

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
  if (cell.filled) return;

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

    sceneRef.scene.start('SummaryScene', { words, total: score });
  }
}

// ===================== Reset =====================
function resetGameState() {
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



// ===================== Boot Game (attach scenes here) =====================
new Phaser.Game({
  ...gameConfig,
  scene: [MainScene, SummaryScene, LeaderboardScene]
});
