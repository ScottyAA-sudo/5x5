// ===================== Supabase =====================
const supabase = window.supabase.createClient(
  "https://bztovbzqubypgdskypjt.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ6dG92YnpxdWJ5cGdkc2t5cGp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkyODM2NTIsImV4cCI6MjA3NDg1OTY1Mn0.DkWqGmN0B-9AUj7kr6B11hhhnB0b2BKFpOsnrixFNQU"
);

if (screen.orientation && screen.orientation.lock) {
  screen.orientation.lock('portrait').catch(() => {});
}

// ===================== Game State =====================
// ===================== Config =====================
const DARK_BG = '#111111';
const LIGHT_TEXT = '#f4f4f4';

const gameConfig = {
  type: Phaser.AUTO,
  backgroundColor: DARK_BG,
  parent: 'phaser-game',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: window.innerWidth,
    height: window.innerHeight
  },
  render: { pixelArt: false, antialias: true }
};

const GRID_SIZE = 5;
let CELL_SIZE = 110;

// Responsive scaling
if (window.innerWidth < 500) {
  CELL_SIZE = 70;
  gameConfig.width = 400;
  gameConfig.height = 700;
} else if (window.innerWidth < 800) {
  CELL_SIZE = 90;
  gameConfig.width = 500;
  gameConfig.height = 850;
}

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
// --- Bigram + vowel bias maps ---
const bigramMap = {
  A: "NTRSL", B: "REALO", C: "HAREO", D: "EARNO", E: "RSTNL",
  F: "REALO", G: "RANEO", H: "EAOIN", I: "NESTR",
  J: "UOEA", K: "NEA", L: "EAST", M: "EAIO", N: "DTEA",
  O: "RNSTL", P: "REALS", Q: "U", R: "ESTOA", S: "TEAOR", T: "HEAOR",
  U: "RSTNL", V: "AEIO", W: "AROE", X: "PEA", Y: "AEIO", Z: "EA"
};
const vowels = ["A","E","I","O","U"];
const consonants = "BCDFGHJKLMNPQRSTVWXYZ".split("");
const DICTIONARY_TABLE = "dictionary";
const COLOR_NONE = 0x1f1f1f;
const COLOR_ROW = 0xe2c45a;
const COLOR_COL = 0x4d9fd1;
const COLOR_BOTH = 0x4fab7a;
const HIGHLIGHT_EMPTY = 0x4c9dff;
const HIGHLIGHT_FILLED = 0xbababa;


// ===================== Scenes =====================

/**
 * Main gameplay scene. All game logic and state lives here.
 * The create() method resets the game.
 */
class MainScene extends Phaser.Scene {
  constructor() {
    super('MainScene');
  }

  preload() {
    // Preload assets here
  }

