// ============================================================
// Feature: Achievement Leaderboard
// Renders a Top-10 achievement ranking on the main dashboard.
// Fetches data from /api/achievements/leaderboard
// Container: #achievement-board
// ============================================================

// Utilities provided by utils.js (escapeHtml, formatScore, formatNumber)

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
