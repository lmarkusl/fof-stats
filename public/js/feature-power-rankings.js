// ============================================================
// Feature: Power Rankings (Composite Scoring System)
// Renders a ranked leaderboard with composite power scores,
// tier badges, level indicators, and breakdowns. Includes a
// radar chart (Chart.js) for the selected member's breakdown.
// Fetches data from /api/power-rankings
// Container: #power-rankings
// Called via initPowerRankings(). Depends on: utils.js, Chart.js
// ============================================================

// Inject component-specific styles into <head>
(function() {
  var style = document.createElement('style');
  style.textContent = [
    '.pr-header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; padding: 10px 12px; background: var(--bg-surface, #f8f8f2); border: 1px solid var(--border-subtle, #c0c0c0); }',
    '.pr-header-title { font-family: var(--font-mono, "Courier New", monospace); font-size: 0.85rem; font-weight: 700; color: var(--text-primary, #1a1a1a); }',
    '.pr-tier-legend { display: flex; gap: 8px; flex-wrap: wrap; }',
    '.pr-tier-tag { font-family: var(--font-mono, "Courier New", monospace); font-size: 0.6rem; font-weight: 700; padding: 2px 8px; border: 1px solid; text-transform: uppercase; letter-spacing: 0.05em; }',
    '.pr-tier-bronze { color: #8B4513; border-color: #8B4513; background: #FAEBD7; }',
    '.pr-tier-silver { color: #606060; border-color: #808080; background: #F0F0F0; }',
    '.pr-tier-gold { color: #996600; border-color: #CC8800; background: #FFF8E0; }',
    '.pr-tier-platinum { color: #6600AA; border-color: #8800CC; background: #F4E8FF; }',
    '.pr-tier-diamond { color: #0044AA; border-color: #0066CC; background: #E8F0FF; }',
    '.pr-tier-legend { color: #CC0000; border-color: #FF0000; background: #FFF0F0; }',
    '.pr-table-wrap { overflow-x: auto; border: 1px inset #c0c0c0; }',
    '.pr-table { width: 100%; border-collapse: collapse; font-family: var(--font-mono, "Courier New", monospace); font-size: 0.8rem; }',
    '.pr-table th { background: #d4d4d4; border-bottom: 2px solid #808080; padding: 8px 10px; text-align: left; font-weight: 700; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; cursor: pointer; white-space: nowrap; }',
    '.pr-table th:hover { background: #c0c0c0; }',
    '.pr-table td { padding: 6px 10px; border-bottom: 1px solid #e8e8e8; }',
    '.pr-table tr:hover { background: #f5f5ff; }',
    '.pr-table tr.pr-selected { background: #e0e0ff; }',
    '.pr-rank-cell { font-weight: 700; text-align: center; width: 40px; }',
    '.pr-name-cell { font-weight: 700; color: var(--text-primary, #1a1a1a); cursor: pointer; }',
    '.pr-name-cell:hover { text-decoration: underline; color: var(--accent-blue, #0000cc); }',
    '.pr-power-cell { font-weight: 700; text-align: right; }',
    '.pr-level-cell { text-align: center; }',
    '.pr-level-badge { display: inline-block; padding: 1px 8px; font-size: 0.7rem; font-weight: 700; background: #2c2c2c; color: #f0f0e8; border: 1px solid #555; min-width: 32px; text-align: center; }',
    '.pr-tier-cell { text-align: center; }',
    '.pr-breakdown-cell { display: flex; gap: 2px; height: 14px; max-width: 200px; }',
    '.pr-bar-seg { height: 100%; min-width: 1px; }',
    '.pr-bar-score { background: #0000cc; }',
    '.pr-bar-ppd { background: #cc6600; }',
    '.pr-bar-eff { background: #008800; }',
    '.pr-bar-streak { background: #880088; }',
    '.pr-bar-ach { background: #cc0000; }',
    '.pr-num-cell { text-align: right; font-variant-numeric: tabular-nums; }',
    '.pr-chart-section { margin-top: 16px; padding: 12px; }',
    '.pr-chart-title { font-family: var(--font-mono, "Courier New", monospace); font-size: 0.85rem; font-weight: 700; color: var(--text-primary, #1a1a1a); margin-bottom: 8px; text-align: center; }',
    '.pr-chart-wrap { position: relative; width: 100%; max-width: 400px; margin: 0 auto; }',
    '.pr-loading, .pr-empty { text-align: center; padding: 24px; font-family: var(--font-mono, "Courier New", monospace); font-size: 0.8rem; color: var(--text-muted, #666); }',
    '.pr-legend { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; margin-top: 8px; font-family: var(--font-mono, "Courier New", monospace); font-size: 0.65rem; color: var(--text-muted, #666); }',
    '.pr-legend-item { display: flex; align-items: center; gap: 4px; }',
    '.pr-legend-color { width: 10px; height: 10px; border: 1px solid #888; }',
    '@media (max-width: 768px) {',
    '  .pr-table { font-size: 0.75rem; }',
    '  .pr-table th, .pr-table td { padding: 5px 6px; }',
    '  .pr-breakdown-cell { display: none; }',
    '  .pr-header { flex-direction: column; }',
    '  .pr-chart-wrap { max-width: 300px; }',
    '}',
    '@media (max-width: 480px) {',
    '  .pr-table { font-size: 0.7rem; }',
    '  .pr-num-cell { display: none; }',
    '}'
  ].join('\n');
  document.head.appendChild(style);
})();

