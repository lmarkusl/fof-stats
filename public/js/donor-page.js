// ============================================================
// Donor Profile Page - Main Logic
// Renders an individual donor's profile: KPIs, score history chart,
// comparison bars vs team average, achievement system with modal,
// and an activity heatmap (day-of-week x hour-of-day).
// Depends on: utils.js, Chart.js (loaded externally)
// ============================================================

/**
 * Extracts the donor name from the current URL path (/donor/<name>).
 * @returns {string|null} The decoded donor name, or null if not found.
 */
function getDonorName() {
  try {
    const path = decodeURIComponent(window.location.pathname);
    const match = path.match(/^\/donor\/(.+)$/);
    return match ? match[1] : null;
  } catch (e) {
    return null;
  }
}

// ---- Render Functions ----

/**
 * Populates the donor profile header and KPI cards (score, WUs, ranks, efficiency, contribution).
 * @param {{ name: string, score: number, wus: number, rank: number, team_rank: number, team_total_members: number, id: string|number, efficiency: number, contribution: number }} data - Donor summary from API.
 */
function renderKPIs(data) {
  const tier = getTier(data.score);

  document.getElementById('donor-name').textContent = data.name;
  document.getElementById('nav-donor-name').textContent = data.name;
  document.title = data.name + ' | FOF Stats';

  document.getElementById('donor-subtitle').innerHTML =
    escapeHtml(tier.icon + ' ' + tier.name) + ' | Team Rang #' + escapeHtml(String(data.team_rank)) +
    ' von ' + escapeHtml(String(data.team_total_members)) + ' | F@H ID: ' + escapeHtml(String(data.id || '---'));

  document.getElementById('donor-score').textContent = formatScore(data.score);
  document.getElementById('donor-wus').textContent = formatNumber(data.wus);
  document.getElementById('donor-rank').textContent = data.rank ? '#' + formatNumber(data.rank) : '---';
  document.getElementById('donor-team-rank').textContent = '#' + data.team_rank;
  document.getElementById('donor-efficiency').textContent = formatScore(data.efficiency);
  document.getElementById('donor-contribution').textContent = data.contribution.toFixed(1) + '%';

  // F@H profile link
  const fahLink = document.getElementById('fah-profile-link');
  if (fahLink && data.id) {
    fahLink.href = 'https://stats.foldingathome.org/donor/' + encodeURIComponent(data.id);
  }
}

/**
 * Renders 7-day score/WU gain indicators and the vs-average multiplier.
 * @param {{ score_gain_7d: number, wus_gain_7d: number, score_vs_avg: number }} data - Gain data from donor summary.
 */
function renderGains(data) {
  const scoreGainEl = document.getElementById('donor-score-gain');
  const wusGainEl = document.getElementById('donor-wus-gain');
  const vsAvgEl = document.getElementById('donor-vs-avg');

  if (scoreGainEl) {
    const prefix = data.score_gain_7d > 0 ? '+' : '';
    scoreGainEl.textContent = prefix + formatScore(data.score_gain_7d);
    scoreGainEl.style.color = data.score_gain_7d > 0 ? '#008800' : '#888888';
  }
  if (wusGainEl) {
    const prefix = data.wus_gain_7d > 0 ? '+' : '';
    wusGainEl.textContent = prefix + formatNumber(data.wus_gain_7d);
    wusGainEl.style.color = data.wus_gain_7d > 0 ? '#008800' : '#888888';
  }
  if (vsAvgEl) {
    vsAvgEl.textContent = data.score_vs_avg.toFixed(1) + 'x';
    vsAvgEl.style.color = data.score_vs_avg >= 1 ? '#008800' : '#cc0000';
  }
}

/**
 * Renders a Chart.js line chart showing the donor's score over time.
 * @param {Array<{ date: string, score: number }>} history - Historical score snapshots.
 */
