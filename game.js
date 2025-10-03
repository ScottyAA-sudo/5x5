// ===================== Config =====================
const config = {
  type: Phaser.AUTO,
  width: 600,
  height: 700,
  backgroundColor: '#fafafa',
  scene: { preload, create, update }
};

// ===================== Supabase =====================
const supabase = window.supabase.createClient(
  "https://bztovbzqubypgdskypjt.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ6dG92YnpxdWJ5cGdkc2t5cGp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkyODM2NTIsImV4cCI6MjA3NDg1OTY1Mn0.DkWqGmN0B-9AUj7kr6B11hhhnB0b2BKFpOsnrixFNQU" // anon key
);

// ===================== Game State =====================
const GRID_SIZE = 5;
const CELL_SIZE = 100;

let grid = [];
let score = 0;

let scoreText;
let rowScoreLabels = [];
let colScoreLabels = [];

// word/score tracking
let rowScores     = Array(GRID_SIZE).fill(0); 
let colScores     = Array(GRID_SIZE).fill(0); 
let rowBestLen    = Array(GRID_SIZE).fill(0); 
let colBestLen    = Array(GRID_SIZE).fill(0); 
let rowInvalidLen = Array(GRID_SIZE).fill(0); 
let colInvalidLen = Array(GRID_SIZE).fill(0); 

// letter deck (current + on-deck)
let currentLetter = '';
let nextLetter = '';

// ===================== Letter Distribution =====================
// Tweak counts as you like.
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

// ===================== Phaser Boot =====================
new Phaser.Game(config);

function preload() {}

function create() {
  const GRID_LEFT = (config.width - GRID_SIZE * CELL_SIZE) / 2;
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

      // overlay for highlight (starts transparent)
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
        invalidRow: false,
        invalidCol: false
      };
    }
  }

  // ===================== Top UI Row (text-only) =====================
  const uiY = 10; 

  // Left: On Deck
  this.onDeckText = this.add.text(20, uiY, 'On Deck: ', {
    fontFamily: 'Arial Black, Verdana, sans-serif',
    fontSize: '20px',
    fontStyle: 'bold',
    color: '#333'
  }).setOrigin(0, 0);

  // Center: big red box for the current letter
  const centerX = config.width / 2;
  this.nextLetterBox = this.add.rectangle(centerX, uiY, 80, 80, 0xffffff, 1)
    .setStrokeStyle(3, 0x000000)
    .setOrigin(0.5, 0);

  this.nextLetterText = this.add.text(centerX, uiY + 40, '', {
    fontFamily: 'Arial Black, Verdana, sans-serif',
    fontSize: '48px',
    fontStyle: 'bold',
    color: '#d22'
  }).setOrigin(0.5);

  // Right: score
  scoreText = this.add.text(config.width - 20, uiY + 12, 'Score: 0', {
    fontFamily: 'Arial Black, Verdana, sans-serif',
    fontSize: '20px',
    fontStyle: 'bold',
    color: '#000'
  }).setOrigin(1, 0.5);

  // Row score labels (right of grid)
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

  // Column score labels (below grid)
  for (let c = 0; c < GRID_SIZE; c++) {
    const x = GRID_LEFT + c * CELL_SIZE + CELL_SIZE / 2;
    const y = GRID_TOP + GRID_SIZE * CELL_SIZE + 16;
    colScoreLabels[c] = this.add.text(x, y, '', {
      fontFamily: 'Arial Black, Verdana, sans-serif',
      fontSize: '16px',
      fontStyle: 'bold',
      color: '#333'
    }).setOrigin(0.5, 0);
  }

  // Initialize deck and draw cards once
  pickNextLetter();
  updateNextLetterUI(this, false);
}

function update() {}

