// ============================================================
// Feature: Member Activity Heatmap
// ============================================================

// escapeHtml provided by utils.js

const DAYS_HEATMAP = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const CELL_SIZE = 18;
const CELL_GAP = 2;
const LABEL_WIDTH = 30;
const LABEL_HEIGHT = 20;

async function initHeatmap(memberName) {
  const container = document.getElementById('heatmap-container');
  if (!container || !memberName) return;

  try {
    const res = await fetch('/api/heatmap/' + encodeURIComponent(memberName));
    if (!res.ok) throw new Error('API error');
    const data = await res.json();
    renderHeatmap(container, data, memberName);
  } catch (err) {
    container.innerHTML = '<div class="heatmap-empty">Keine Aktivitaetsdaten verfuegbar.</div>';
  }
}

function renderHeatmap(container, data, name) {
  container.innerHTML = '';

  const title = document.createElement('div');
  title.className = 'heatmap-title';
  title.textContent = 'Aktivitaet: ' + name;
  container.appendChild(title);

  const canvas = document.createElement('canvas');
  canvas.id = 'heatmap-canvas';
  const width = LABEL_WIDTH + 24 * (CELL_SIZE + CELL_GAP);
  const height = LABEL_HEIGHT + 7 * (CELL_SIZE + CELL_GAP);
  canvas.width = width;
  canvas.height = height;
  canvas.style.maxWidth = '100%';
  container.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  // Build data matrix
  const matrix = Array.from({ length: 7 }, () => Array(24).fill(0));
  let maxVal = 1;

  data.forEach(d => {
    const day = parseInt(d.day_of_week);
    const hour = parseInt(d.hour);
    const val = d.score_delta || 0;
    matrix[day][hour] = val;
    if (val > maxVal) maxVal = val;
  });

  // Draw hour labels
  ctx.fillStyle = '#888888';
  ctx.font = "9px 'Courier New', monospace";
  ctx.textAlign = 'center';
  for (let h = 0; h < 24; h++) {
    if (h % 3 === 0) {
      ctx.fillText(String(h).padStart(2, '0'), LABEL_WIDTH + h * (CELL_SIZE + CELL_GAP) + CELL_SIZE / 2, LABEL_HEIGHT - 4);
    }
  }

  // Draw day labels and cells
  for (let d = 0; d < 7; d++) {
    const y = LABEL_HEIGHT + d * (CELL_SIZE + CELL_GAP);

    ctx.fillStyle = '#888888';
    ctx.font = "10px 'Courier New', monospace";
    ctx.textAlign = 'right';
    ctx.fillText(DAYS_HEATMAP[d], LABEL_WIDTH - 4, y + CELL_SIZE / 2 + 3);

    for (let h = 0; h < 24; h++) {
      const x = LABEL_WIDTH + h * (CELL_SIZE + CELL_GAP);
      const val = matrix[d][h];
      const intensity = val / maxVal;

      // Color: white (no activity) to blue (high activity)
      const r = Math.round(240 - intensity * 240);
      const g = Math.round(240 - intensity * 200);
      const b = Math.round(240 - intensity * 36);

      ctx.fillStyle = val === 0 ? '#f0f0e8' : `rgb(${r}, ${g}, ${b})`;
      ctx.fillRect(x, y, CELL_SIZE, CELL_SIZE);
      ctx.strokeStyle = '#d0d0d0';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(x, y, CELL_SIZE, CELL_SIZE);
    }
  }

  // Tooltip on hover
  var tooltip = document.createElement('div');
  tooltip.className = 'heatmap-tooltip';
  tooltip.style.cssText = 'display:none;position:absolute;background:#2c2c2c;color:#f0f0e8;padding:4px 8px;font-family:Courier New,monospace;font-size:0.7rem;pointer-events:none;z-index:10;border:1px solid #555;';
  container.style.position = 'relative';
  container.appendChild(tooltip);

  canvas.addEventListener('mousemove', function(e) {
    var rect = canvas.getBoundingClientRect();
    var scaleX = canvas.width / rect.width;
    var scaleY = canvas.height / rect.height;
    var mx = (e.clientX - rect.left) * scaleX;
    var my = (e.clientY - rect.top) * scaleY;

    var h = Math.floor((mx - LABEL_WIDTH) / (CELL_SIZE + CELL_GAP));
    var d = Math.floor((my - LABEL_HEIGHT) / (CELL_SIZE + CELL_GAP));

    if (h >= 0 && h < 24 && d >= 0 && d < 7) {
      var val = matrix[d][h];
      tooltip.textContent = DAYS_HEATMAP[d] + ' ' + String(h).padStart(2, '0') + ':00 - ' + (val > 0 ? '+' + formatScoreShort(val) : 'Keine Aktivitaet');
      tooltip.style.display = 'block';
      tooltip.style.left = (e.clientX - rect.left + 12) + 'px';
      tooltip.style.top = (e.clientY - rect.top - 24) + 'px';
    } else {
      tooltip.style.display = 'none';
    }
  });

  canvas.addEventListener('mouseleave', function() {
    tooltip.style.display = 'none';
  });
}

// Heatmap selector: dropdown to pick which member to show
function initHeatmapSelector(members) {
  const select = document.getElementById('heatmap-member-select');
  if (!select || !members || members.length === 0) return;

  select.innerHTML = members.slice(0, 20).map(m =>
    '<option value="' + escapeHtml(m.name) + '">' + escapeHtml(m.name) + '</option>'
  ).join('');

  select.addEventListener('change', () => {
    initHeatmap(select.value);
  });

  // Load first member
  initHeatmap(members[0].name);
}