/** Chart.js instance for the radar breakdown chart. */
var _prRadarChart = null;

/** Cached rankings data. */
var _prData = null;

/**
 * Initializes the Power Rankings feature.
 */
function initPowerRankings() {
  var container = document.getElementById('power-rankings');
  if (!container) return;

  container.innerHTML = '<div class="pr-loading">Lade Power Rankings...</div>';

  fetch('/api/power-rankings')
    .then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function(data) {
      _prData = data;
      renderPowerRankings(container, data);
    })
    .catch(function(err) {
      console.error('[POWER-RANKINGS] Load failed:', err.message);
      container.innerHTML = '<div class="pr-empty">Fehler beim Laden der Power Rankings.</div>';
    });
}

/**
 * Returns the CSS class for a tier name.
 * @param {string} tier - Tier name.
 * @returns {string} CSS class.
 */
function getPRTierClass(tier) {
  var map = {
    'Bronze': 'pr-tier-bronze',
    'Silver': 'pr-tier-silver',
    'Gold': 'pr-tier-gold',
    'Platinum': 'pr-tier-platinum',
    'Diamond': 'pr-tier-diamond',
    'Legend': 'pr-tier-legend'
  };
  return map[tier] || 'pr-tier-bronze';
}

/**
 * Returns a German label for the tier.
 * @param {string} tier - Tier name.
 * @returns {string} German tier label.
 */
function getPRTierLabel(tier) {
  var map = {
    'Bronze': 'Bronze',
    'Silver': 'Silber',
    'Gold': 'Gold',
    'Platinum': 'Platin',
    'Diamond': 'Diamant',
    'Legend': 'Legende'
  };
  return map[tier] || tier;
}

/**
 * Renders the Power Rankings table and optional radar chart.
 * @param {HTMLElement} container - The #power-rankings element.
 * @param {object} data - API response with rankings, tier_thresholds, total.
 */