  create() {
    // --- 1. Initialize Scene-Specific State ---
    this.grid = [];
    this.score = 0;
    this.rowScoreLabels = [];
    this.colScoreLabels = [];
    this.rowScores = Array(GRID_SIZE).fill(0);
    this.colScores = Array(GRID_SIZE).fill(0);
    this.rowBestLen = Array(GRID_SIZE).fill(0);
    this.colBestLen = Array(GRID_SIZE).fill(0);
    this.rowWords = Array(GRID_SIZE).fill(null);
    this.colWords = Array(GRID_SIZE).fill(null);
    this.wordCache = Object.create(null);
    this.currentLetter = '';
    this.swapsUsed = 0;
    this.swapIndicators = [];
  this.isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    this.turnPhase = 'CPU_TURN'; // 'CPU_TURN' | 'PLAYER_TURN' | 'BUSY'
    this.selectedCell = null; 
    this.gameFinished = false;

    // --- 2. Get Canvas Size ---
    const canvasWidth = this.sys.game.scale.gameSize.width;
    const canvasHeight = this.sys.game.scale.gameSize.height;

    const Z = { CELL: 10, HIGHLIGHT: 20, LETTER: 30, DECOR: 15 };

    // --- 3. Grid Placement ---
    const GRID_LEFT = (canvasWidth - GRID_SIZE * CELL_SIZE) / 2;
    const GRID_RIGHT = GRID_LEFT + GRID_SIZE * CELL_SIZE;
    const minGridTop = this.isMobile ? 160 : 110;
    const GRID_TOP = Math.max(minGridTop, (canvasHeight - (GRID_SIZE * CELL_SIZE + 320)) / 2);

    // --- 4. Build Grid ---
    for (let row = 0; row < GRID_SIZE; row++) {
      this.grid[row] = [];
      for (let col = 0; col < GRID_SIZE; col++) {
        const x = GRID_LEFT + col * CELL_SIZE + CELL_SIZE / 2;
        const y = GRID_TOP + row * CELL_SIZE + CELL_SIZE / 2;

        const rect = this.add.rectangle(x, y, CELL_SIZE, CELL_SIZE, COLOR_NONE, 1)
          .setStrokeStyle(2, 0x383838)
          .setInteractive();
        const highlight = this.add.rectangle(x, y, CELL_SIZE - 4, CELL_SIZE - 4, 0xffffff, 0);
        const letterText = this.add.text(x, y, '', {
          fontFamily: 'Arial Black, Verdana, sans-serif',
          fontSize: '32px',
          fontStyle: 'bold',
          color: LIGHT_TEXT
        }).setOrigin(0.5);

        rect.on('pointerdown', () => this.placeLetter(row, col));

        this.grid[row][col] = {
          rect,
          highlightRect: highlight,
          letterText,
          filled: false,
          rowValid: false,
          colValid: false,
          patternCode: 'none'
        };
      }
    }

    // --- 5. Background Watermark ---
    {
      const gridWidth = GRID_SIZE * CELL_SIZE;
      const gridHeight = GRID_SIZE * CELL_SIZE;
      const gridCenterX = (GRID_LEFT + GRID_RIGHT) / 2;
      const gridCenterY = GRID_TOP + gridHeight / 2;
      const bgText = this.add.text(gridCenterX, gridCenterY, '5×5', {
        fontFamily: 'Arial Black, Verdana, sans-serif',
        fontSize: `${CELL_SIZE * 2.6}px`,
        fontStyle: 'bold',
        color: '#ffffff'
      }).setOrigin(0.5).setAlpha(0.10).setAngle(-10).setDepth(Z.DECOR);
      this.tweens.add({
        targets: bgText,
        alpha: { from: 0, to: 0.06 },
        duration: 600,
        ease: 'Quad.easeOut'
      });
    }

    // --- 6. Top UI Row ---
    const uiY = 10;
    const gridCenterX = (GRID_LEFT + GRID_RIGHT) / 2;
    const gridPixelWidth = GRID_SIZE * CELL_SIZE;
    const instructionWidth = gridPixelWidth - 24;
    const nextLetterBottom = uiY + 80;
    const turnMaxBottom = Math.max(GRID_TOP - 16, nextLetterBottom + 20);
    this.turnTextBounds = {
      minTop: nextLetterBottom + 6,
      preferredTop: this.isMobile ? nextLetterBottom + 10 : nextLetterBottom + 18,
      maxBottom: turnMaxBottom
    };
    // Removed "On Deck" label; nextLetterBox displays current CPU letter.
    this.nextLetterBox = this.add.rectangle(gridCenterX, uiY, 80, 80, 0x1c1c1c, 1)
      .setStrokeStyle(3, 0x555555)
      .setOrigin(0.5, 0);
    this.nextLetterText = this.add.text(gridCenterX, uiY + 40, '', {
      fontFamily: 'Arial Black, Verdana, sans-serif',
      fontSize: '48px',
      fontStyle: 'bold',
      color: '#82c4ff'
    }).setOrigin(0.5);
    this.scoreText = this.add.text(GRID_RIGHT, uiY + 12, 'Score: 0', {
      fontFamily: 'Arial Black, Verdana, sans-serif',
      fontSize: '20px',
      fontStyle: 'bold',
      color: LIGHT_TEXT
    }).setOrigin(1, 0.5);
    this.turnText = this.add.text(gridCenterX, this.turnTextBounds.preferredTop, '', {
      fontFamily: 'Arial Black, Verdana, sans-serif',
      fontSize: this.isMobile ? '14px' : '16px',
      fontStyle: 'bold',
      color: LIGHT_TEXT,
      align: 'center',
      wordWrap: {
        width: instructionWidth,
        useAdvancedWrap: true
      },
      lineSpacing: 4
    }).setOrigin(0.5, 0);
    this.layoutTurnText();

    // --- 7. Row & Column Labels ---
    for (let r = 0; r < GRID_SIZE; r++) {
      const x = GRID_LEFT + GRID_SIZE * CELL_SIZE + 16;
      const y = GRID_TOP + r * CELL_SIZE + CELL_SIZE / 2;
      this.rowScoreLabels[r] = this.add.text(x, y, '', {
        fontFamily: 'Arial Black, Verdana, sans-serif',
        fontSize: '16px',
        fontStyle: 'bold',
        color: '#cfcfcf'
      }).setOrigin(0, 0.5);
    }
    for (let c = 0; c < GRID_SIZE; c++) {
      const x = GRID_LEFT + c * CELL_SIZE + CELL_SIZE / 2;
      const y = GRID_TOP + GRID_SIZE * CELL_SIZE + 8;
      this.colScoreLabels[c] = this.add.text(x, y, '', {
        fontFamily: 'Arial Black, Verdana, sans-serif',
        fontSize: '16px',
        fontStyle: 'bold',
        color: '#cfcfcf'
      }).setOrigin(0.5, 0);
    }

    this.refreshCellColors();

    // --- 8. Swap Lights ---
    const lightsY = GRID_TOP + GRID_SIZE * CELL_SIZE + 60;
    const startX = canvasWidth / 2 - 60;
    for (let i = 0; i < 3; i++) {
      const light = this.add.circle(startX + i * 60, lightsY, 12, 0x2d2d2d);
      light.setStrokeStyle(2, 0x555555);
      this.swapIndicators.push(light);
    }
    this.updateSwapIndicators();
    this.add.text(canvasWidth / 2, lightsY + 20, 'Swaps Used', {
      fontFamily: 'Verdana, sans-serif',
      fontSize: '12px',
      color: '#c0c0c0'
    }).setOrigin(0.5, 0);
    
    // --- 9. Rules Box ---
    {
      const boxY = lightsY + 60;
      const boxWidth = Math.min(canvasWidth * 0.9, 480);
      const boxHeight = 200;
      const boxX = canvasWidth / 2;
      this.add.rectangle(boxX, boxY + boxHeight / 2, boxWidth, boxHeight, 0x1b1b1b, 0.95).setStrokeStyle(2, 0x444444).setOrigin(0.5).setDepth(0);
      const title = this.add.text(boxX, 0, '3-letter words = 5 pts | 4-letter = 15 pts | 5-letter = 25 pts', {
        fontFamily: 'Arial Black, Verdana, sans-serif',
        fontSize: '12px',
        color: '#dddddd',
      }).setOrigin(0.5, 0);
      const rules = [
        '• Words must start from the top row or far-left column',
        '• You can make 3 "swaps" overwriting a placed letter',
        '• The game ends when all letters have been placed',
      ];
      const titleHeight = 18;
      const rulesHeight = rules.length * 22;
      const legendHeight = 26;
      const totalContentHeight = titleHeight + rulesHeight + legendHeight + 40;
      const startY = boxY + (boxHeight - totalContentHeight) / 2;
      title.setY(startY);
      let textY = startY + titleHeight + 8;
      rules.forEach((line) => {
        this.add.text(boxX, textY, line, {
          fontFamily: 'Verdana, sans-serif',
          fontSize: '14px',
          color: '#cfcfcf',
          align: 'center',
          wordWrap: { width: boxWidth - 60 },
        }).setOrigin(0.5, 0);
        textY += 22;
      });
      this.add.line(boxX, textY + 6, boxX - boxWidth / 2 + 10, textY + 6, boxX + boxWidth / 2 - 10, textY + 6, 0x444444).setOrigin(0.5, 0).setLineWidth(1);
      const legendY = textY + 28;
      const legendSpacing = 110;
      const drawLegendItem = (color, label, offsetX) => {
        const rect = this.add.rectangle(boxX + offsetX, legendY, 18, 18, color, 0.7).setOrigin(0.5);
        rect.setStrokeStyle(1, 0x666666, 0.9);
        this.add.text(boxX + offsetX + 16, legendY, label, {
          fontFamily: 'Verdana, sans-serif',
          fontSize: '14px',
          color: '#dddddd',
        }).setOrigin(0, 0.5);
      };
      drawLegendItem(COLOR_ROW, 'Horizontal', -legendSpacing);
      drawLegendItem(COLOR_COL, 'Vertical', 0);
      drawLegendItem(COLOR_BOTH, 'Both', legendSpacing);
    }

    // --- 10. Setup Input and Start Game ---
    this.setupKeyboardInput();
    this.createMobileKeyboard();
    this.startCpuTurn();
  }

  update() {
    // Runs every frame
  }

