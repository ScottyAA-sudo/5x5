const config = {
  type: Phaser.AUTO,
  width: 600,
  height: 700,
  backgroundColor: '#fafafa',
  scene: { preload, create, update }
};

const GRID_SIZE = 5;
const CELL_SIZE = 100;
let grid = [];
let currentLetter = '';
let score = 0;
let scoreText;
let nextLetterText;

// Scrabble letter frequencies (no blanks)
const scrabbleDistribution = {
  A: 9, B: 5, C: 3, D: 6, E: 12,
  F: 3, G: 4, H: 3, I: 8, J: 1,
  K: 2, L: 6, M: 4, N: 8, O: 9,
  P: 3, Q: 1, R: 8, S: 5, T: 8,
  U: 5, V: 2, W: 2, X: 1, Y: 2, Z: 1
};
let weightedLetters = [];

// Build weighted array once
for (const [letter, count] of Object.entries(scrabbleDistribution)) {
  for (let i = 0; i < count; i++) {
    weightedLetters.push(letter);
  }
}

new Phaser.Game(config);

function preload() {}

function create() {
  // Draw grid
  for (let row = 0; row < GRID_SIZE; row++) {
    grid[row] = [];
    for (let col = 0; col < GRID_SIZE; col++) {
      const x = col * CELL_SIZE + CELL_SIZE / 2 + (config.width - GRID_SIZE * CELL_SIZE) / 2;
      const y = row * CELL_SIZE + CELL_SIZE / 2 + 50;
      const rect = this.add.rectangle(x, y, CELL_SIZE, CELL_SIZE, 0xffffff)
        .setStrokeStyle(2, 0x000000)
        .setInteractive();

      const letterText = this.add.text(x, y, '', {
        fontSize: '32px',
        color: '#000'
      }).setOrigin(0.5);

      rect.on('pointerdown', () => placeLetter(row, col, letterText));

      grid[row][col] = { rect, letterText, filled: false };
    }
  }

  // Score text
  scoreText = this.add.text(20, 560, 'Score: 0', {
    fontSize: '24px',
    color: '#000'
  });

  // Next letter display
  nextLetterText = this.add.text(20, 600, '', {
    fontSize: '28px',
    color: '#d22'
  });

  // Generate first letter
  currentLetter = getRandomLetter();
  updateNextLetterText();
}

function update() {}

function getRandomLetter() {
  const i = Math.floor(Math.random() * weightedLetters.length);
  return weightedLetters[i];
}

function updateNextLetterText() {
  nextLetterText.setText(`Next Letter: ${currentLetter}`);
}

function placeLetter(row, col, letterText) {
  const cell = grid[row][col];
  if (cell.filled) return; // can't overwrite

  // Place current letter
  cell.letterText.setText(currentLetter);
  cell.filled = true;

  // --- Check scoring ---
  checkRow(row);
  checkColumn(col);

  // New letter for next move
  currentLetter = getRandomLetter();
  updateNextLetterText();
}

function checkRow(row) {
  // Build row string left to right
  let rowWord = '';
  for (let col = 0; col < GRID_SIZE; col++) {
    rowWord += grid[row][col].letterText.text || '';
  }

  // Trim trailing blanks
  rowWord = rowWord.trim();

  // Only count from the start of the row
  if (rowWord.length >= 3) {
    if (rowWord.length >= 5) {
      score += 25;
    } else if (rowWord.length === 4) {
      score += 15;
    } else if (rowWord.length === 3) {
      score += 5;
    }
  } else if (rowFilled(row)) {
    // Row full but no valid word
    score -= 10;
  }

  scoreText.setText(`Score: ${score}`);
}

function checkColumn(col) {
  // Build column string top to bottom
  let colWord = '';
  for (let row = 0; row < GRID_SIZE; row++) {
    colWord += grid[row][col].letterText.text || '';
  }

  // Trim trailing blanks
  colWord = colWord.trim();

  if (colWord.length >= 3) {
    if (colWord.length >= 5) {
      score += 25;
    } else if (colWord.length === 4) {
      score += 15;
    } else if (colWord.length === 3) {
      score += 5;
    }
  } else if (colFilled(col)) {
    // Column full but no valid word
    score -= 10;
  }

  scoreText.setText(`Score: ${score}`);
}

function rowFilled(row) {
  return grid[row].every(cell => cell.filled);
}

function colFilled(col) {
  return grid.every(row => row[col].filled);
}

