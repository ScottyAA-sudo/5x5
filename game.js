// ===================== Supabase =====================
const supabase = window.supabase.createClient(
  "https://bztovbzqubypgdskypjt.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ6dG92YnpxdWJ5cGdkc2t5cGp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkyODM2NTIsImV4cCI6MjA3NDg1OTY1Mn0.DkWqGmN0B-9AUj7kr6B11hhhnB0b2BKFpOsnrixFNQU"
);

// ===================== Game State =====================
// ===================== Config =====================
const gameConfig = {
  type: Phaser.AUTO,
  backgroundColor: '#fafafa',
  parent: 'phaser-game',

  // Let Phaser compute size from the browser window
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: window.innerWidth,
    height: window.innerHeight
  },

  // Force WebGL for better mobile support
  render: { pixelArt: false, antialias: true }
};


const GRID_SIZE = 5;
let CELL_SIZE = 110; // 🔹 use let, not const

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
    const { width, height } = this.sys.game.scale.gameSize;
    const centerX = width / 2;
    const centerY = height / 2;

    // Responsive card sizing
    const cardWidth = Math.min(460, width * 0.8);
    const cardHeight = Math.min(500, height * 0.7);

    // Dim background
    this.add.rectangle(centerX, centerY, width, height, 0x000000, 0.5).setDepth(0);

    // Card container
    const card = this.add.rectangle(centerX, centerY, cardWidth, cardHeight, 0xffffff)
      .setStrokeStyle(3, 0x222222)
      .setOrigin(0.5)
      .setDepth(0);

    this.tweens.add({ targets: card, alpha: 1, duration: 250 });

    // Title
    this.add.text(centerX, centerY - cardHeight / 2 + 50, 'Game Over', {
      fontFamily: 'Arial Black, Verdana, sans-serif',
      fontSize: '32px',
      color: '#111'
    }).setOrigin(0.5).setDepth(1);

    // Total Score
    this.add.text(centerX, centerY - cardHeight / 2 + 100, `Total Score: ${total}`, {
      fontFamily: 'Arial Black, Verdana, sans-serif',
      fontSize: '22px',
      color: '#333'
    }).setOrigin(0.5).setDepth(1);

    // Sort words descending by score
    const sortedWords = [...words].sort((a, b) => b.score - a.score);

    // Column headers
    const headerY = centerY - cardHeight / 2 + 140;
    this.add.text(centerX - cardWidth / 2 + 40, headerY, 'Word', { fontSize: '18px', color: '#555' }).setDepth(1);
    this.add.text(centerX + cardWidth / 2 - 40, headerY, 'Pts', { fontSize: '18px', color: '#555' })
      .setOrigin(1, 0).setDepth(1);

    // Word list (max 10 shown)
    let y = headerY + 25;
    sortedWords.slice(0, 10).forEach(w => {
      this.add.text(centerX - cardWidth / 2 + 40, y, w.word, { fontSize: '18px', color: '#111' }).setDepth(1);
      this.add.text(centerX + cardWidth / 2 - 40, y, w.score.toString(), { fontSize: '18px', color: '#111' })
        .setOrigin(1, 0).setDepth(1);
      y += 26;
    });

    // Buttons
    const buttonY = centerY + cardHeight / 2 - 50;

    const makeBtn = (label, offsetX, onClick) => {
      const btn = this.add.rectangle(centerX + offsetX, buttonY, 160, 44, 0x333333)
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true })
        .setDepth(1);
      const text = this.add.text(centerX + offsetX, buttonY, label, {
        fontFamily: 'Arial Black, Verdana, sans-serif',
        fontSize: '18px',
        color: '#fff'
      }).setOrigin(0.5).setDepth(1);
      btn.on('pointerover', () => btn.setFillStyle(0x555555));
      btn.on('pointerout',  () => btn.setFillStyle(0x333333));
      btn.on('pointerdown', onClick);
    };

    makeBtn('Leaderboard', -100, () => this.scene.start('LeaderboardScene'));
    makeBtn('New Game', 100, () => { resetGameState(); this.scene.start('MainScene'); });
  }
}




// ===================== Leaderboard Scene =====================
class LeaderboardScene extends Phaser.Scene {
  constructor() { super('LeaderboardScene'); }

