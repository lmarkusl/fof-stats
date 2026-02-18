// ============================================================
// Feature: DIARY.EXE - Persoenliches Wochen-Recap
// Displays a collapsible weekly recap card on the donor profile
// page with narrative summary, stats overview, and earned badges.
// Fetches from /api/donor/:name/recap?period=week
// Container: #donor-diary (in donor.html)
// Depends on: utils.js (escapeHtml, formatScore, formatNumber, formatScoreShort)
// ============================================================

// Inject component-specific styles into <head>
(function() {
  var style = document.createElement('style');
  style.textContent = [
    '.diary-card { overflow: hidden; }',
    '.diary-header { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; background: #d4d4d4; border-bottom: 1px solid var(--border-strong, #808080); cursor: pointer; user-select: none; }',
    '.diary-header:hover { background: #c8c8c8; }',
    '.diary-title { font-family: var(--font-mono, "Courier New", monospace); font-size: 0.85rem; font-weight: 700; color: var(--text-primary, #1a1a1a); text-transform: uppercase; letter-spacing: 0.06em; }',
    '.diary-toggle { font-family: var(--font-mono, "Courier New", monospace); font-size: 0.8rem; color: var(--text-muted, #666); transition: transform 0.3s ease; }',
    '.diary-toggle.open { transform: rotate(180deg); }',
    '.diary-body { max-height: 0; overflow: hidden; transition: max-height 0.4s ease; }',
    '.diary-body.expanded { max-height: 800px; }',
    '.diary-content { padding: 16px; }',
    '.diary-period { font-family: var(--font-mono, "Courier New", monospace); font-size: 0.7rem; color: var(--text-muted, #666); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 12px; }',
    '.diary-narrative { font-family: var(--font-mono, "Courier New", monospace); font-size: 0.85rem; color: var(--text-primary, #1a1a1a); line-height: 1.5; margin-bottom: 16px; padding: 10px 12px; background: #f8f8f2; border-left: 3px solid var(--accent-blue, #0000cc); }',
    '.diary-stats-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin-bottom: 16px; }',
    '.diary-stat { text-align: center; padding: 10px 6px; background: #ffffff; border: 1px solid #d0d0d0; }',
    '.diary-stat-value { font-family: var(--font-mono, "Courier New", monospace); font-size: 1rem; font-weight: 700; color: var(--accent-blue, #0000cc); }',
    '.diary-stat-label { font-family: var(--font-mono, "Courier New", monospace); font-size: 0.55rem; font-weight: 700; color: var(--text-muted, #666); text-transform: uppercase; letter-spacing: 0.04em; margin-top: 3px; }',
    '.diary-stat:nth-child(1) .diary-stat-value { color: var(--accent-green, #008800); }',
    '.diary-stat:nth-child(2) .diary-stat-value { color: var(--accent-amber, #cc6600); }',
    '.diary-stat:nth-child(3) .diary-stat-value { color: var(--accent-purple, #6600aa); }',
    '.diary-stat:nth-child(5) .diary-stat-value { color: var(--accent-teal, #008080); }',
    '.diary-badges-section { margin-top: 4px; }',
    '.diary-badges-title { font-family: var(--font-mono, "Courier New", monospace); font-size: 0.7rem; font-weight: 700; color: var(--text-muted, #666); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 8px; }',
    '.diary-badges { display: flex; flex-wrap: wrap; gap: 8px; }',
    '.diary-badge { display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; font-family: var(--font-mono, "Courier New", monospace); font-size: 0.7rem; font-weight: 700; background: #e8e8ff; border: 1px solid #c0c0e0; color: var(--accent-blue, #0000cc); }',
    '.diary-badge-icon { font-size: 0.9rem; }',
    '.diary-loading, .diary-empty { text-align: center; padding: 16px; font-family: var(--font-mono, "Courier New", monospace); font-size: 0.8rem; color: var(--text-muted, #666); }',
    '@media (max-width: 768px) {',
    '  .diary-stats-grid { grid-template-columns: repeat(3, 1fr); }',
    '  .diary-stat-value { font-size: 0.9rem; }',
    '}',
    '@media (max-width: 480px) {',
    '  .diary-stats-grid { grid-template-columns: repeat(2, 1fr); }',
    '  .diary-narrative { font-size: 0.8rem; }',
    '  .diary-badges { gap: 6px; }',
    '  .diary-badge { font-size: 0.65rem; padding: 3px 8px; }',
    '}'
  ].join('\n');
  document.head.appendChild(style);
})();

/**
 * Initializes the Diary recap for a specific donor.
 * @param {string} donorName - The donor's name.
 */