  // ======================================================
// ===============   TURN CONTROL  (Class Methods)  =====
// ======================================================

/**
 * Main entry point for any letter placement.
 */
async placeLetter(row, col) {
  if (this.gameFinished || this.turnPhase === "BUSY") return;

  if (this.turnPhase === "CPU_TURN") {
    console.log('[TURN] placeLetter -> CPU_TURN click', { row, col, turnPhase: this.turnPhase });
    return this.handleCpuPlacement(row, col);
  }

  if (this.turnPhase === "PLAYER_TURN") {
    console.log('[TURN] placeLetter -> PLAYER_TURN click', { row, col, turnPhase: this.turnPhase });
    return this.handlePlayerClick(row, col);
  }
}
/**
 * CPU prepares its next letter and waits for the player to place it.
 */
startCpuTurn() {
  if (this.gameFinished) return;
  if (this.isBoardFull()) return this.finishRound();
  console.log('[TURN] startCpuTurn() — entering CPU_TURN');
  this.turnPhase = "CPU_TURN";
  this.currentLetter = this.pickNextLetter();
  this.updateNextLetterUI(true);
  const swapsLeft = Math.max(0, 3 - (this.swapsUsed || 0));
  this.setTurnMessage(`Place this letter in an empty square or replace an occupied square (Swaps left: ${swapsLeft}).`);
  this.clearSelectionState();
}

/**
 * CPU places its current letter, then passes control to the player.
 */
async handleCpuPlacement(row, col) {
  const cell = this.grid[row][col];
  if (!cell) return;

  const replacingExisting = cell.filled;
  if (replacingExisting && this.swapsUsed >= 3) {
    this.setTurnMessage("All swaps used. Pick an empty square for the CPU letter.");
    return;
  }

  if (replacingExisting) {
    this.swapsUsed++;
    this.updateSwapIndicators();
  }

  console.log('[TURN] handleCpuPlacement()', { row, col, currentLetter: this.currentLetter, replacingExisting });
  cell.letterText.setText(this.currentLetter);
  cell.filled = true;
  this.turnPhase = "BUSY";

  await this.adjudicatePlacement(cell);

  // CPU done → Player turn
  if (this.isBoardFull()) {
    this.finishRound();
    return;
  }

  this.startPlayerTurn();
}



/**
 * Starts the Player's turn.
 */
startPlayerTurn() {
  if (this.gameFinished) return;
  if (this.isBoardFull()) return this.finishRound();
  console.log('[TURN] startPlayerTurn() — entering PLAYER_TURN');
  this.turnPhase = "PLAYER_TURN";
  this.currentLetter = ""; // clear CPU letter
  this.updateNextLetterUI(false);
  if (this.isMobile) {
    this.setTurnMessage("Your turn: tap a square (or occupied to swap), then pick a letter below to lock it in.");
  } else {
    this.setTurnMessage("Your turn: pick a square (or occupied to swap), then press a letter key to place it.");
  }
  this.clearSelectionState();
}


/**
 * Handles the player clicking a cell to select it.
 */
handlePlayerClick(row, col) {
  if (this.turnPhase !== "PLAYER_TURN") return;
  const cell = this.grid[row][col];
  if (!cell) return;
  // allow selecting an occupied cell only if swaps remain
  if (cell.filled && (this.swapsUsed >= 3)) {
    this.setTurnMessage("All swaps used. Pick an empty square for your letter.");
    return;
  }
  this.highlightSelectedCell(row, col);
  if (this.isMobile) {
    this.showMobileKeyboard();
    window.requestAnimationFrame(() => window.scrollTo(0, 0));
  }
}

/**
 * Finalizes the player's move after they press Enter.
 */
async finalizePlayerLetter(cell) {
  if (!cell || this.gameFinished) return;

  const letter = cell.letterText.text?.toUpperCase() || "";
  if (!letter.match(/^[A-Z]$/)) {
    console.warn("Invalid or empty letter.");
    console.log('[TURN] finalizePlayerLetter() — invalid, handing to CPU');
    this.startCpuTurn();
    return;
  }

  console.log('[TURN] finalizePlayerLetter()', { letter });
  this.turnPhase = "BUSY";
  const wasFilled = !!cell.filled;
  if (wasFilled) {
    // swapping an already-placed letter
    if (this.swapsUsed >= 3) {
      console.warn('No swaps remaining');
      this.startCpuTurn();
      return;
    }
    this.swapsUsed++;
    this.updateSwapIndicators();
  }

  cell.filled = true;
  cell.letterText.setText(letter);
  this.currentLetter = letter;

  try {
    await this.adjudicatePlacement(cell);
  } catch (err) {
    console.error("Adjudication error:", err);
  }

  if (this.isBoardFull()) {
    this.finishRound();
    return;
  }

  // After adjudication, hand control back to CPU
  console.log('[TURN] finalizePlayerLetter() — switching to CPU_TURN');
  this.startCpuTurn();
}

  /**
   * Sets up the keyboard listener for this scene.
   */
  setupKeyboardInput() {
    this.input.keyboard.on("keydown", async (e) => {
    // Debug: always log keydowns to trace missing events
    console.log('[KEY] keydown', { key: e.key, turnPhase: this.turnPhase, hasSelected: !!this.selectedCell });
    if (this.turnPhase !== "PLAYER_TURN" || !this.selectedCell) return;

    const raw = e.key;
    const k = raw.toUpperCase();
    if (k === "ESCAPE") return this.cancelSelection();

    // Only accept single-letter keys A-Z
    if (/^[a-zA-Z]$/.test(raw)) {
      this.selectedCell.letterText.setText(k);
      console.log('[KEY] letter typed – auto-finalizing', { k });
      try {
        this.turnPhase = "BUSY";
        const cellToFinalize = this.selectedCell;
        await this.finalizePlayerLetter(cellToFinalize);
        this.clearSelectionState();
      } catch (err) {
        console.error('Error auto-finalizing letter:', err);
      }
      return;
    }

    if (k === "ENTER" && this.selectedCell?.letterText.text) {
      // Lock input
      this.turnPhase = "BUSY";

      // Keep a live reference before clearing
      const cellToFinalize = this.selectedCell;

      await this.finalizePlayerLetter(cellToFinalize);

      // Now clear highlight after finalization
      this.clearSelectionState();
    }
  });
}

  /**
   * Builds a lightweight on-screen keyboard for mobile users.
   */
  createMobileKeyboard() {
    if (!this.isMobile || this.mobileKeyboard) return;

    const container = document.createElement('div');
    container.id = 'mobile-letter-keyboard';
    container.style.position = 'fixed';
    container.style.left = '50%';
    container.style.bottom = '12px';
    container.style.transform = 'translateX(-50%)';
    container.style.display = 'none';
    container.style.flexDirection = 'column';
    container.style.alignItems = 'center';
    container.style.gap = '8px';
    container.style.padding = '12px 16px 16px';
    container.style.borderRadius = '18px';
    container.style.background = 'rgba(12, 12, 12, 0.96)';
    container.style.boxShadow = '0 10px 32px rgba(0,0,0,0.6)';
    container.style.backdropFilter = 'blur(4px)';
    container.style.zIndex = '2000';
    container.style.userSelect = 'none';

    const rows = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];
    rows.forEach((row, idx) => {
      const rowDiv = document.createElement('div');
      rowDiv.style.display = 'flex';
      rowDiv.style.justifyContent = 'center';
      rowDiv.style.gap = '6px';
      if (idx === 2) rowDiv.style.paddingLeft = '22px';

      row.split('').forEach((letter) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = letter;
        btn.style.width = '38px';
        btn.style.height = '48px';
        btn.style.borderRadius = '10px';
        btn.style.border = '1px solid rgba(255,255,255,0.12)';
        btn.style.background = 'linear-gradient(180deg, #2f2f2f, #1a1a1a)';
        btn.style.color = '#f5f5f5';
        btn.style.fontSize = '18px';
        btn.style.fontFamily = 'Arial Black, Verdana, sans-serif';
        btn.style.fontWeight = '600';
        btn.style.boxShadow = '0 2px 5px rgba(0,0,0,0.45)';
        btn.style.padding = '0';
        btn.style.touchAction = 'manipulation';
        btn.addEventListener('click', () => this.handleMobileLetter(letter));
        rowDiv.appendChild(btn);
      });

      container.appendChild(rowDiv);
    });

    document.body.appendChild(container);
    this.mobileKeyboard = container;

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroyMobileKeyboard());
    this.events.once(Phaser.Scenes.Events.DESTROY, () => this.destroyMobileKeyboard());
  }

  showMobileKeyboard() {
    if (!this.isMobile || !this.mobileKeyboard) return;
    this.mobileKeyboard.style.display = 'flex';
  }

  hideMobileKeyboard() {
    if (!this.isMobile || !this.mobileKeyboard) return;
    this.mobileKeyboard.style.display = 'none';
  }

  async handleMobileLetter(letter) {
    if (this.turnPhase !== "PLAYER_TURN" || !this.selectedCell) return;
    this.selectedCell.letterText.setText(letter);
    this.hideMobileKeyboard();
    try {
      this.turnPhase = "BUSY";
      const cellToFinalize = this.selectedCell;
      await this.finalizePlayerLetter(cellToFinalize);
      this.clearSelectionState();
    } catch (err) {
      console.error('Error finalizing mobile letter:', err);
    }
  }

  destroyMobileKeyboard() {
    if (!this.mobileKeyboard) return;
    this.mobileKeyboard.remove();
    this.mobileKeyboard = null;
  }

  /**
   * Finds a random empty cell on the grid.
   */
  findRandomEmptyCell() {
  const empties = [];
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      if (!this.grid[r][c].filled) empties.push([r, c]);
    }
  }
  if (!empties.length) return [null, null];
  return Phaser.Utils.Array.GetRandom(empties);
}