  async create() {
    const { width, height } = this.sys.game.scale.gameSize;
    const centerX = width / 2;
    const centerY = height / 2;

    // Responsive card
    const cardWidth  = Math.min(460, width * 0.8);
    const cardHeight = Math.min(540, height * 0.78);

    // Overlay & card
    this.add.rectangle(centerX, centerY, width, height, 0x000000, 0.5);
    const card = this.add.rectangle(centerX, centerY, cardWidth, cardHeight, 0xffffff)
      .setStrokeStyle(3, 0x222222)
      .setOrigin(0.5);

    // Title
    this.add.text(centerX, centerY - cardHeight / 2 + 50, 'Leaderboard', {
      fontFamily: 'Arial Black, Verdana, sans-serif',
      fontSize: '28px',
      color: '#111'
    }).setOrigin(0.5);

    // Fetch ALL-TIME
    const { data: allTime = [] } = await supabase
      .from('scores')
      .select('*')
      .order('score', { ascending: false })
      .limit(5);

    // Fetch WEEKLY (past 7 days)
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const { data: weekly = [] } = await supabase
      .from('scores')
      .select('*')
      .gte('created_at', oneWeekAgo.toISOString())
      .order('score', { ascending: false })
      .limit(5);

    // Section headers
    const sectionY1 = centerY - cardHeight / 2 + 100;   // All-Time section top
    const sectionY2 = sectionY1 + 190;                   // Weekly section top (stacked)

    this.add.text(centerX, sectionY1, 'Top 5 All-Time', {
      fontFamily: 'Arial Black, Verdana, sans-serif',
      fontSize: '18px',
      color: '#333'
    }).setOrigin(0.5);

    this.add.text(centerX, sectionY2, 'Top 5 This Week', {
      fontFamily: 'Arial Black, Verdana, sans-serif',
      fontSize: '18px',
      color: '#333'
    }).setOrigin(0.5);

    // Render helper
    const renderList = (list, startY) => {
      let y = startY + 25;
      list.forEach((s, i) => {
        const date = new Date(s.created_at).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' });
        // Name (left)
        this.add.text(centerX - cardWidth / 2 + 40, y, `${i + 1}. ${s.name}`, { fontSize: '18px', color: '#111' });
        // Score (right-aligned)
        this.add.text(centerX + cardWidth / 2 - 100, y, `${s.score}`, { fontSize: '18px', color: '#111' }).setOrigin(1, 0);
        // Date (far right)
        this.add.text(centerX + cardWidth / 2 - 40, y, date, { fontSize: '16px', color: '#666' }).setOrigin(1, 0);
        y += 26;
      });
    };

    renderList(allTime, sectionY1);
    renderList(weekly, sectionY2);

    // Button
    const buttonY = centerY + cardHeight / 2 - 50;
    const btn = this.add.rectangle(centerX, buttonY, 160, 44, 0x333333)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    this.add.text(centerX, buttonY, 'New Game', {
      fontFamily: 'Arial Black, Verdana, sans-serif',
      fontSize: '18px',
      color: '#fff'
    }).setOrigin(0.5);

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
  const { width, height } = this.sys.game.scale.gameSize;
  const centerX = width / 2;
  const centerY = height / 2;

  const cardWidth = Math.min(460, width * 0.8);
  const cardHeight = Math.min(260, height * 0.45);

  // Dim background
  this.add.rectangle(centerX, centerY, width, height, 0x000000, 0.5);

  // Card
  const card = this.add.rectangle(centerX, centerY, cardWidth, cardHeight, 0xffffff)
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
    const inputX = canvasBounds.left + centerX - 110; // centerX minus half input width
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
  // --- Get live canvas size ---
  const canvasWidth = this.sys.game.scale.gameSize.width;
  const canvasHeight = this.sys.game.scale.gameSize.height;

// Depths so we control draw order
const Z = {
  CELL: 10,        // white grid squares
  HIGHLIGHT: 20,   // yellow/blue/green highlight rects
  LETTER: 30,      // tile letters
  DECOR: 15        // the faint "5×5" watermark (between CELL and HIGHLIGHT)
};


  // --- Grid placement ---
  const GRID_LEFT = (canvasWidth - GRID_SIZE * CELL_SIZE) / 2;
  const GRID_RIGHT = GRID_LEFT + GRID_SIZE * CELL_SIZE;
  const GRID_TOP = Math.max(60, (canvasHeight - (GRID_SIZE * CELL_SIZE + 300)) / 2); 
  // adds some top margin; scales on mobile


  // --- Build grid ---
  for (let row = 0; row < GRID_SIZE; row++) {
    grid[row] = [];
    for (let col = 0; col < GRID_SIZE; col++) {
      const x = GRID_LEFT + col * CELL_SIZE + CELL_SIZE / 2;
      const y = GRID_TOP + row * CELL_SIZE + CELL_SIZE / 2;

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

      grid[row][col] = { rect, highlightRect: highlight, letterText, filled: false, rowValid: false, colValid: false };
    }
  }

// --- Subtle "5×5" watermark centered on the grid ---
{
  const gridWidth  = GRID_SIZE * CELL_SIZE;
  const gridHeight = GRID_SIZE * CELL_SIZE;
  const gridCenterX = (GRID_LEFT + GRID_RIGHT) / 2;
  const gridCenterY = GRID_TOP + gridHeight / 2;

  const bgText = this.add.text(gridCenterX, gridCenterY, '5×5', {
    // feel free to swap in a stylized/display font you’ve loaded via CSS
    fontFamily: 'Arial Black, Verdana, sans-serif',
    fontSize: `${CELL_SIZE * 2.6}px`,
    fontStyle: 'bold',
    color: '#000000'
  })
    .setOrigin(0.5)
    .setAlpha(0.10)        // subtle but visible
    .setAngle(-10)         // tasteful tilt
    .setDepth(Z.DECOR);    // sits above cells, below highlights/letters

  // Optional soft fade-in
  this.tweens.add({
    targets: bgText,
    alpha: { from: 0, to: 0.06 },
    duration: 600,
    ease: 'Quad.easeOut'
  });
}


    // --- Top UI row ---
    const uiY = 10;
    const gridCenterX = (GRID_LEFT + GRID_RIGHT) / 2;

    this.onDeckText = this.add.text(GRID_LEFT, uiY, 'On Deck: ', {
      fontFamily: 'Arial Black, Verdana, sans-serif',
      fontSize: '20px',
      fontStyle: 'bold',
      color: '#333'
    }).setOrigin(0, 0);

    this.nextLetterBox = this.add.rectangle(gridCenterX, uiY, 80, 80, 0xffffff, 1)
      .setStrokeStyle(3, 0x000000)
      .setOrigin(0.5, 0);

    this.nextLetterText = this.add.text(gridCenterX, uiY + 40, '', {
      fontFamily: 'Arial Black, Verdana, sans-serif',
      fontSize: '48px',
      fontStyle: 'bold',
      color: '#007bff'
    }).setOrigin(0.5);

    scoreText = this.add.text(GRID_RIGHT, uiY + 12, 'Score: 0', {
      fontFamily: 'Arial Black, Verdana, sans-serif',
      fontSize: '20px',
      fontStyle: 'bold',
      color: '#000'
    }).setOrigin(1, 0.5);


  // --- Row & column labels ---
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


  // --- Swap Lights ---
  const lightsY = GRID_TOP + GRID_SIZE * CELL_SIZE + 60;
  const startX = canvasWidth / 2 - 60;
  for (let i = 0; i < 3; i++) {
    const light = this.add.circle(startX + i * 60, lightsY, 12, 0xcccccc);
    light.setStrokeStyle(2, 0x555555);
    swapIndicators.push(light);
  }
  updateSwapIndicators();

  this.add.text(canvasWidth / 2, lightsY + 20, 'Swaps Used', {
    fontFamily: 'Verdana, sans-serif',
    fontSize: '12px',
    color: '#555'
  }).setOrigin(0.5, 0);

// --- Legend (under swap lights, centered, semi-transparent) ---
{
  const legendY = lightsY + 60;  // space below "Swaps Used"
  const legendX = canvasWidth / 2;
  const legendSpacing = 110;     // horizontal distance between color boxes

  const drawLegendItem = (color, label, offsetX) => {
    // Slight transparency to match in-game highlights
    const box = this.add.rectangle(legendX + offsetX, legendY, 18, 18, color, 0.6).setOrigin(0.5);
    box.setStrokeStyle(1, 0x444444, 0.8);

    this.add.text(legendX + offsetX + 16, legendY, label, {
      fontFamily: 'Verdana, sans-serif',
      fontSize: '14px',
      color: '#333'
    }).setOrigin(0, 0.5);
  };

  // Highlight colors with matching meanings:
  drawLegendItem(0xfff066, 'Horizontal', -legendSpacing);
  drawLegendItem(0x66ccff, 'Vertical', 0);
  drawLegendItem(0x66cc66, 'Both', legendSpacing);
}


  // --- Mini Leaderboard ---
  initMiniLeaderboardUI(this);
  updateMiniLeaderboard(this);

  // --- Initialize letters ---
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
  if (miniLBHeader) miniLBHeader.destroy();
  miniLBTexts.forEach(t => t.destroy());
  miniLBTexts = [];

  const canvasWidth = scene.sys.game.scale.gameSize.width;
  const GRID_TOP = 100;
  const GRID_BOTTOM = GRID_TOP + GRID_SIZE * CELL_SIZE;
  const startY = GRID_BOTTOM + 300;

  miniLBHeader = scene.add.text(canvasWidth / 2, startY, 'Top 5 All-Time', {
    fontFamily: 'Arial Black, Verdana, sans-serif',
    fontSize: '14px',
    fontStyle: 'bold',
    color: '#444'
  }).setOrigin(0.5, 0);

  const lineY = startY + 20;
  for (let i = 0; i < 5; i++) {
    const t = scene.add.text(canvasWidth / 2, lineY + i * 16, '', {
      fontFamily: 'Verdana, sans-serif',
      fontSize: '12px',
      color: '#555'
    }).setOrigin(0.5, 0);
    miniLBTexts.push(t);
  }

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



// ===================== Boot Game =====================
function launchGame() {
  const game = new Phaser.Game({
    ...gameConfig,
    scene: [MainScene, NameEntryScene, SummaryScene, LeaderboardScene]
  });

  // Resize once after a short delay (mobile fix)
  setTimeout(() => {
    game.scale.resize(window.innerWidth, window.innerHeight);
  }, 300);

  // Keep canvas filling viewport on rotation/resize
  window.addEventListener('resize', () => {
    game.scale.resize(window.innerWidth, window.innerHeight);
  });
}

if (document.readyState === 'complete') {
  launchGame();
} else {
  window.addEventListener('load', launchGame);
}


