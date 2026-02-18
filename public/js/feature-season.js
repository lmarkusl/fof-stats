// ============================================================
// Feature: SEASON.EXE - Saisonales XP/Level-System
// Displays the current season with countdown, XP progress bars,
// and a ranked leaderboard of season participants.
// Fetches from /api/season/current + /api/season/leaderboard
// Container: #season-board (in Tab Rangliste)
// Depends on: utils.js (escapeHtml, formatNumber, formatScore)
// ============================================================

// Inject component-specific styles into <head>
(function() {
  var style = document.createElement('style');
  style.textContent = [
    '.season-banner { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; margin-bottom: 16px; background: linear-gradient(90deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%); color: #e0e0ff; font-family: var(--font-mono, "Courier New", monospace); border: 2px outset #4040a0; }',
    '.season-banner-info { display: flex; flex-direction: column; gap: 4px; }',
    '.season-banner-title { font-size: 1rem; font-weight: 700; color: #ffffff; text-transform: uppercase; letter-spacing: 0.08em; }',
    '.season-banner-dates { font-size: 0.7rem; color: #a0a0cc; }',
    '.season-banner-countdown { display: flex; flex-direction: column; align-items: center; gap: 2px; }',
    '.season-countdown-value { font-size: 1.5rem; font-weight: 700; color: #ffcc00; }',
    '.season-countdown-label { font-size: 0.6rem; color: #a0a0cc; text-transform: uppercase; letter-spacing: 0.08em; }',
    '.season-table-wrap { overflow-x: auto; }',
    '.season-table { width: 100%; border-collapse: collapse; font-family: var(--font-mono, "Courier New", monospace); font-size: 0.8rem; }',
    '.season-table thead tr { background: #d4d4d4; border: 1px solid var(--border-strong, #808080); }',
    '.season-table th { padding: 8px 12px; text-align: left; font-size: 0.7rem; font-weight: 700; color: var(--text-muted, #666); text-transform: uppercase; letter-spacing: 0.06em; }',
    '.season-table th:last-child, .season-table td:last-child { text-align: right; }',
    '.season-row { border: 1px solid #d0d0d0; border-top: none; background: #ffffff; }',
    '.season-row:nth-child(even) { background: #f5f5ef; }',
    '.season-row:hover { background: #e8e8ff; }',
    '.season-row td { padding: 8px 12px; }',
    '.season-top1 { background: #fffde6 !important; }',
    '.season-top2 { background: #f5f5f5 !important; }',
    '.season-top3 { background: #fdf5ef !important; }',
    '.season-rank { font-weight: 700; color: var(--text-primary, #1a1a1a); white-space: nowrap; min-width: 40px; }',
    '.season-name { font-weight: 700; color: var(--text-primary, #1a1a1a); }',
    '.season-name a { color: var(--accent-blue, #0000cc); text-decoration: none; }',
    '.season-name a:hover { text-decoration: underline; }',
    '.season-xp { font-weight: 700; color: var(--accent-purple, #6600aa); }',
    '.season-level { font-weight: 700; color: var(--accent-green, #008800); }',
    '.season-rank-title { font-size: 0.75rem; color: var(--text-secondary, #444); font-style: italic; }',
    '.season-wins { color: var(--accent-amber, #cc6600); font-weight: 700; }',
    '.season-xp-bar-cell { display: flex; align-items: center; gap: 6px; }',
    '.season-xp-bar { flex: 1; height: 10px; background: #e8e8e8; border: 1px inset #c0c0c0; overflow: hidden; min-width: 50px; }',
    '.season-xp-bar-fill { height: 100%; background: var(--accent-purple, #6600aa); transition: width 0.6s ease; }',
    '.season-loading, .season-empty { text-align: center; padding: 24px; font-family: var(--font-mono, "Courier New", monospace); font-size: 0.8rem; color: var(--text-muted, #666); }',
    '@media (max-width: 768px) {',
    '  .season-banner { flex-direction: column; gap: 10px; text-align: center; }',
    '  .season-table { font-size: 0.75rem; }',
    '  .season-row td, .season-table th { padding: 6px 8px; }',
    '  .season-xp-bar { min-width: 30px; }',
    '}',
    '@media (max-width: 480px) {',
    '  .season-banner-title { font-size: 0.85rem; }',
    '  .season-countdown-value { font-size: 1.2rem; }',
    '  .season-xp-bar-cell { flex-direction: column; align-items: flex-start; gap: 2px; }',
    '  .season-xp-bar { width: 100%; }',
    '}'
  ].join('\n');
  document.head.appendChild(style);
})();