function renderPowerRankings(container, data) {
  var rankings = data.rankings || [];

  if (rankings.length === 0) {
    container.innerHTML = '<div class="pr-empty">Keine Power Rankings verfuegbar.</div>';
    return;
  }

  var html = '';

  // Header with tier legend
  html += '<div class="pr-header">';
  html += '<div class="pr-header-title">POWER RANKINGS (' + escapeHtml(String(data.total || rankings.length)) + ' Mitglieder)</div>';
  html += '<div class="pr-tier-legend">';
  var tiers = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Legend'];
  for (var t = 0; t < tiers.length; t++) {
    html += '<span class="pr-tier-tag ' + getPRTierClass(tiers[t]) + '">' + escapeHtml(getPRTierLabel(tiers[t])) + '</span>';
  }
  html += '</div>';
  html += '</div>';

  // Table
  html += '<div class="pr-table-wrap">';
  html += '<table class="pr-table">';
  html += '<thead><tr>';
  html += '<th class="pr-rank-cell">#</th>';
  html += '<th>Name</th>';
  html += '<th>Tier</th>';
  html += '<th class="pr-level-cell">LVL</th>';
  html += '<th class="pr-num-cell">Power</th>';
  html += '<th class="pr-num-cell">Score</th>';
  html += '<th>Breakdown</th>';
  html += '</tr></thead>';
  html += '<tbody>';

  for (var i = 0; i < rankings.length; i++) {
    var r = rankings[i];
    var bd = r.breakdown || {};
    var total = r.power_score || 1;

    // Compute segment widths for breakdown bar
    var segScore = Math.round((bd.score_pts || 0) / total * 100);
    var segPpd = Math.round((bd.ppd_pts || 0) / total * 100);
    var segEff = Math.round((bd.efficiency_pts || 0) / total * 100);
    var segStreak = Math.round((bd.streak_pts || 0) / total * 100);
    var segAch = 100 - segScore - segPpd - segEff - segStreak;
    if (segAch < 0) segAch = 0;

    html += '<tr data-pr-idx="' + i + '">';
    html += '<td class="pr-rank-cell">' + escapeHtml(String(r.rank)) + '</td>';
    html += '<td class="pr-name-cell" data-pr-name="' + escapeHtml(r.name) + '">' + escapeHtml(r.name) + '</td>';
    html += '<td class="pr-tier-cell"><span class="pr-tier-tag ' + getPRTierClass(r.tier) + '">' + escapeHtml(getPRTierLabel(r.tier)) + '</span></td>';
    html += '<td class="pr-level-cell"><span class="pr-level-badge">LV.' + escapeHtml(String(r.level)) + '</span></td>';
    html += '<td class="pr-num-cell pr-power-cell">' + escapeHtml(formatNumber(r.power_score)) + '</td>';
    html += '<td class="pr-num-cell">' + escapeHtml(formatScore(r.raw ? r.raw.score : 0)) + '</td>';
    html += '<td>';
    html += '<div class="pr-breakdown-cell">';
    html += '<div class="pr-bar-seg pr-bar-score" style="width:' + segScore + '%" title="Score: ' + escapeHtml(String(bd.score_pts || 0)) + '"></div>';
    html += '<div class="pr-bar-seg pr-bar-ppd" style="width:' + segPpd + '%" title="PPD: ' + escapeHtml(String(bd.ppd_pts || 0)) + '"></div>';
    html += '<div class="pr-bar-seg pr-bar-eff" style="width:' + segEff + '%" title="Effizienz: ' + escapeHtml(String(bd.efficiency_pts || 0)) + '"></div>';
    html += '<div class="pr-bar-seg pr-bar-streak" style="width:' + segStreak + '%" title="Streak: ' + escapeHtml(String(bd.streak_pts || 0)) + '"></div>';
    html += '<div class="pr-bar-seg pr-bar-ach" style="width:' + segAch + '%" title="Achievements: ' + escapeHtml(String(bd.achievement_pts || 0)) + '"></div>';
    html += '</div>';
    html += '</td>';
    html += '</tr>';
  }

  html += '</tbody></table>';
  html += '</div>';

  // Legend for breakdown colors
  html += '<div class="pr-legend">';
  html += '<div class="pr-legend-item"><div class="pr-legend-color pr-bar-score"></div> Score</div>';
  html += '<div class="pr-legend-item"><div class="pr-legend-color pr-bar-ppd"></div> PPD</div>';
  html += '<div class="pr-legend-item"><div class="pr-legend-color pr-bar-eff"></div> Effizienz</div>';
  html += '<div class="pr-legend-item"><div class="pr-legend-color pr-bar-streak"></div> Streak</div>';
  html += '<div class="pr-legend-item"><div class="pr-legend-color pr-bar-ach"></div> Achievements</div>';
  html += '</div>';

  // Radar chart placeholder
  html += '<div class="card pr-chart-section" id="pr-radar-section" style="display:none;">';
  html += '<div class="pr-chart-title" id="pr-radar-title">Breakdown</div>';
  html += '<div class="pr-chart-wrap"><canvas id="pr-radar-canvas" width="400" height="400"></canvas></div>';
  html += '</div>';

  container.innerHTML = html;

  // Attach click handlers for name cells to show radar chart
  var nameCells = container.querySelectorAll('.pr-name-cell');
  for (var n = 0; n < nameCells.length; n++) {
    nameCells[n].addEventListener('click', function() {
      var name = this.getAttribute('data-pr-name');
      var idx = parseInt(this.parentElement.getAttribute('data-pr-idx'));
      showPRRadar(container, rankings[idx]);

      // Highlight selected row
      var rows = container.querySelectorAll('.pr-table tr');
      for (var r = 0; r < rows.length; r++) rows[r].classList.remove('pr-selected');
      this.parentElement.classList.add('pr-selected');
    });
  }
}

