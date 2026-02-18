// ============================================================
// Feature: Hall of Fame (MOTW Archive)
// Renders a timeline of past "Member of the Week" winners.
// Fetches data from /api/halloffame
// Container: #hall-of-fame
// ============================================================

// Utilities provided by utils.js (escapeHtml, formatScore, formatScoreShort)

// Inject component-specific styles into <head>
(function() {
  var style = document.createElement('style');
  style.textContent = [
    '.hof-timeline { position: relative; padding-left: 24px; border-left: 2px solid #c0c0c0; margin-left: 12px; }',
    '.hof-entry { position: relative; padding: 12px 16px; margin-bottom: 8px; background: #ffffff; border: 1px solid #d0d0d0; font-family: var(--font-mono, "Courier New", monospace); }',
    '.hof-entry:hover { background: #f5f5ff; }',
    '.hof-entry-current { border-color: var(--accent-blue, #0000cc); border-width: 2px; background: #f8f8ff; }',
    '.hof-marker { position: absolute; left: -33px; top: 16px; }',
    '.hof-marker-dot { display: block; width: 12px; height: 12px; background: #c0c0c0; border: 2px solid #808080; }',
    '.hof-marker-active { background: var(--accent-blue, #0000cc); border-color: var(--accent-blue, #0000cc); }',
    '.hof-header { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }',
    '.hof-week { font-size: 0.7rem; font-weight: 700; color: var(--text-muted, #666); text-transform: uppercase; letter-spacing: 0.06em; }',
    '.hof-badge { font-size: 0.6rem; font-weight: 700; color: #ffffff; background: var(--accent-blue, #0000cc); padding: 1px 6px; text-transform: uppercase; letter-spacing: 0.05em; }',
    '.hof-name { font-size: 0.9rem; font-weight: 700; color: var(--text-primary, #1a1a1a); margin-bottom: 4px; }',
    '.hof-stats { display: flex; gap: 8px; align-items: center; font-size: 0.75rem; color: var(--text-secondary, #444); }',
    '.hof-stat { white-space: nowrap; }',
    '.hof-sep { color: var(--text-muted, #666); }',
    '.hof-loading, .hof-empty { text-align: center; padding: 24px; font-family: var(--font-mono, "Courier New", monospace); font-size: 0.8rem; color: var(--text-muted, #666); }',
    '@media (max-width: 768px) {',
    '  .hof-timeline { padding-left: 16px; margin-left: 8px; }',
    '  .hof-marker { left: -25px; }',
    '  .hof-entry { padding: 10px 12px; }',
    '}',
    '@media (max-width: 480px) {',
    '  .hof-stats { flex-direction: column; gap: 2px; }',
    '  .hof-sep { display: none; }',
    '}'
  ].join('\n');
  document.head.appendChild(style);
})();

/**
 * Initializes the Hall of Fame by fetching the MOTW archive
 * and rendering a timeline list of winners.
 */
async function initHallOfFame() {
  var container = document.getElementById('hall-of-fame');
  if (!container) return;

  container.innerHTML = '<div class="hof-loading">Lade Hall of Fame...</div>';

  try {
    var res = await fetch('/api/halloffame');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    var data = await res.json();
    renderHallOfFame(container, data);
  } catch (err) {
    console.error('[HALL-OF-FAME] Load failed:', err.message);
    container.innerHTML = '<div class="hof-empty">Fehler beim Laden der Hall of Fame.</div>';
  }
}

/**
 * Renders the Hall of Fame timeline into the given container.
 * @param {HTMLElement} container - The #hall-of-fame element.
 * @param {Object|Array} data - API response; array of entries or object with .winners array.
 */
function renderHallOfFame(container, data) {
  var entries = Array.isArray(data) ? data : (data.winners || []);

  if (!entries.length) {
    container.innerHTML = '<div class="hof-empty">Noch keine Hall of Fame Eintraege vorhanden.</div>';
    return;
  }

  // Determine current MOTW (first entry is typically the most recent)
  var currentWeek = entries.length > 0 ? (entries[0].week || entries[0].week_label || '') : '';

  var html = '<div class="hof-timeline">';

  entries.forEach(function(entry, i) {
    var week = escapeHtml(entry.week || entry.week_label || 'KW ?');
    var name = escapeHtml(entry.name || '---');
    var scoreGain = entry.score_gained || entry.score_gain || 0;
    var wuGain = entry.wus_gained || entry.wu_gain || 0;
    var isCurrent = (i === 0);
    var currentClass = isCurrent ? ' hof-entry-current' : '';

    html += '<div class="hof-entry' + currentClass + '">';
    html += '<div class="hof-marker">';
    html += isCurrent ? '<span class="hof-marker-dot hof-marker-active"></span>' : '<span class="hof-marker-dot"></span>';
    html += '</div>';
    html += '<div class="hof-content">';
    html += '<div class="hof-header">';
    html += '<span class="hof-week">' + week + '</span>';
    if (isCurrent) html += '<span class="hof-badge">AKTUELL</span>';
    html += '</div>';
    html += '<div class="hof-name">';
    if (isCurrent) html += '&#x1F451; ';
    html += name;
    html += '</div>';
    html += '<div class="hof-stats">';
    html += '<span class="hof-stat">+' + escapeHtml(formatScoreShort(scoreGain)) + ' Score</span>';
    html += '<span class="hof-sep">|</span>';
    html += '<span class="hof-stat">+' + escapeHtml(Number(wuGain).toLocaleString('de-DE')) + ' WUs</span>';
    html += '</div>';
    html += '</div>';
    html += '</div>';
  });

  html += '</div>';

  container.innerHTML = html;
}
