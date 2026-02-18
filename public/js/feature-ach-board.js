// ============================================================
// Feature: Achievement Leaderboard
// Renders a Top-10 achievement ranking on the main dashboard.
// Fetches data from /api/achievements/leaderboard
// Container: #achievement-board
// ============================================================

// Utilities provided by utils.js (escapeHtml, formatScore, formatNumber)

// Inject component-specific styles into <head>
(function() {
  var style = document.createElement('style');
  style.textContent = [
    '.achboard-wrapper { overflow-x: auto; }',
    '.achboard-table { width: 100%; border-collapse: collapse; font-family: var(--font-mono, "Courier New", monospace); font-size: 0.8rem; }',
    '.achboard-table thead tr { background: #d4d4d4; border: 1px solid var(--border-strong, #808080); }',
    '.achboard-table th { padding: 8px 12px; text-align: left; font-size: 0.7rem; font-weight: 700; color: var(--text-muted, #666); text-transform: uppercase; letter-spacing: 0.06em; }',
    '.achboard-row { border: 1px solid #d0d0d0; border-top: none; background: #ffffff; }',
    '.achboard-row:nth-child(even) { background: #f5f5ef; }',
    '.achboard-row:hover { background: #e8e8ff; }',
    '.achboard-row td { padding: 8px 12px; }',
    '.achboard-top1 { background: #fffde6 !important; }',
    '.achboard-top2 { background: #f5f5f5 !important; }',
    '.achboard-top3 { background: #fdf5ef !important; }',
    '.achboard-rank { font-weight: 700; color: var(--text-primary, #1a1a1a); white-space: nowrap; }',
    '.achboard-name a { color: var(--accent-blue, #0000cc); text-decoration: none; font-weight: 700; }',
    '.achboard-name a:hover { text-decoration: underline; }',
    '.achboard-points { font-weight: 700; color: var(--accent-blue, #0000cc); }',
    '.achboard-unlocked { color: var(--text-secondary, #444); }',
    '.achboard-progress-cell { display: flex; align-items: center; gap: 8px; }',
    '.achboard-progress { flex: 1; height: 12px; background: #e8e8e8; border: 1px inset #c0c0c0; overflow: hidden; min-width: 60px; }',
    '.achboard-progress-fill { height: 100%; background: var(--accent-green, #008800); transition: width 0.6s ease; }',
    '.achboard-pct { font-size: 0.75rem; color: var(--text-muted, #666); white-space: nowrap; }',
    '.achboard-loading, .achboard-empty { text-align: center; padding: 24px; font-family: var(--font-mono, "Courier New", monospace); font-size: 0.8rem; color: var(--text-muted, #666); }',
    '@media (max-width: 768px) {',
    '  .achboard-table { font-size: 0.75rem; }',
    '  .achboard-row td, .achboard-table th { padding: 6px 8px; }',
    '  .achboard-progress { min-width: 40px; }',
    '}',
    '@media (max-width: 480px) {',
    '  .achboard-progress-cell { flex-direction: column; align-items: flex-start; gap: 2px; }',
    '  .achboard-progress { width: 100%; }',
    '}'
  ].join('\n');
  document.head.appendChild(style);
})();

/**
 * Initializes the Achievement Leaderboard by fetching data and rendering
 * a Top-10 table with rank, name, points, unlocked count, and progress bar.
 */
async function initAchievementBoard() {
  var container = document.getElementById('achievement-board');
  if (!container) return;

  container.innerHTML = '<div class="achboard-loading">Lade Achievement-Daten...</div>';

  try {
    var res = await fetch('/api/achievements/leaderboard');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    var data = await res.json();
    renderAchievementBoard(container, data);
  } catch (err) {
    console.error('[ACH-BOARD] Load failed:', err.message);
    container.innerHTML = '<div class="achboard-empty">Fehler beim Laden der Achievement-Daten.</div>';
  }
}

/**
 * Renders the achievement leaderboard table into the given container.
 * @param {HTMLElement} container - The #achievement-board element.
 * @param {Object} data - API response with .leaderboard array and optional .total_achievements count.
 */
function renderAchievementBoard(container, data) {
  var entries = Array.isArray(data) ? data : (data.leaderboard || []);
  var totalAchievements = data.total_achievements || 0;

  if (!entries.length) {
    container.innerHTML = '<div class="achboard-empty">Keine Achievement-Daten vorhanden.</div>';
    return;
  }

  var top10 = entries.slice(0, 10);

  var html = '';
  html += '<div class="achboard-wrapper">';
  html += '<table class="achboard-table">';
  html += '<thead><tr>';
  html += '<th>RANG</th>';
  html += '<th>NAME</th>';
  html += '<th>PUNKTE</th>';
  html += '<th>FREIGESCHALTET</th>';
  html += '<th>FORTSCHRITT</th>';
  html += '</tr></thead>';
  html += '<tbody>';

  top10.forEach(function(entry, i) {
    var rank = i + 1;
    var medal = '';
    if (rank === 1) medal = '&#x1F947; ';
    else if (rank === 2) medal = '&#x1F948; ';
    else if (rank === 3) medal = '&#x1F949; ';

    var name = escapeHtml(entry.donor_name || entry.name || '---');
    var points = entry.points || 0;
    var unlocked = entry.unlocked_count || entry.unlocked || 0;
    var total = entry.total || totalAchievements || unlocked;
    var pct = entry.completion_pct || (total > 0 ? Math.round((unlocked / total) * 100) : 0);
    var encodedName = encodeURIComponent(entry.donor_name || entry.name || '');

    var rankClass = '';
    if (rank <= 3) rankClass = ' achboard-top' + rank;

    html += '<tr class="achboard-row' + rankClass + '">';
    html += '<td class="achboard-rank">' + medal + rank + '</td>';
    html += '<td class="achboard-name"><a href="/donor/' + encodedName + '">' + name + '</a></td>';
    html += '<td class="achboard-points">' + escapeHtml(formatNumber(points)) + '</td>';
    html += '<td class="achboard-unlocked">' + escapeHtml(String(unlocked)) + (total > 0 ? ' / ' + escapeHtml(String(total)) : '') + '</td>';
    html += '<td class="achboard-progress-cell">';
    html += '<div class="achboard-progress">';
    html += '<div class="achboard-progress-fill" style="width:' + Math.min(pct, 100) + '%"></div>';
    html += '</div>';
    html += '<span class="achboard-pct">' + pct + '%</span>';
    html += '</td>';
    html += '</tr>';
  });

  html += '</tbody></table></div>';

  container.innerHTML = html;
}