/**
 * Shows a radar chart for the selected member's power score breakdown.
 * @param {HTMLElement} container - The #power-rankings element.
 * @param {object} member - The selected ranking object.
 */
function showPRRadar(container, member) {
  var section = document.getElementById('pr-radar-section');
  var titleEl = document.getElementById('pr-radar-title');
  var canvas = document.getElementById('pr-radar-canvas');

  if (!section || !canvas || typeof Chart === 'undefined') return;

  section.style.display = '';
  titleEl.textContent = 'Breakdown: ' + member.name + ' (LV.' + member.level + ' ' + getPRTierLabel(member.tier) + ')';

  if (_prRadarChart) {
    _prRadarChart.destroy();
    _prRadarChart = null;
  }

  var bd = member.breakdown || {};
  var ctx = canvas.getContext('2d');

  _prRadarChart = new Chart(ctx, {
    type: 'radar',
    data: {
      labels: ['Score', 'PPD', 'Effizienz', 'Streak', 'Achievements'],
      datasets: [{
        label: member.name,
        data: [
          bd.score_pts || 0,
          bd.ppd_pts || 0,
          bd.efficiency_pts || 0,
          bd.streak_pts || 0,
          bd.achievement_pts || 0
        ],
        backgroundColor: 'rgba(0, 0, 204, 0.15)',
        borderColor: '#0000cc',
        borderWidth: 2,
        pointBackgroundColor: '#0000cc',
        pointBorderColor: '#000088',
        pointRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      scales: {
        r: {
          beginAtZero: true,
          max: 3000,
          ticks: {
            stepSize: 500,
            font: { family: "'Courier New', monospace", size: 9 },
            backdropColor: 'rgba(255,255,255,0.8)'
          },
          pointLabels: {
            font: { family: "'Courier New', monospace", size: 11, weight: 'bold' }
          },
          grid: { color: '#d0d0d0' },
          angleLines: { color: '#d0d0d0' }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#2c2c2c',
          titleFont: { family: "'Courier New', monospace", size: 12 },
          bodyFont: { family: "'Courier New', monospace", size: 11 },
          borderColor: '#808080',
          borderWidth: 1,
          callbacks: {
            label: function(context) {
              return ' ' + context.label + ': ' + formatNumber(context.raw) + ' Pkt.';
            }
          }
        }
      }
    }
  });
}