isBoardFull() {
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      if (!this.grid[r][c].filled) {
        return false;
      }
    }
  }
  return true;
}

finishRound() {
  if (this.gameFinished) return;
  this.gameFinished = true;
  this.turnPhase = "BUSY";
  this.updateNextLetterUI(false);
  this.clearSelectionState();
  this.setTurnMessage("Board complete! Final score coming up...");

  const summaryWords = this.collectSummaryWords();
  const boardSnapshot = this.captureBoardSnapshot();

  this.time.delayedCall(2000, () => {
    this.scene.start("SummaryScene", {
      words: summaryWords,
      total: this.score,
      boardSnapshot
    });
  });
}



  // ======================================================
  // ===============   SCORING & HELPERS  ================
  // ======================================================
  
  async recomputeRow(r) {
    const word = this.buildRowWord(r);
    const result = await this.scoreWord(word);
    const { score, length, isValid, matchedWord } = result;

    this.rowScores[r] = score;
    this.applyRowValidity(r, isValid, length);

    if (isValid) {
      this.rowBestLen[r] = Math.max(this.rowBestLen[r] || 0, length);
      this.rowWords[r] = { word: matchedWord, score, direction: `Row ${r + 1}` };
    } else {
      this.rowWords[r] = null;
    }

    if (this.rowScoreLabels[r]) {
      if (word.length >= 3) {
        const text = isValid ? `${score} (${length})` : `0 (${length})`;
        this.rowScoreLabels[r].setText(text);
      } else {
        this.rowScoreLabels[r].setText("");
      }
    }
  }
  
  async recomputeColumn(c) {
    const word = this.buildColumnWord(c);
    const result = await this.scoreWord(word);
    const { score, length, isValid, matchedWord } = result;

    this.colScores[c] = score;
    this.applyColumnValidity(c, isValid, length);

    if (isValid) {
      this.colBestLen[c] = Math.max(this.colBestLen[c] || 0, length);
      this.colWords[c] = { word: matchedWord, score, direction: `Col ${c + 1}` };
    } else {
      this.colWords[c] = null;
    }

    if (this.colScoreLabels[c]) {
      if (word.length >= 3) {
        const text = isValid ? `${score}\n(${length})` : `0\n(${length})`;
        this.colScoreLabels[c].setText(text);
      } else {
        this.colScoreLabels[c].setText("");
      }
    }
  }
  
  buildRowWord(r) {
    let word = "";
    for (let c = 0; c < GRID_SIZE; c++) {
      const ch = this.grid[r][c]?.letterText?.text || "";
      if (!ch) break;
      word += ch.toUpperCase();
    }
    return word;
  }

  buildColumnWord(c) {
    let word = "";
    for (let r = 0; r < GRID_SIZE; r++) {
      const ch = this.grid[r][c]?.letterText?.text || "";
      if (!ch) break;
      word += ch.toUpperCase();
    }
    return word;
  }

  scoreForLength(len) {
    if (len === 3) return 5;
    if (len === 4) return 15;
    if (len >= 5) return 25;
    return 0;
  }

  async scoreWord(word) {
    const contiguousLength = word.length;
    if (contiguousLength < 3) {
      return { score: 0, length: contiguousLength, isValid: false, matchedWord: "" };
    }

    for (let len = contiguousLength; len >= 3; len--) {
      const candidate = word.slice(0, len);
      const isValid = await this.validateWord(candidate);
      if (isValid) {
        return {
          score: this.scoreForLength(len),
          length: len,
          isValid: true,
          matchedWord: candidate
        };
      }
    }

    return { score: 0, length: contiguousLength, isValid: false, matchedWord: "" };
  }

  async validateWord(word) {
    const cleaned = (word || "").toUpperCase();
    if (cleaned.length < 3) return false;

    const cacheKey = cleaned.toLowerCase();
    if (this.wordCache[cacheKey] !== undefined) {
      return this.wordCache[cacheKey];
    }

    let isValid = false;
    try {
      const normalized = cacheKey;
      const { data, error } = await supabase
        .from(DICTIONARY_TABLE)
        .select("word")
        .eq("word", normalized)
        .limit(1);

      if (error) {
        console.error("Supabase dictionary error:", error);
      } else {
        isValid = Array.isArray(data) && data.length > 0;
      }
    } catch (err) {
      console.error("Dictionary lookup failed:", err);
    }

    this.wordCache[cacheKey] = isValid;
    return isValid;
  }

  applyRowValidity(rowIndex, isValid, length) {
    for (let c = 0; c < GRID_SIZE; c++) {
      const cell = this.grid[rowIndex][c];
      cell.rowValid = Boolean(isValid && c < length);
    }
  }

  applyColumnValidity(colIndex, isValid, length) {
    for (let r = 0; r < GRID_SIZE; r++) {
      const cell = this.grid[r][colIndex];
      cell.colValid = Boolean(isValid && r < length);
    }
  }

  refreshCellColors() {
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const cell = this.grid[r][c];
        let fill = COLOR_NONE;
        let pattern = 'none';
        if (cell.rowValid && cell.colValid) {
          fill = COLOR_BOTH;
          pattern = 'both';
        } else if (cell.rowValid) {
          fill = COLOR_ROW;
          pattern = 'row';
        } else if (cell.colValid) {
          fill = COLOR_COL;
          pattern = 'col';
        }
        cell.rect.setFillStyle(fill, 1);
        cell.patternCode = pattern;
      }
    }
  }

  captureBoardSnapshot() {
    return this.grid.map((row) =>
      row.map((cell) => ({
        pattern: cell.patternCode || 'none',
        letter: cell.letterText?.text || ''
      }))
    );
  }

  collectSummaryWords() {
    const results = [];
    this.rowWords.forEach((entry) => {
      if (entry) results.push({ ...entry });
    });
    this.colWords.forEach((entry) => {
      if (entry) results.push({ ...entry });
    });
    return results;
  }
  
  findCell(cellToFind) {
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        if (this.grid[r][c] === cellToFind) {
          return [r, c];
        }
      }
    }
    return null;
  }

  async adjudicatePlacement(cell) {
    const pos = this.findCell(cell);
    if (!pos) return;
    
    const [r, c] = pos;
    await Promise.all([this.recomputeRow(r), this.recomputeColumn(c)]);
    this.refreshCellColors();
    
    let newScore = 0;
    this.rowScores.forEach(s => newScore += s);
    this.colScores.forEach(s => newScore += s);
    this.score = newScore;
    
    this.scoreText.setText(`Score: ${this.score}`);
  }

  // ======================================================
  // ===============   UI & LETTER PICKERS  ==============
  // ======================================================

  updateNextLetterUI(visible = true) {
    if (!this.nextLetterText) return;
    this.nextLetterText.setText(visible ? this.currentLetter : "");
  }

  setTurnMessage(message) {
    if (!this.turnText) return;
    this.turnText.setText(message || "");
    this.layoutTurnText();
  }

  layoutTurnText() {
    if (!this.turnText || !this.turnTextBounds) return;
    const { minTop, preferredTop, maxBottom } = this.turnTextBounds;
    const height = this.turnText.height || 0;
    let top = Math.max(minTop, preferredTop);
    if (top + height > maxBottom) {
      top = Math.max(minTop, maxBottom - height);
    }
    this.turnText.setY(top);
  }

  /**
   * Clears only the selection *state* (highlight and variable).
   * Does NOT clear temporary text.
   */
  clearSelectionState() {
    if (this.selectedCell) {
      this.selectedCell.highlightRect.setFillStyle(0xffffff, 0);
      this.selectedCell = null;
    }
    if (this.isMobile) this.hideMobileKeyboard();
  }

  /**
   * Cancels a selection (on ESCAPE).
   * This DOES clear temporary text.
   */
  cancelSelection() {
    if (this.selectedCell) {
      if (!this.selectedCell.filled) {
        this.selectedCell.letterText.setText('');
      }
      this.selectedCell.highlightRect.setFillStyle(0xffffff, 0);
      this.selectedCell = null;
    }
    if (this.isMobile) this.hideMobileKeyboard();
  }

  /**
   * Highlights a new cell and cleans up the previous one.
   */
  highlightSelectedCell(row, col) {
    // 1. Clean up the OLD cell
  if (this.selectedCell) {
  this.selectedCell.highlightRect.setFillStyle(0xffffff, 0);
  // Only clear if it’s blank AND not finalized
  if (!this.selectedCell.filled && this.selectedCell.letterText.text === '') {
    this.selectedCell.letterText.setText('');
  }
}


    // 2. Set the NEW cell
    const cell = this.grid[row][col];
    // use a different highlight color for swapping (occupied cell)
    if (cell.filled) {
      cell.highlightRect.setFillStyle(HIGHLIGHT_FILLED, 0.55);
    } else {
      cell.highlightRect.setFillStyle(HIGHLIGHT_EMPTY, 0.35);
    }
    this.selectedCell = cell;
  }

  updateSwapIndicators() {
    const used = Math.min(3, this.swapsUsed || 0);
    for (let i = 0; i < this.swapIndicators.length; i++) {
      const light = this.swapIndicators[i];
      if (i < used) {
        light.setFillStyle(COLOR_BOTH);
      } else {
        light.setFillStyle(0x2d2d2d);
      }
    }
  }

  weightedPick(list) {
    if (typeof list === "string") list = list.split("");
    return list[Math.floor(Math.random() * list.length)];
  }

  getVowelRatio() {
    let letters = [];
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const ch = this.grid[r][c]?.letterText?.text || "";
        if (ch) letters.push(ch);
      }
    }
    if (!letters.length) return 0.4;
    return letters.filter(l => vowels.includes(l)).length / letters.length;
  }

  pickNextLetter() {
    const useBigram = Math.random() < 0.7;
    const v = this.getVowelRatio();
    
    if (v < 0.35 && Math.random() < 0.4) {
      return this.weightedPick(vowels);
    }
    if (v > 0.55 && Math.random() < 0.4) {
      return this.weightedPick(consonants);
    }
    
    const opts = bigramMap[this.currentLetter];
    return (useBigram && opts) ? this.weightedPick(opts) : this.weightedPick(weightedLetters);
  }
} // <-- END OF MainScene CLASS