function renderHistoryChart(history) {
  const canvas = document.getElementById('donor-history-chart');
  if (!canvas || !history || history.length === 0) return;

  new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels: history.map(h => h.date),
      datasets: [
        {
          label: 'Score',
          data: history.map(h => h.score),
          borderColor: '#0000cc',
          backgroundColor: 'rgba(0,0,204,0.08)',
          borderWidth: 2,
          fill: true,
          tension: 0.3,
          pointRadius: 1,
          pointHoverRadius: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#ffffff',
          borderColor: '#808080',
          borderWidth: 1,
          titleColor: '#1a1a1a',
          bodyColor: '#444444',
          titleFont: { family: "'Courier New', monospace" },
          bodyFont: { family: "'Courier New', monospace" },
          callbacks: {
            label: function(ctx) { return 'Score: ' + formatScore(ctx.raw); },
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { size: 9, family: "'Courier New', monospace" }, maxTicksLimit: 12 },
        },
        y: {
          ticks: {
            callback: v => formatScore(v),
            font: { size: 9, family: "'Courier New', monospace" },
          },
          grid: { color: 'rgba(0,0,0,0.06)' },
        },
      },
    },
  });
}

/**
 * Renders side-by-side comparison bars (donor vs team average) for
 * score, work units, and efficiency.
 * @param {{ score: number, wus: number, efficiency: number, avg_score: number, avg_wus: number }} data - Donor summary with team averages.
 */
function renderComparison(data) {
  const container = document.getElementById('donor-comparison-bars');
  if (!container) return;

  const comparisons = [
    { label: 'Score', user: data.score, avg: data.avg_score },
    { label: 'Work Units', user: data.wus, avg: data.avg_wus },
    { label: 'Effizienz', user: data.efficiency, avg: data.avg_wus > 0 ? Math.round(data.avg_score / data.avg_wus) : 0 },
  ];

  container.innerHTML = comparisons.map(c => {
    const maxVal = Math.max(c.user, c.avg, 1);
    const userPct = (c.user / maxVal) * 100;
    const avgPct = (c.avg / maxVal) * 100;
    return '<div class="comparison-item">' +
      '<div class="comparison-label">' + escapeHtml(c.label) + '</div>' +
      '<div class="comparison-row">' +
        '<span class="comparison-tag">Du</span>' +
        '<div class="comparison-bar"><div class="comparison-bar-fill user-bar" style="width:' + userPct + '%"></div></div>' +
        '<span class="comparison-value">' + formatScore(c.user) + '</span>' +
      '</div>' +
      '<div class="comparison-row">' +
        '<span class="comparison-tag">Avg</span>' +
        '<div class="comparison-bar"><div class="comparison-bar-fill avg-bar" style="width:' + avgPct + '%"></div></div>' +
        '<span class="comparison-value">' + formatScore(c.avg) + '</span>' +
      '</div>' +
    '</div>';
  }).join('');
}

// ---- Achievement System ----

/** @type {Object<string, string>} Maps achievement tier names to their display colors. */
const ACH_TIER_COLORS = {
  bronze: '#cd7f32',
  silver: '#c0c0c0',
  gold: '#ffd700',
  platinum: '#e5e4e2',
  diamond: '#b9f2ff',
  legendary: '#ff6600',
};

// Achievement filter state
/** @type {Array} All unlocked achievements for the current donor. */
let achAllUnlocked = [];
/** @type {Array} All locked (not yet earned) achievements for the current donor. */
let achAllLocked = [];
/** @type {string} Active category filter ('all' or a specific category). */
let achActiveCategory = 'all';
/** @type {string} Current search query for achievement name filtering. */
let achSearchQuery = '';

/**
 * Updates the achievement summary bar (count, points, completion percentage, progress bar).
 * @param {{ unlocked_count: number, total: number, points_earned: number, completion_pct: number }} data - Achievement summary stats.
 */
function renderAchievementSummary(data) {
  var countEl = document.getElementById('ach-summary-count');
  var pointsEl = document.getElementById('ach-summary-points');
  var pctEl = document.getElementById('ach-summary-pct');
  var fillEl = document.getElementById('ach-progress-fill');

  if (countEl) countEl.textContent = data.unlocked_count + '/' + data.total + ' Achievements';
  if (pointsEl) pointsEl.textContent = formatNumber(data.points_earned) + ' Points';
  if (pctEl) pctEl.textContent = data.completion_pct + '% Complete';
  if (fillEl) fillEl.style.width = data.completion_pct + '%';
}

/**
 * Builds the HTML string for a single achievement card.
 * @param {{ id: string, name: string, tier: string, icon: string, points: number, progress?: number }} ach - Achievement data.
 * @param {boolean} isUnlocked - Whether the achievement has been earned.
 * @returns {string} HTML string for the card element.
 */