// ===================== Core Helpers =====================
function pickNextLetter() {
  if (!currentLetter) {
    // first time: pick both
    currentLetter = weightedLetters[Math.floor(Math.random() * weightedLetters.length)];
    nextLetter = weightedLetters[Math.floor(Math.random() * weightedLetters.length)];
  } else {
    // shift deck
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

function placeLetter(row, col) {
  const cell = grid[row][col];
  if (cell.filled) return;

  // place letter
  cell.letterText.setText(currentLetter);
  cell.filled = true;

  // scoring / highlights
  checkRow(row);
  checkColumn(col);

  // advance the deck and refresh UI
  pickNextLetter();
  const scene = grid[0][0].rect.scene;
  updateNextLetterUI(scene, true);
}

// ===================== Word Extraction (leading contiguous) =====================
function getRowWord(row) {
  let s = '';
  for (let c = 0; c < GRID_SIZE; c++) {
    const ch = grid[row][c].letterText.text || '';
    if (!ch) break;
    s += ch;
  }
  return s;
}

function getColWord(col) {
  let s = '';
  for (let r = 0; r < GRID_SIZE; r++) {
    const ch = grid[r][col].letterText.text || '';
    if (!ch) break;
    s += ch;
  }
  return s;
}

function rowFilled(row) {
  return grid[row].every(cell => cell.filled);
}

function colFilled(col) {
  return grid.every(row => row[col].filled);
}

function ptsForLen(L) {
  return L === 3 ? 5 : L === 4 ? 15 : L === 5 ? 25 : 0;
}

// ===================== Cell Coloring =====================
function applyCellColor(row, col) {
  const cell = grid[row][col];

  let color = null;
  let targetAlpha = 0;

  const rowV = cell.rowValid;
  const colV = cell.colValid;
  const inv  = cell.invalidRow || cell.invalidCol;

  if (rowV && colV)      { color = 0x66cc66; targetAlpha = 0.5; } // green
  else if (rowV)         { color = 0xfff066; targetAlpha = 0.5; } // yellow
  else if (colV)         { color = 0x66ccff; targetAlpha = 0.5; } // blue
  else if (inv)          { color = 0xaaaaaa; targetAlpha = 0.5; } // gray

  const hr = cell.highlightRect;
  const scene = hr.scene;

  if (color === null) {
    scene.tweens.add({ targets: hr, alpha: 0, duration: 150 });
  } else {
    hr.setFillStyle(color, 1);
    scene.tweens.add({ targets: hr, alpha: targetAlpha, duration: 200 });
  }
}

function refreshRowHighlights(row) {
  const best = rowBestLen[row];
  const invLen = (best === 0 ? rowInvalidLen[row] : 0);
  for (let c = 0; c < GRID_SIZE; c++) {
    const cell = grid[row][c];
    cell.rowValid   = (c < best);
    cell.invalidRow = (invLen >= 3 && c < invLen);
    applyCellColor(row, c);
  }
  rowScoreLabels[row].setText(rowScores[row] > 0 ? String(rowScores[row]) : '');
}

function refreshColHighlights(col) {
  const best = colBestLen[col];
  const invLen = (best === 0 ? colInvalidLen[col] : 0);
  for (let r = 0; r < GRID_SIZE; r++) {
    const cell = grid[r][col];
    cell.colValid   = (r < best);
    cell.invalidCol = (invLen >= 3 && r < invLen);
    applyCellColor(r, col);
  }
  colScoreLabels[col].setText(colScores[col] > 0 ? String(colScores[col]) : '');
}

// ===================== Supabase Validation =====================
async function validateWord(word) {
  if (!word || word.length < 3) return false;
  const { data, error } = await supabase
    .from("dictionary")
    .select("word")
    .ilike("word", word)
    .maybeSingle();
  if (error) {
    console.error("Supabase error:", error);
    return false;
  }
  return !!data;
}

// ===================== Row/Column Checking with Lock-in =====================
function checkRow(row) {
  const cur = getRowWord(row);
  const len = Math.min(cur.length, 5);

  if (len < 3) {
    rowInvalidLen[row] = 0;
    refreshRowHighlights(row);
    return;
  }

  const test = cur.slice(0, len).toLowerCase();

  validateWord(test).then(isValid => {
    if (isValid) {
      rowInvalidLen[row] = 0;
      const oldLen = rowBestLen[row];
      if (len > oldLen) {
        const newPts = ptsForLen(len);
        score += (newPts - rowScores[row]);
        rowScores[row] = newPts;
        rowBestLen[row] = len;
        scoreText.setText(`Score: ${score}`);
      }
    } else {
      rowInvalidLen[row] = (rowBestLen[row] === 0 ? len : 0);
    }
    refreshRowHighlights(row);
  });
}

function checkColumn(col) {
  const cur = getColWord(col);
  const len = Math.min(cur.length, 5);

  if (len < 3) {
    colInvalidLen[col] = 0;
    refreshColHighlights(col);
    return;
  }

  const test = cur.slice(0, len).toLowerCase();

  validateWord(test).then(isValid => {
    if (isValid) {
      colInvalidLen[col] = 0;
      const oldLen = colBestLen[col];
      if (len > oldLen) {
        const newPts = ptsForLen(len);
        score += (newPts - colScores[col]);
        colScores[col] = newPts;
        colBestLen[col] = len;
        scoreText.setText(`Score: ${score}`);
      }
    } else {
      colInvalidLen[col] = (colBestLen[col] === 0 ? len : 0);
    }
    refreshColHighlights(col);
  });
}