function initDiary(donorName) {
  var container = document.getElementById('donor-diary');
  if (!container) return;
  if (!donorName) {
    container.innerHTML = '<div class="diary-empty">Kein Donor angegeben.</div>';
    return;
  }

  container.innerHTML = '<div class="diary-loading">Lade Wochen-Recap...</div>';

  fetch('/api/donor/' + encodeURIComponent(donorName) + '/recap?period=week')
    .then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function(data) {
      renderDiary(container, data);
    })
    .catch(function(err) {
      console.error('[DIARY] Load failed:', err.message);
      container.innerHTML = '<div class="diary-empty">Fehler beim Laden des Wochen-Recaps: ' + escapeHtml(err.message) + '</div>';
    });
}

/**
 * Renders the diary recap card with collapsible body.
 * @param {HTMLElement} container - The #donor-diary element.
 * @param {object} data - { period_label, narrative, stats: {...}, badges: [] }
 */
function renderDiary(container, data) {
  var stats = data.stats || {};
  var badges = data.badges || [];
  var html = '';

  html += '<div class="card diary-card">';

  // Collapsible header
  html += '<div class="diary-header" id="diary-toggle-btn">';
  html += '<span class="diary-title">&#x1F4D3; Wochen-Recap</span>';
  html += '<span class="diary-toggle" id="diary-toggle-icon">&#x25BC;</span>';
  html += '</div>';

  // Collapsible body
  html += '<div class="diary-body" id="diary-body">';
  html += '<div class="diary-content">';

  // Period label
  if (data.period_label) {
    html += '<div class="diary-period">' + escapeHtml(data.period_label) + '</div>';
  }

  // Narrative
  if (data.narrative) {
    html += '<div class="diary-narrative">' + escapeHtml(data.narrative) + '</div>';
  }

  // Stats grid
  html += '<div class="diary-stats-grid">';

  html += '<div class="diary-stat">';
  html += '<div class="diary-stat-value">+' + escapeHtml(formatScoreShort(stats.score_gain || 0)) + '</div>';
  html += '<div class="diary-stat-label">Score</div>';
  html += '</div>';

  html += '<div class="diary-stat">';
  html += '<div class="diary-stat-value">+' + escapeHtml(formatNumber(stats.wus_gain || 0)) + '</div>';
  html += '<div class="diary-stat-label">Work Units</div>';
  html += '</div>';

  html += '<div class="diary-stat">';
  html += '<div class="diary-stat-value">' + escapeHtml(String(stats.achievements_unlocked || 0)) + '</div>';
  html += '<div class="diary-stat-label">Achievements</div>';
  html += '</div>';

  var rankChange = stats.rank_change || 0;
  var rankStr = rankChange > 0 ? '+' + rankChange + ' \u25B2' : rankChange < 0 ? rankChange + ' \u25BC' : '\u00B10';
  html += '<div class="diary-stat">';
  html += '<div class="diary-stat-value">' + escapeHtml(rankStr) + '</div>';
  html += '<div class="diary-stat-label">Rang</div>';
  html += '</div>';

  html += '<div class="diary-stat">';
  html += '<div class="diary-stat-value">' + escapeHtml(String(stats.streak_days || 0)) + '</div>';
  html += '<div class="diary-stat-label">Streak Tage</div>';
  html += '</div>';

  html += '</div>'; // diary-stats-grid

  // Badges
  if (badges.length > 0) {
    html += '<div class="diary-badges-section">';
    html += '<div class="diary-badges-title">Verdiente Abzeichen</div>';
    html += '<div class="diary-badges">';
    for (var i = 0; i < badges.length; i++) {
      var b = badges[i];
      var bIcon = b.icon || '&#x2B50;';
      var bName = b.name || b.label || b;
      html += '<div class="diary-badge">';
      html += '<span class="diary-badge-icon">' + (typeof bName === 'string' && typeof b === 'object' ? bIcon : '&#x2B50;') + '</span>';
      html += '<span>' + escapeHtml(typeof bName === 'string' ? bName : String(bName)) + '</span>';
      html += '</div>';
    }
    html += '</div>';
    html += '</div>';
  }

  html += '</div>'; // diary-content
  html += '</div>'; // diary-body
  html += '</div>'; // diary-card

  container.innerHTML = html;

  // Wire up toggle
  var toggleBtn = document.getElementById('diary-toggle-btn');
  var body = document.getElementById('diary-body');
  var icon = document.getElementById('diary-toggle-icon');

  if (toggleBtn && body && icon) {
    // Start expanded
    body.classList.add('expanded');
    icon.classList.add('open');

    toggleBtn.addEventListener('click', function() {
      var isOpen = body.classList.contains('expanded');
      if (isOpen) {
        body.classList.remove('expanded');
        icon.classList.remove('open');
      } else {
        body.classList.add('expanded');
        icon.classList.add('open');
      }
    });
  }
}