function buildAchievementCard(ach, isUnlocked) {
  var tierClass = 'tier-' + escapeHtml(ach.tier);
  var stateClass = isUnlocked ? 'unlocked' : 'locked';
  var html = '<div class="card ach-card ' + tierClass + ' ' + stateClass + '" data-ach-id="' + escapeHtml(ach.id) + '" data-unlocked="' + (isUnlocked ? '1' : '0') + '" tabindex="0" role="button" aria-label="' + escapeHtml(ach.name) + '">';
  html += '<span class="ach-card-icon">' + escapeHtml(ach.icon) + '</span>';
  html += '<div class="ach-card-name" title="' + escapeHtml(ach.name) + '">' + escapeHtml(ach.name) + '</div>';
  html += '<div class="ach-card-tier ' + ('tier-color-' + escapeHtml(ach.tier)) + '">' + escapeHtml(ach.tier.toUpperCase()) + '</div>';
  html += '<div class="ach-card-points">' + escapeHtml(String(ach.points)) + ' Pts</div>';

  if (!isUnlocked && typeof ach.progress === 'number') {
    var pct = Math.min(Math.round(ach.progress * 100), 100);
    html += '<div class="ach-card-progress"><div class="ach-card-progress-fill" style="width:' + pct + '%"></div></div>';
  }

  html += '</div>';
  return html;
}

/**
 * Filters achievements by active category and search query, then
 * renders them into the grid. Unlocked achievements appear first.
 */
function filterAndRenderAchievements() {
  var grid = document.getElementById('ach-grid');
  if (!grid) return;

  var query = achSearchQuery.toLowerCase();
  var cat = achActiveCategory;

  var filtered = [];

  // Unlocked first, then locked
  achAllUnlocked.forEach(function(a) {
    if (cat !== 'all' && a.category !== cat) return;
    if (query && a.name.toLowerCase().indexOf(query) === -1) return;
    filtered.push({ ach: a, unlocked: true });
  });

  achAllLocked.forEach(function(a) {
    if (cat !== 'all' && a.category !== cat) return;
    if (query && a.name.toLowerCase().indexOf(query) === -1) return;
    filtered.push({ ach: a, unlocked: false });
  });

  if (filtered.length === 0) {
    grid.innerHTML = '<div class="ach-empty">Keine Achievements gefunden.</div>';
    return;
  }

  grid.innerHTML = filtered.map(function(item) {
    return buildAchievementCard(item.ach, item.unlocked);
  }).join('');

  // Use event delegation instead of per-card listeners
  grid.onclick = function(e) {
    var card = e.target.closest('.ach-card');
    if (!card) return;
    var achId = card.getAttribute('data-ach-id');
    var isUnlocked = card.getAttribute('data-unlocked') === '1';
    openAchievementModal(achId, isUnlocked);
  };
  grid.onkeydown = function(e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    var card = e.target.closest('.ach-card');
    if (!card) return;
    e.preventDefault();
    var achId = card.getAttribute('data-ach-id');
    var isUnlocked = card.getAttribute('data-unlocked') === '1';
    openAchievementModal(achId, isUnlocked);
  };
}

/**
 * Opens a modal dialog showing detailed information about a single achievement,
 * including description, tier, points, unlock date, and progress bar.
 * @param {string} achId - The achievement identifier.
 * @param {boolean} isUnlocked - Whether the achievement is unlocked.
 */
