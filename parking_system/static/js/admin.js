/**
 * SmartPark — Admin Panel JS
 * Toggle spot states, floor stats, real-time management
 */

// ── State ──────────────────────────────────────
let currentFloor = 0;
let editMode = 'occupy'; // 'occupy' | 'free'
let parkingLayout = [];
let ROWS = 6, COLS = 8, FLOORS = 3;

// ── Init ────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await fetchState();
  buildFloorTabs();
  renderGrid();
  setupModeButtons();
  updateStats();

  document.getElementById('resetBtn').addEventListener('click', resetLayout);
});

// ── Fetch state ──────────────────────────────────
async function fetchState() {
  const res = await fetch('/state');
  const data = await res.json();
  parkingLayout = data.layout;
  ROWS   = data.rows;
  COLS   = data.cols;
  FLOORS = data.floors;
}

// ── Floor tabs ───────────────────────────────────
function buildFloorTabs() {
  const container = document.getElementById('floorTabs');
  container.innerHTML = '';
  for (let f = 0; f < FLOORS; f++) {
    const btn = document.createElement('button');
    btn.className = 'floor-tab' + (f === 0 ? ' active' : '');
    btn.textContent = `F${f + 1}`;
    btn.addEventListener('click', () => switchFloor(f));
    container.appendChild(btn);
  }
}

function switchFloor(f) {
  currentFloor = f;
  document.getElementById('floorLabel').textContent = `Floor ${f + 1}`;
  document.querySelectorAll('.floor-tab').forEach((b, i) => b.classList.toggle('active', i === f));
  renderGrid();
  updateStats();
}

// ── Render grid ──────────────────────────────────
function renderGrid() {
  const grid = document.getElementById('parkingGrid');
  grid.innerHTML = '';
  const floor = parkingLayout[currentFloor];

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = document.createElement('div');
      const val  = floor[r][c];
      cell.className = 'cell ' + cellClass(val);
      cell.dataset.r = r;
      cell.dataset.c = c;

      // Only non-entry cells are clickable
      if (val !== 2) {
        cell.addEventListener('click', () => toggleCell(r, c));
        cell.title = val === 1 ? 'Click to free this spot' : 'Click to mark as occupied';
      } else {
        cell.title = 'Entry gate — cannot edit';
      }

      grid.appendChild(cell);
    }
  }
}

function cellClass(val) {
  if (val === 2) return 'entry';
  if (val === 1) return 'occupied';
  return 'empty';
}

// ── Toggle a cell via API ─────────────────────────
async function toggleCell(r, c) {
  const current = parkingLayout[currentFloor][r][c];
  if (current === 2) return; // entry gate

  // Determine new state based on mode or current state
  let newState;
  if (editMode === 'occupy') {
    newState = current === 0 ? 1 : 0; // toggle
  } else {
    newState = current === 1 ? 0 : 1; // toggle
  }

  try {
    const res = await fetch('/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ floor: currentFloor, row: r, col: c, state: newState })
    });
    const data = await res.json();
    if (data.success) {
      parkingLayout = data.layout;
      renderGrid();
      updateStats();
      flashStatus(r, c, newState);
    }
  } catch (e) {
    setStatus('err', '❌ Failed to update spot.');
  }
}

// ── Mode buttons ─────────────────────────────────
function setupModeButtons() {
  document.querySelectorAll('[data-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-mode]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      editMode = btn.dataset.mode;
    });
  });
}

// ── Reset layout ─────────────────────────────────
async function resetLayout() {
  if (!confirm('Reset ALL floors to default layout?')) return;
  try {
    const res = await fetch('/reset', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      parkingLayout = data.layout;
      renderGrid();
      updateStats();
      setStatus('ok', '✅ Layout reset to default.');
    }
  } catch (e) {
    setStatus('err', '❌ Reset failed.');
  }
}

// ── Stats ────────────────────────────────────────
function updateStats() {
  const floor = parkingLayout[currentFloor];
  let total = 0, occ = 0, avail = 0;

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const v = floor[r][c];
      if (v === 0) { total++; avail++; }
      if (v === 1) { total++; occ++; }
      // entries not counted
    }
  }

  const rate = total > 0 ? Math.round((occ / total) * 100) : 0;

  document.getElementById('totalSpots').textContent = total;
  document.getElementById('availSpots').textContent = avail;
  document.getElementById('occSpots').textContent   = occ;
  document.getElementById('occRate').textContent    = rate + '%';

  const bar = document.getElementById('occBar');
  if (bar) bar.style.width = rate + '%';
}

// ── Flash status after toggle ─────────────────────
function flashStatus(r, c, newState) {
  const msg = newState === 1
    ? `🔴 Spot [R${r+1}, C${c+1}] marked as OCCUPIED`
    : `🟢 Spot [R${r+1}, C${c+1}] marked as EMPTY`;
  setStatus(newState === 1 ? 'err' : 'ok', msg);
}

function setStatus(type, msg) {
  const box = document.getElementById('statusBox');
  box.innerHTML = `<p class="status-${type}">${msg}</p>`;
}

// Auto-refresh every 5s to sync with user panel
setInterval(async () => {
  const prev = JSON.stringify(parkingLayout);
  await fetchState();
  if (JSON.stringify(parkingLayout) !== prev) {
    renderGrid();
    updateStats();
  }
}, 5000);