// ===================== Summary Scene =====================
class SummaryScene extends Phaser.Scene {
  constructor() { super('SummaryScene'); }

  async create(data) {
    const { words = [], total = 0, boardSnapshot = [] } = data;
    const { width, height } = this.sys.game.scale.gameSize;
    const centerX = width / 2;
    const centerY = height / 2;

    const cardWidth = Math.min(520, width * 0.9);
    const cardHeight = Math.min(620, height * 0.85);

    this.add.rectangle(centerX, centerY, width, height, 0x000000, 0.55).setDepth(0);
    const card = this.add.rectangle(centerX, centerY, cardWidth, cardHeight, 0x1a1a1a)
      .setStrokeStyle(3, 0x555555)
      .setOrigin(0.5)
      .setDepth(0);
    this.tweens.add({ targets: card, alpha: 1, duration: 250 });

    this.add.text(centerX, centerY - cardHeight / 2 + 50, 'Game Over', {
      fontFamily: 'Arial Black, Verdana, sans-serif',
      fontSize: '32px',
      color: LIGHT_TEXT
    }).setOrigin(0.5).setDepth(1);

    this.add.text(centerX, centerY - cardHeight / 2 + 100, `Total Score: ${total}`, {
      fontFamily: 'Arial Black, Verdana, sans-serif',
      fontSize: '22px',
      color: '#f0f0f0'
    }).setOrigin(0.5).setDepth(1);

    const boardTopY = centerY - cardHeight / 2 + 140;
    const hasBoard = Array.isArray(boardSnapshot) && boardSnapshot.length && Array.isArray(boardSnapshot[0]);
    if (hasBoard) {
      this.add.text(centerX, boardTopY - 20, 'Final Board', {
        fontFamily: 'Arial Black, Verdana, sans-serif',
        fontSize: '18px',
        color: '#cccccc'
      }).setOrigin(0.5).setDepth(1);
    }

    const renderBoardPreview = () => {
      if (!hasBoard) return boardTopY;
      const rows = boardSnapshot.length;
      const cols = boardSnapshot[0]?.length || 0;
      if (!cols) return boardTopY;

      const availableWidth = Math.max(140, cardWidth - 200);
      const availableHeight = Math.max(120, cardHeight * 0.22);
      const cellSize = Math.min(18, availableWidth / cols, availableHeight / rows);
      const boardWidth = cols * cellSize;
      const boardHeight = rows * cellSize;
      const startX = centerX - boardWidth / 2;
      const startY = boardTopY;

      const colorForPattern = (pattern) => {
        if (pattern === 'row') return COLOR_ROW;
        if (pattern === 'col') return COLOR_COL;
        if (pattern === 'both') return COLOR_BOTH;
        return 0x2b2b2b;
      };

      boardSnapshot.forEach((row, rIdx) => {
        row.forEach((cell, cIdx) => {
          const pattern = this.getCellPattern(cell);
          const color = colorForPattern(pattern);
          const alpha = pattern === 'none' ? 0.18 : 1;
          this.add.rectangle(
            startX + cIdx * cellSize + cellSize / 2,
            startY + rIdx * cellSize + cellSize / 2,
            cellSize - 4,
            cellSize - 4,
            color,
            alpha
          ).setOrigin(0.5).setDepth(1).setStrokeStyle(1, 0x555555, 0.6);
      });
      });

      const hitArea = this.add.rectangle(
        centerX,
        startY + boardHeight / 2,
        boardWidth + 32,
        boardHeight + 32,
        0xffffff,
        0
      ).setOrigin(0.5).setDepth(2).setInteractive({ useHandCursor: true });
      hitArea.on('pointerdown', () => this.showBoardOverlay(boardSnapshot));

      this.add.text(centerX, startY + boardHeight + 12, 'Tap board to enlarge', {
        fontSize: '12px',
        color: '#bbbbbb',
        fontFamily: 'Verdana, sans-serif'
      }).setOrigin(0.5).setDepth(1);

      return startY + boardHeight + 24;
    };

    const boardBottom = renderBoardPreview();

    const sortedWords = [...words].sort((a, b) => b.score - a.score);

    const headerY = boardBottom + 30;
    this.add.text(centerX - cardWidth / 2 + 40, headerY, 'Word', { fontSize: '16px', color: '#bcbcbc' }).setDepth(1);
    this.add.text(centerX + cardWidth / 2 - 40, headerY, 'Pts', { fontSize: '16px', color: '#bcbcbc' })
      .setOrigin(1, 0).setDepth(1);

    let y = headerY + 25;
    sortedWords.forEach(w => {
      this.add.text(centerX - cardWidth / 2 + 40, y, w.word, { fontSize: '16px', color: LIGHT_TEXT }).setDepth(1);
      this.add.text(centerX + cardWidth / 2 - 40, y, w.score.toString(), { fontSize: '16px', color: LIGHT_TEXT })
        .setOrigin(1, 0).setDepth(1);
      y += 26;
    });

    const buttonHeight = 44;
    const buttonGap = 12;
    const buttonConfigs = [
      { label: 'Leaderboard', action: () => this.scene.start('LeaderboardScene') },
      { label: 'Submit Score', action: () => this.scene.start('NameEntryScene', { total, words }) },
      { label: 'New Game', action: () => this.scene.start('MainScene') }
    ];
    const isNarrow = width < 520;
    const makeBtn = (label, offsetX, y, btnWidth, onClick) => {
      const btn = this.add.rectangle(centerX + offsetX, y, btnWidth, buttonHeight, 0x2a2a2a)
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true })
        .setDepth(1);
      this.add.text(centerX + offsetX, y, label, {
        fontFamily: 'Arial Black, Verdana, sans-serif',
        fontSize: '18px',
        color: LIGHT_TEXT
      }).setOrigin(0.5).setDepth(1);
      btn.on('pointerover', () => btn.setFillStyle(0x444444));
      btn.on('pointerout',  () => btn.setFillStyle(0x2a2a2a));
      btn.on('pointerdown', onClick);
    };

    if (isNarrow) {
      const usableWidth = Math.max(Math.min(cardWidth - 60, 280), 180);
      const totalStackHeight = buttonConfigs.length * buttonHeight + (buttonConfigs.length - 1) * buttonGap;
      const bottomMargin = 24;
      const blockBottom = centerY + cardHeight / 2 - bottomMargin;
      const startY = blockBottom - totalStackHeight + buttonHeight / 2;
      buttonConfigs.forEach((cfg, idx) => {
        const yPos = startY + idx * (buttonHeight + buttonGap);
        makeBtn(cfg.label, 0, yPos, usableWidth, cfg.action);
      });
    } else {
      const buttonY = centerY + cardHeight / 2 - 60;
      const offsets = [-180, 0, 180];
      const btnWidth = 160;
      buttonConfigs.forEach((cfg, idx) => {
        makeBtn(cfg.label, offsets[idx], buttonY, btnWidth, cfg.action);
      });
    }

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.hideBoardOverlay());
  }

  getCellPattern(cell) {
    if (cell && typeof cell === 'object') return cell.pattern || 'none';
    return cell || 'none';
  }

  getCellLetter(cell) {
    if (cell && typeof cell === 'object') return cell.letter || '';
    return '';
  }

  showBoardOverlay(boardSnapshot = []) {
    if (!boardSnapshot?.length || !boardSnapshot[0]?.length) return;
    this.hideBoardOverlay();

    const { width, height } = this.sys.game.scale.gameSize;
    const overlay = this.add.container(0, 0).setDepth(40);
    this.boardOverlay = overlay;

    const scrim = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.78)
      .setInteractive()
      .on('pointerdown', () => this.hideBoardOverlay());
    overlay.add(scrim);

    const cardWidth = Math.min(640, width * 0.92);
    const cardHeight = Math.min(720, height * 0.9);
    const card = this.add.rectangle(width / 2, height / 2, cardWidth, cardHeight, 0x161616, 0.98)
      .setStrokeStyle(2, 0x555555);
    overlay.add(card);

    const title = this.add.text(width / 2, card.y - cardHeight / 2 + 30, 'Final Board', {
      fontFamily: 'Arial Black, Verdana, sans-serif',
      fontSize: '26px',
      color: LIGHT_TEXT
    }).setOrigin(0.5);
    overlay.add(title);

    const subtitle = this.add.text(width / 2, title.y + 24, 'Tap "Show Letters" to toggle view', {
      fontFamily: 'Verdana, sans-serif',
      fontSize: '12px',
      color: '#bbbbbb'
    }).setOrigin(0.5);
    overlay.add(subtitle);

    const rows = boardSnapshot.length;
    const cols = boardSnapshot[0].length;
    const boardHolder = this.add.container(0, 0);
    overlay.add(boardHolder);

    const boardAreaHeight = cardHeight - 220;
    const boardAreaWidth = cardWidth - 100;
    const cellSize = Math.min(56, boardAreaWidth / cols, boardAreaHeight / rows);
    const startX = width / 2 - (cols * cellSize) / 2;
    const startY = subtitle.y + 30;

    const colorForPattern = (pattern) => {
      if (pattern === 'row') return COLOR_ROW;
      if (pattern === 'col') return COLOR_COL;
      if (pattern === 'both') return COLOR_BOTH;
      return 0x2b2b2b;
    };

    let showLetters = false;
    const redrawBoard = () => {
      boardHolder.removeAll(true);
      boardSnapshot.forEach((row, rIdx) => {
        row.forEach((cell, cIdx) => {
          const pattern = this.getCellPattern(cell);
          const color = colorForPattern(pattern);
          const alpha = pattern === 'none' ? 0.2 : 1;
          const rect = this.add.rectangle(
            startX + cIdx * cellSize + cellSize / 2,
            startY + rIdx * cellSize + cellSize / 2,
            cellSize - 6,
            cellSize - 6,
            color,
            alpha
          ).setOrigin(0.5).setStrokeStyle(1.5, 0x555555, 0.7);
          boardHolder.add(rect);

          if (showLetters) {
            const letter = (this.getCellLetter(cell) || '').toUpperCase();
            if (letter) {
              const letterText = this.add.text(
                rect.x,
                rect.y,
                letter,
                {
                  fontFamily: 'Arial Black, Verdana, sans-serif',
                  fontSize: `${Math.max(16, cellSize / 2)}px`,
                  color: '#f3f3f3'
                }
              ).setOrigin(0.5);
              boardHolder.add(letterText);
            }
          }
        });
      });
    };

    redrawBoard();

    const buttonHeight = 44;
    const buttonGap = 12;
    const buttonAreaBottom = card.y + cardHeight / 2 - 24;

    const addButton = (label, x, y, widthPx, handler) => {
      const btn = this.add.rectangle(x, y, widthPx, buttonHeight, 0x2a2a2a)
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      const text = this.add.text(x, y, typeof label === 'function' ? label() : label, {
        fontFamily: 'Arial Black, Verdana, sans-serif',
        fontSize: '16px',
        color: LIGHT_TEXT
      }).setOrigin(0.5);
      text.setInteractive({ useHandCursor: true });

      const invokeHandler = (event) => {
        event?.stopPropagation?.();
        handler();
      };

      btn.on('pointerover', () => btn.setFillStyle(0x444444));
      btn.on('pointerout', () => btn.setFillStyle(0x2a2a2a));
      btn.on('pointerdown', invokeHandler);
      text.on('pointerdown', invokeHandler);

      overlay.add(btn);
      overlay.add(text);

      return {
        updateLabel: () => {
          if (typeof label === 'function') text.setText(label());
        }
      };
    };

    const isNarrow = cardWidth < 520;
    const usableWidth = isNarrow ? Math.min(cardWidth - 70, 320) : 170;
    const stackHeight = buttonHeight * 3 + buttonGap * 2;
    const buttonYStart = buttonAreaBottom - stackHeight + buttonHeight / 2;

    const toggleBtn = addButton(
      () => (showLetters ? 'Show Colors' : 'Show Letters'),
      width / 2,
      isNarrow ? buttonYStart : buttonAreaBottom,
      usableWidth,
      () => {
        showLetters = !showLetters;
        redrawBoard();
        toggleBtn.updateLabel();
      }
    );

    const copyBtnY = isNarrow ? buttonYStart + buttonHeight + buttonGap : buttonAreaBottom;
    const closeBtnY = isNarrow ? copyBtnY + buttonHeight + buttonGap : buttonAreaBottom;
    const horizontalOffset = isNarrow ? 0 : usableWidth + 30;

    addButton(
      'Copy Colors',
      isNarrow ? width / 2 : width / 2 - horizontalOffset,
      copyBtnY,
      usableWidth,
      () => this.copyBoardColorsToClipboard(boardSnapshot)
    );

    addButton(
      'Close',
      isNarrow ? width / 2 : width / 2 + horizontalOffset,
      closeBtnY,
      usableWidth,
      () => this.hideBoardOverlay()
    );

    const toastY = isNarrow ? closeBtnY + buttonHeight + 10 : buttonAreaBottom - buttonHeight - 10;
    this.overlayToast = this.add.text(width / 2, toastY, '', {
      fontFamily: 'Verdana, sans-serif',
      fontSize: '14px',
      color: '#d5d5d5'
    }).setOrigin(0.5).setAlpha(0);
    overlay.add(this.overlayToast);
  }

  hideBoardOverlay() {
    if (this.overlayToastTween) {
      this.overlayToastTween.remove();
      this.overlayToastTween = null;
    }
    if (this.boardOverlay) {
      this.boardOverlay.destroy(true);
      this.boardOverlay = null;
    }
    this.overlayToast = null;
  }

  async copyBoardColorsToClipboard(boardSnapshot) {
    const shareText = this.buildColorShareString(boardSnapshot);
    if (!shareText) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareText);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = shareText;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      this.showOverlayToast('Board colors copied!');
    } catch (err) {
      console.error('Copy failed:', err);
      this.showOverlayToast('Unable to copy. See console.');
    }
  }

  buildColorShareString(boardSnapshot = []) {
    if (!boardSnapshot.length) return '';
    const map = { row: '🟧', col: '🟦', both: '🟩', none: '⬛' };
    return boardSnapshot
      .map((row) =>
        row
          .map((cell) => map[this.getCellPattern(cell)] || map.none)
          .join('')
      )
      .join('\n');
  }

  showOverlayToast(message) {
    if (!this.overlayToast || !message) return;
    this.overlayToast.setText(message);
    this.overlayToast.setAlpha(1);
    if (this.overlayToastTween) this.overlayToastTween.remove();
    this.overlayToastTween = this.tweens.add({
      targets: this.overlayToast,
      alpha: 0,
      delay: 1500,
      duration: 600,
      ease: 'Sine.easeOut'
    });
  }
}

