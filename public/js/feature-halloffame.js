// ============================================================
// Feature: Hall of Fame (MOTW Archive)
// Renders a timeline of past "Member of the Week" winners.
// Fetches data from /api/halloffame
// Container: #hall-of-fame
// ============================================================

// Utilities provided by utils.js (escapeHtml, formatScore, formatScoreShort)

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