function openAchievementModal(achId, isUnlocked) {
  var ach = null;
  if (isUnlocked) {
    ach = achAllUnlocked.find(function(a) { return a.id === achId; });
  } else {
    ach = achAllLocked.find(function(a) { return a.id === achId; });
  }
  if (!ach) return;

  var overlay = document.getElementById('ach-modal-overlay');
  var titleEl = document.getElementById('ach-modal-title');
  var bodyEl = document.getElementById('ach-modal-body');

  titleEl.textContent = 'Achievement Details';

  var tierColor = ACH_TIER_COLORS[ach.tier] || '#888888';
  var html = '';

  html += '<div class="ach-modal-icon">' + escapeHtml(ach.icon) + '</div>';
  html += '<div class="ach-modal-name">' + escapeHtml(ach.name) + '</div>';
  html += '<div class="ach-modal-desc">' + escapeHtml(ach.description) + '</div>';

  html += '<div class="ach-modal-meta">';
  html += '<span class="ach-modal-tier-badge" style="color:' + tierColor + ';border-color:' + tierColor + '">' + escapeHtml(ach.tier.toUpperCase()) + '</span>';
  html += '<span class="ach-modal-points-badge">' + escapeHtml(String(ach.points)) + ' Points</span>';
  html += '</div>';

  if (isUnlocked && ach.unlocked_at) {
    var d = new Date(ach.unlocked_at);
    var day = String(d.getDate()).padStart(2, '0');
    var month = String(d.getMonth() + 1).padStart(2, '0');
    var year = d.getFullYear();
    html += '<div class="ach-modal-unlocked-banner">Freigeschaltet am ' + day + '.' + month + '.' + year + '</div>';
  } else if (!isUnlocked) {
    html += '<div class="ach-modal-progress">';
    var progressPct = typeof ach.progress === 'number' ? Math.min(Math.round(ach.progress * 100), 100) : 0;
    html += '<div class="ach-modal-progress-bar"><div class="ach-modal-progress-fill" style="width:' + progressPct + '%"></div></div>';

    if (typeof ach.current !== 'undefined' && typeof ach.target !== 'undefined') {
      html += '<div class="ach-modal-progress-text">' + formatNumber(ach.current) + ' / ' + formatNumber(ach.target) + '</div>';
    }

    if (ach.hint) {
      html += '<div class="ach-modal-hint">' + escapeHtml(ach.hint) + '</div>';
    }
    html += '</div>';
  }

  bodyEl.innerHTML = html;
  overlay.classList.add('visible');
  // Focus trap
  var closeBtn = document.getElementById('ach-modal-close');
  if (closeBtn) closeBtn.focus();
}

/** Closes the achievement detail modal by removing the 'visible' class. */
function closeAchievementModal() {
  var overlay = document.getElementById('ach-modal-overlay');
  overlay.classList.remove('visible');
}

/**
 * Sets up event listeners for achievement category tabs, search input,
 * modal close button, overlay click-to-close, and keyboard navigation
 * (Escape to close, Tab focus trapping within modal).
 */
function initAchievementControls() {
  // Tab clicks
  var tabContainer = document.getElementById('ach-tabs');
  if (tabContainer) {
    tabContainer.addEventListener('click', function(e) {
      var tab = e.target.closest('.ach-tab');
      if (!tab) return;
      tabContainer.querySelectorAll('.ach-tab').forEach(function(t) { t.classList.remove('active'); });
      tab.classList.add('active');
      achActiveCategory = tab.getAttribute('data-category');
      filterAndRenderAchievements();
    });
  }

  // Search
  var searchInput = document.getElementById('ach-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', function() {
      achSearchQuery = searchInput.value;
      filterAndRenderAchievements();
    });
  }

  // Modal close
  var closeBtn = document.getElementById('ach-modal-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', closeAchievementModal);
  }

  var overlay = document.getElementById('ach-modal-overlay');
  if (overlay) {
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) closeAchievementModal();
    });
  }

  // Escape key
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') closeAchievementModal();
    // Focus trap for modal
    if (e.key === 'Tab') {
      var overlay = document.getElementById('ach-modal-overlay');
      if (!overlay || !overlay.classList.contains('visible')) return;
      var focusable = overlay.querySelectorAll('button, [tabindex]:not([tabindex="-1"])');
      if (focusable.length === 0) return;
      var first = focusable[0];
      var last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });
}

/**
 * Entry point for the achievement system. Stores unlocked/locked lists,
 * renders the summary, sets up controls, and triggers initial render.
 * @param {{ unlocked: Array, locked: Array, unlocked_count: number, total: number, points_earned: number, completion_pct: number }} achData - Full achievement data from API.
 */
function renderAchievements(achData) {
  achAllUnlocked = achData.unlocked || [];
  achAllLocked = achData.locked || [];

  renderAchievementSummary(achData);
  initAchievementControls();
  filterAndRenderAchievements();
}

// ---- Activity Heatmap ----

/** @type {string[]} Day-of-week labels (German, Sunday-first). */
const DAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

/**
 * Renders a canvas-based heatmap showing score deltas by day-of-week and hour.
 * Color intensity scales linearly from light beige (0) to dark blue/brown (max).
 * @param {HTMLElement} container - The DOM element to render the canvas into.
 * @param {Array<{ day_of_week: number, hour: number, score_delta: number }>} data - Heatmap data points.
 * @param {string} name - Donor name (reserved for tooltip/title use).
 */