// ===================== Leaderboard Scene =====================
class LeaderboardScene extends Phaser.Scene {
  constructor() { super('LeaderboardScene'); }

  async create() {
    const { width, height } = this.sys.game.scale.gameSize;
    const centerX = width / 2;
    const centerY = height / 2;

    const cardWidth  = Math.min(460, width * 0.8);
    const cardHeight = Math.min(540, height * 0.78);

    this.add.rectangle(centerX, centerY, width, height, 0x000000, 0.55);
    this.add.rectangle(centerX, centerY, cardWidth, cardHeight, 0x1a1a1a)
      .setStrokeStyle(3, 0x555555)
      .setOrigin(0.5);

    this.add.text(centerX, centerY - cardHeight / 2 + 50, 'Leaderboard', {
      fontFamily: 'Arial Black, Verdana, sans-serif',
      fontSize: '28px',
      color: LIGHT_TEXT
    }).setOrigin(0.5);

    const { data: allTime = [] } = await supabase
      .from('scores')
      .select('*')
      .order('score', { ascending: false })
      .limit(5);

    const startOfWeek = (() => {
      const now = new Date();
      const day = now.getDay(); // 0 (Sun) - 6 (Sat)
      const diffToMonday = day === 0 ? -6 : 1 - day;
      const monday = new Date(now);
      monday.setDate(now.getDate() + diffToMonday);
      monday.setHours(0, 0, 0, 0);
      return monday;
    })();

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(endOfWeek.getDate() + 7);

    const { data: weekly = [] } = await supabase
      .from('scores')
      .select('*')
      .gte('created_at', startOfWeek.toISOString())
      .lt('created_at', endOfWeek.toISOString())
      .order('score', { ascending: false })
      .limit(5);

    const sectionY1 = centerY - cardHeight / 2 + 100;
    const sectionY2 = sectionY1 + 190;

    this.add.text(centerX, sectionY1, 'Top 5 All-Time', {
      fontFamily: 'Arial Black, Verdana, sans-serif',
      fontSize: '18px',
      color: '#dcdcdc'
    }).setOrigin(0.5);
    this.add.text(centerX, sectionY2, 'Top 5 This Week', {
      fontFamily: 'Arial Black, Verdana, sans-serif',
      fontSize: '18px',
      color: '#dcdcdc'
    }).setOrigin(0.5);

    const renderList = (list, startY) => {
      if (!list || !list.length) {
        this.add.text(centerX, startY + 45, 'No scores yet', {
          fontFamily: 'Verdana, sans-serif',
          fontSize: '16px',
          color: '#aaaaaa'
        }).setOrigin(0.5);
        return;
      }

      let y = startY + 25;
      list.forEach((s, i) => {
        const date = s.created_at
          ? new Date(s.created_at).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' })
          : '--';
        this.add.text(centerX - cardWidth / 2 + 40, y, `${i + 1}. ${s.name || 'Anonymous'}`, { fontSize: '18px', color: LIGHT_TEXT });
        this.add.text(centerX + cardWidth / 2 - 100, y, `${s.score}`, { fontSize: '18px', color: LIGHT_TEXT }).setOrigin(1, 0);
        this.add.text(centerX + cardWidth / 2 - 40, y, date, { fontSize: '16px', color: '#bbbbbb' }).setOrigin(1, 0);
        y += 26;
      });
    };

    renderList(allTime, sectionY1);
    renderList(weekly, sectionY2);

    const buttonY = centerY + cardHeight / 2 - 50;
    const btn = this.add.rectangle(centerX, buttonY, 160, 44, 0x2a2a2a)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    this.add.text(centerX, buttonY, 'New Game', {
      fontFamily: 'Arial Black, Verdana, sans-serif',
      fontSize: '18px',
      color: LIGHT_TEXT
    }).setOrigin(0.5);

    btn.on('pointerover', () => btn.setFillStyle(0x444444));
    btn.on('pointerout',  () => btn.setFillStyle(0x2a2a2a));
    // --- FIX: Removed call to obsolete resetGameState() ---
    btn.on('pointerdown', () => { this.scene.start('MainScene'); });
  }
}


