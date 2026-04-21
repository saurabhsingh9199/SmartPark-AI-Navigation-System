/**
 * SmartPark — User Panel JS
 * Dijkstra visualization, car animation, chart rendering
 */

// ── State ──────────────────────────────────────
let currentFloor = 0;
let selectedAlgo = 'dijkstra';
let parkingLayout = [];
let ROWS = 6, COLS = 8, FLOORS = 3;
let animTimer = null;
let compChart = null;

// ── Init ────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await fetchState();
  buildFloorTabs();
  renderGrid();
  setupAlgoButtons();
  document.getElementById('findBtn').addEventListener('click', findParking);
});

// ── Fetch parking state ─────────────────────────
async function fetchState() {
  const res = await fetch('/state');
  const data = await res.json();
  parkingLayout = data.layout;
  ROWS  = data.rows;
  COLS  = data.cols;
  FLOORS = data.floors;
}

// ── Floor tabs ──────────────────────────────────
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
  clearAnimation();
  renderGrid();
}

// ── Render grid ─────────────────────────────────
function renderGrid() {
  const grid = document.getElementById('parkingGrid');
  grid.innerHTML = '';
  const floor = parkingLayout[currentFloor];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell ' + cellClass(floor[r][c]);
      cell.dataset.r = r;
      cell.dataset.c = c;
      grid.appendChild(cell);
    }
  }
}

function cellClass(val) {
  if (val === 2) return 'entry';
  if (val === 1) return 'occupied';
  return 'empty';
}

function getCell(r, c) {
  return document.querySelector(`.cell[data-r="${r}"][data-c="${c}"]`);
}

// ── Algo toggle ─────────────────────────────────
function setupAlgoButtons() {
  document.querySelectorAll('.algo-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.algo-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedAlgo = btn.dataset.algo;
    });
  });
}

// ── Main find function ──────────────────────────
async function findParking() {
  clearAnimation();
  renderGrid(); // reset colors

  const btn = document.getElementById('findBtn');
  const statusBox = document.getElementById('statusBox');
  btn.disabled = true;
  setStatus('running', '⏳ Running Dijkstra...');

  // Refresh state from server (admin may have changed spots)
  await fetchState();
  renderGrid();

  // Call backend /run
  let result;
  try {
    const res = await fetch('/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ floor: currentFloor })
    });
    result = await res.json();
  } catch (e) {
    setStatus('err', '❌ Server error. Is Flask running?');
    btn.disabled = false;
    return;
  }

  const dijkstra = result.dijkstra;

  // Update stats panel
  document.getElementById('statsCard').style.display = 'block';
  document.getElementById('dijkstraPath').textContent    = dijkstra.path.length;
  document.getElementById('dijkstraVisited').textContent = dijkstra.visited;
  document.getElementById('dijkstraTime').textContent    = dijkstra.time_ms + ' ms';

  drawChart(dijkstra.visited);

  // Choose what to animate
  let animPath = null;
  let target   = null;
  if (dijkstra.target) {
    animPath = dijkstra.path;
    target = dijkstra.target;
  }

  if (!animPath || animPath.length === 0) {
    setStatus('err', '❌ No empty spot found on this floor!');
    btn.disabled = false;
    return;
  }

  setStatus('running', '🚗 Car navigating...');
  await animateCar(animPath, target, 'dijkstra');

  // Mark destination
  if (target) {
    const destCell = getCell(target[0], target[1]);
    if (destCell) {
      destCell.className = 'cell destination';
      destCell.textContent = '⭐';
    }
  }

  // Play sound
  try {
    const snd = document.getElementById('foundSound');
    if (snd) snd.play().catch(() => {});
  } catch (_) {}

  const spot = target ? `Row ${target[0]+1}, Col ${target[1]+1}` : '';
  setStatus('ok', `✅ Spot found! ${spot} (Floor ${currentFloor + 1})`);
  btn.disabled = false;
}

// ── Car animation ───────────────────────────────
function animateCar(path, target, algoClass) {
  return new Promise(resolve => {
    let idx = 0;
    let prevCell = null;

    function step() {
      if (idx >= path.length) { resolve(); return; }

      const [r, c] = path[idx];
      const cell = getCell(r, c);

      // Restore previous cell
      if (prevCell) {
        const pr = parseInt(prevCell.dataset.r);
        const pc = parseInt(prevCell.dataset.c);
        const val = parkingLayout[currentFloor][pr][pc];
        prevCell.className = 'cell ' + cellClass(val);
        prevCell.textContent = '';
        prevCell.classList.add(algoClass + '-path');
      }

      if (cell && !cell.classList.contains('entry')) {
        cell.className = 'cell car-cell';
        cell.textContent = '🚗';
        prevCell = cell;
      }

      idx++;
      animTimer = setTimeout(step, 90);
    }

    step();
  });
}

// ── Chart ───────────────────────────────────────
function drawChart(dijkstraVisited) {
  const ctx = document.getElementById('compChart');

  if (compChart) compChart.destroy();

  compChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Dijkstra'],
      datasets: [{
        label: 'Nodes Visited',
        data: [dijkstraVisited],
        backgroundColor: [
          'rgba(0,212,255,0.35)'
        ],
        borderColor: ['#00d4ff'],
        borderWidth: 2,
        borderRadius: 6,
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#162035',
          titleColor: '#e0eaff',
          bodyColor: '#7a9cc0',
          borderColor: '#1f3050',
          borderWidth: 1,
        }
      },
      scales: {
        x: {
          ticks: { color: '#7a9cc0', font: { family: 'Space Mono' } },
          grid: { color: 'rgba(255,255,255,0.04)' }
        },
        y: {
          ticks: { color: '#7a9cc0', font: { family: 'Space Mono' } },
          grid: { color: 'rgba(255,255,255,0.04)' },
          beginAtZero: true
        }
      }
    }
  });
}

// ── Utilities ───────────────────────────────────
function setStatus(type, msg) {
  const box = document.getElementById('statusBox');
  box.innerHTML = `<p class="status-${type}">${msg}</p>`;
}

function clearAnimation() {
  if (animTimer) { clearTimeout(animTimer); animTimer = null; }
}

// Poll for real-time updates from admin panel
setInterval(async () => {
  const prev = JSON.stringify(parkingLayout);
  await fetchState();
  if (JSON.stringify(parkingLayout) !== prev) {
    renderGrid();
  }
}, 3000);