function renderDonorHeatmap(container, data, name) {
  container.innerHTML = '';

  const cellSize = 18, cellGap = 2, labelW = 30, labelH = 20;
  const canvas = document.createElement('canvas');
  const width = labelW + 24 * (cellSize + cellGap);
  const height = labelH + 7 * (cellSize + cellGap);
  canvas.width = width;
  canvas.height = height;
  canvas.style.maxWidth = '100%';
  container.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  const matrix = Array.from({ length: 7 }, () => Array(24).fill(0));
  let maxVal = 1;
  data.forEach(d => {
    const day = parseInt(d.day_of_week);
    const hour = parseInt(d.hour);
    const val = d.score_delta || 0;
    matrix[day][hour] = val;
    if (val > maxVal) maxVal = val;
  });

  ctx.fillStyle = '#888888';
  ctx.font = "9px 'Courier New', monospace";
  ctx.textAlign = 'center';
  for (let h = 0; h < 24; h++) {
    if (h % 3 === 0) {
      ctx.fillText(String(h).padStart(2, '0'), labelW + h * (cellSize + cellGap) + cellSize / 2, labelH - 4);
    }
  }

  for (let d = 0; d < 7; d++) {
    const y = labelH + d * (cellSize + cellGap);
    ctx.fillStyle = '#888888';
    ctx.font = "10px 'Courier New', monospace";
    ctx.textAlign = 'right';
    ctx.fillText(DAYS[d], labelW - 4, y + cellSize / 2 + 3);

    for (let h = 0; h < 24; h++) {
      const x = labelW + h * (cellSize + cellGap);
      const val = matrix[d][h];
      const intensity = val / maxVal;
      const r = Math.round(240 - intensity * 240);
      const g = Math.round(240 - intensity * 200);
      const b = Math.round(240 - intensity * 36);
      ctx.fillStyle = val === 0 ? '#f0f0e8' : 'rgb(' + r + ',' + g + ',' + b + ')';
      ctx.fillRect(x, y, cellSize, cellSize);
      ctx.strokeStyle = '#d0d0d0';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(x, y, cellSize, cellSize);
    }
  }
}

// ---- Main Init ----

/**
 * Main entry point for the donor profile page. Extracts the donor name
 * from the URL, fetches summary/achievements/heatmap data in parallel,
 * and renders all profile sections.
 */
async function loadDonorProfile() {
  const name = getDonorName();
  if (!name) {
    document.getElementById('donor-name').textContent = 'Fehler';
    document.getElementById('donor-subtitle').textContent = 'Kein Donor-Name in der URL gefunden.';
    return;
  }

  document.getElementById('donor-name').textContent = name;
  document.getElementById('nav-donor-name').textContent = name;

  try {
    // Fetch summary and achievements in parallel
    const [summaryRes, achievementsRes, heatmapRes] = await Promise.all([
      fetch('/api/donor/' + encodeURIComponent(name) + '/summary'),
      fetch('/api/donor/' + encodeURIComponent(name) + '/achievements'),
      fetch('/api/heatmap/' + encodeURIComponent(name)),
    ]);

    if (!summaryRes.ok) {
      document.getElementById('donor-subtitle').textContent = 'Mitglied "' + name + '" nicht gefunden.';
      return;
    }

    const summary = await summaryRes.json();
    renderKPIs(summary);
    renderGains(summary);
    renderHistoryChart(summary.history);
    renderComparison(summary);

    if (achievementsRes.ok) {
      const achData = await achievementsRes.json();
      renderAchievements(achData);
    }

    // Heatmap
    const heatmapContainer = document.getElementById('donor-heatmap-container');
    if (heatmapRes.ok && heatmapContainer) {
      const heatmapData = await heatmapRes.json();
      if (heatmapData.length > 0) {
        renderDonorHeatmap(heatmapContainer, heatmapData, name);
      } else {
        heatmapContainer.innerHTML = '<div class="heatmap-empty">Noch nicht genug Daten fuer die Heatmap. Bitte nach einigen Snapshots erneut pruefen.</div>';
      }
    }

  } catch (err) {
    console.error('[DONOR] Profile load error:', err.message);
    document.getElementById('donor-subtitle').textContent = 'Fehler beim Laden des Profils.';
  }
}

document.addEventListener('DOMContentLoaded', loadDonorProfile);