// ===================== Name Entry Scene =====================
class NameEntryScene extends Phaser.Scene {
  constructor() { super('NameEntryScene'); }

  create(data) {
    const { total, words } = data;
    const { width, height } = this.sys.game.scale.gameSize;
    const centerX = width / 2;
    const centerY = height / 2;

    const cardWidth = Math.min(460, width * 0.8);
    const cardHeight = Math.min(260, height * 0.45);

    this.add.rectangle(centerX, centerY, width, height, 0x000000, 0.55);
    this.add.rectangle(centerX, centerY, cardWidth, cardHeight, 0x1b1b1b)
      .setStrokeStyle(3, 0x555555)
      .setOrigin(0.5);

    this.add.text(centerX, centerY - 70, 'New High Score!', {
      fontFamily: 'Arial Black, Verdana, sans-serif',
      fontSize: '26px',
      color: LIGHT_TEXT
    }).setOrigin(0.5);

    this.add.text(centerX, centerY - 30, `Your Score: ${total}`, {
      fontFamily: 'Arial Black, Verdana, sans-serif',
      fontSize: '20px',
      color: '#e8e8e8'
    }).setOrigin(0.5);

    const inputWidth = Math.min(240, cardWidth - 80);
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Enter your name';
    input.style.position = 'absolute';
    input.style.width = `${inputWidth}px`;
    input.style.padding = '8px';
    input.style.fontSize = '16px';
    input.style.border = '2px solid #333';
    input.style.borderRadius = '8px';
    input.style.textAlign = 'center';
    input.style.background = '#1f1f1f';
    input.style.color = '#f4f4f4';
    input.style.zIndex = '10';
    input.style.boxShadow = '0 8px 18px rgba(0,0,0,0.5)';
    document.body.appendChild(input);

    const inputAnchorY = centerY - cardHeight / 2 + 150;
    const repositionInput = () => {
      if (!input.parentNode) return;
      const bounds = this.sys.canvas.getBoundingClientRect();
      const scrollX = window.scrollX || document.documentElement.scrollLeft || 0;
      const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
      const left = bounds.left + scrollX + centerX - input.offsetWidth / 2;
      const top = bounds.top + scrollY + inputAnchorY - input.offsetHeight / 2;
      input.style.left = `${left}px`;
      input.style.top = `${top}px`;
    };
    setTimeout(repositionInput, 0);
    window.addEventListener('resize', repositionInput);
    window.addEventListener('scroll', repositionInput, true);
    const cleanupInput = () => {
      window.removeEventListener('resize', repositionInput);
      window.removeEventListener('scroll', repositionInput, true);
      if (input.parentNode) {
        input.parentNode.removeChild(input);
      }
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanupInput);
    this.events.once(Phaser.Scenes.Events.DESTROY, cleanupInput);

    const btnY = centerY + 60;
    const btn = this.add.rectangle(centerX, btnY, 140, 40, 0x2a2a2a)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    this.add.text(centerX, btnY, 'Submit', {
      fontFamily: 'Arial Black, Verdana, sans-serif',
      fontSize: '18px',
      color: LIGHT_TEXT
    }).setOrigin(0.5);

    btn.on('pointerover', () => btn.setFillStyle(0x444444));
    btn.on('pointerout',  () => btn.setFillStyle(0x2a2a2a));

    btn.on('pointerdown', async () => {
      const playerName = input.value.trim() || 'Anonymous';
      cleanupInput();

      try {
        const { data, error } = await supabase
          .from('scores')
          .insert([{ name: playerName, score: total }])
          .select();
        if (error) throw error;
        console.log('✅ Score inserted:', data);
      } catch (error) {
        console.error('Supabase insert error:', error);
        alert('⚠️ Unable to save score — check console for details.');
      }

      this.scene.start('SummaryScene', { words, total });
    });

  }
}

// ===================== Launch / Reset / Boot =====================

// --- NOTE: All global state functions are GONE. ---
// --- The MainScene's create() method handles all resets. ---

function launchGame() {
  const game = new Phaser.Game({
    ...gameConfig,
    scene: [MainScene, NameEntryScene, SummaryScene, LeaderboardScene]
  });

  setTimeout(() => {
    game.scale.resize(window.innerWidth, window.innerHeight);
  }, 250);

  window.addEventListener("resize", () => {
    if (game && game.scale) {
      game.scale.resize(window.innerWidth, window.innerHeight);
    }
  });
}

if (document.readyState === "complete") {
  launchGame();
} else {
  window.addEventListener("load", launchGame);
}