/**
 * Initializes the Season board by fetching current season info
 * and the leaderboard, then rendering both.
 */
function initSeason() {
  var container = document.getElementById('season-board');
  if (!container) return;

  container.innerHTML = '<div class="season-loading">Lade Saison-Daten...</div>';

  Promise.all([
    fetch('/api/season/current').then(function(r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }),
    fetch('/api/season/leaderboard').then(function(r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
  ]).then(function(results) {
    renderSeason(container, results[0], results[1]);
  }).catch(function(err) {
    console.error('[SEASON] Load failed:', err.message);
    container.innerHTML = '<div class="season-empty">Fehler beim Laden der Saison-Daten: ' + escapeHtml(err.message) + '</div>';
  });
}

/**
 * Renders the season banner and leaderboard table.
 * @param {HTMLElement} container - The #season-board element.
 * @param {object} current - Season info: { name, start_date, end_date, days_remaining }
 * @param {Array} leaderboard - Array of { name, xp, level, rank_title, wins }
 */
function renderSeason(container, current, leaderboard) {
  var entries = Array.isArray(leaderboard) ? leaderboard : (leaderboard.leaderboard || []);
  var html = '';

  // Season banner
  html += '<div class="season-banner">';
  html += '<div class="season-banner-info">';
  html += '<div class="season-banner-title">&#x1F3AE; ' + escapeHtml(current.name || 'Aktuelle Saison') + '</div>';
  html += '<div class="season-banner-dates">' +
    escapeHtml(current.start_date || '---') + ' bis ' +
    escapeHtml(current.end_date || '---') + '</div>';
  html += '</div>';
  html += '<div class="season-banner-countdown">';
  html += '<div class="season-countdown-value">' + escapeHtml(String(current.days_remaining || 0)) + '</div>';
  html += '<div class="season-countdown-label">Tage verbleibend</div>';
  html += '</div>';
  html += '</div>';

  if (!entries.length) {
    html += '<div class="season-empty">Noch keine Saison-Teilnehmer vorhanden.</div>';
    container.innerHTML = html;
    return;
  }

  // Find max XP for progress bar
  var maxXp = 1;
  for (var i = 0; i < entries.length; i++) {
    if ((entries[i].xp || 0) > maxXp) maxXp = entries[i].xp;
  }

  // Leaderboard table
  html += '<div class="season-table-wrap">';
  html += '<table class="season-table">';
  html += '<thead><tr>';
  html += '<th>Rang</th>';
  html += '<th>Name</th>';
  html += '<th>Level</th>';
  html += '<th>Titel</th>';
  html += '<th>XP</th>';
  html += '<th>Siege</th>';
  html += '</tr></thead>';
  html += '<tbody>';

  for (var i = 0; i < entries.length; i++) {
    var e = entries[i];
    var rank = i + 1;
    var medal = '';
    if (rank === 1) medal = '&#x1F947; ';
    else if (rank === 2) medal = '&#x1F948; ';
    else if (rank === 3) medal = '&#x1F949; ';

    var rankClass = '';
    if (rank <= 3) rankClass = ' season-top' + rank;

    var xpPct = maxXp > 0 ? Math.min(100, Math.round(((e.xp || 0) / maxXp) * 100)) : 0;
    var encodedName = encodeURIComponent(e.name || '');

    html += '<tr class="season-row' + rankClass + '">';
    html += '<td class="season-rank">' + medal + rank + '</td>';
    html += '<td class="season-name"><a href="/donor/' + encodedName + '">' + escapeHtml(e.name || '---') + '</a></td>';
    html += '<td class="season-level">Lv.' + escapeHtml(String(e.level || 1)) + '</td>';
    html += '<td class="season-rank-title">' + escapeHtml(e.rank_title || '---') + '</td>';
    html += '<td>';
    html += '<div class="season-xp-bar-cell">';
    html += '<span class="season-xp">' + escapeHtml(formatNumber(e.xp || 0)) + '</span>';
    html += '<div class="season-xp-bar"><div class="season-xp-bar-fill" style="width:' + xpPct + '%"></div></div>';
    html += '</div>';
    html += '</td>';
    html += '<td class="season-wins">' + escapeHtml(String(e.wins || 0)) + '</td>';
    html += '</tr>';
  }

  html += '</tbody></table>';
  html += '</div>';

  container.innerHTML = html;
}
