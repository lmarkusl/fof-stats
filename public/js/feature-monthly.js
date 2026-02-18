// feature-monthly.js - Monthly Leaderboard and Active Member Filter

(function() {
  var style = document.createElement('style');
  style.textContent = `
    .monthly-table { width: 100%; border-collapse: collapse; font-family: var(--font-mono, 'Courier New', monospace); font-size: 0.85rem; }
    .monthly-table th, .monthly-table td { padding: 8px 12px; text-align: left; border-bottom: 1px solid var(--border-color, #ccc); }
    .monthly-table th { color: var(--text-secondary, #888); font-size: 0.75rem; text-transform: uppercase; }
    .monthly-table .rank-col { width: 50px; text-align: center; }
    .monthly-medal { font-size: 1.1rem; }
    .active-filter { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; font-family: var(--font-mono, 'Courier New', monospace); font-size: 0.85rem; }
    .active-filter label { color: var(--text-secondary, #888); cursor: pointer; display: flex; align-items: center; gap: 6px; }
    .active-filter input[type="checkbox"] { cursor: pointer; }
    .active-badge { display: inline-block; padding: 2px 6px; border-radius: 3px; font-size: 0.7rem; background: #00cc66; color: #000; margin-left: 6px; }
  `;
  document.head.appendChild(style);
})();

function initMonthly() {
  initMonthlyLeaderboard();
  initActiveFilter();
}

function initMonthlyLeaderboard() {
  var container = document.getElementById('monthly-leaderboard');
  if (!container) return;

  fetch('/api/leaderboard/monthly')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (!data || data.length === 0) {
        container.innerHTML = '<div class="placeholder-message">Noch keine Monatsdaten vorhanden</div>';
        return;
      }

      var medals = ['&#x1F947;', '&#x1F948;', '&#x1F949;'];
      var html = '<table class="monthly-table">';
      html += '<thead><tr><th class="rank-col">#</th><th>Name</th><th>Score Gewinn</th><th>WU Gewinn</th></tr></thead>';
      html += '<tbody>';

      data.forEach(function(m, i) {
        if (m.score_gained <= 0) return; // Skip inactive members
        var medal = i < 3 ? '<span class="monthly-medal">' + medals[i] + '</span>' : (i + 1);
        html += '<tr>';
        html += '<td class="rank-col">' + medal + '</td>';
        html += '<td><a href="/donor/' + encodeURIComponent(m.name) + '">' + escapeHtml(m.name) + '</a></td>';
        html += '<td>' + formatScore(m.score_gained) + '</td>';
        html += '<td>' + formatNumber(m.wus_gained) + '</td>';
        html += '</tr>';
      });

      html += '</tbody></table>';
      container.innerHTML = html;
    })
    .catch(function() {
      container.innerHTML = '<div class="error-message">Fehler beim Laden der Monatsdaten</div>';
    });
}

function initActiveFilter() {
  var container = document.getElementById('active-filter-container');
  if (!container) return;

  var isActive = localStorage.getItem('fof-active-filter') === 'true';

  var html = '<div class="active-filter">';
  html += '<label><input type="checkbox" id="active-filter-toggle" ' + (isActive ? 'checked' : '') + '> Nur aktive Mitglieder (letzte 7 Tage)</label>';
  html += '</div>';
  container.innerHTML = html;

  var toggle = document.getElementById('active-filter-toggle');
  if (toggle) {
    // Apply initial state
    if (isActive) applyActiveFilter(true);

    toggle.addEventListener('change', function() {
      localStorage.setItem('fof-active-filter', this.checked);
      applyActiveFilter(this.checked);
    });
  }
}

function applyActiveFilter(active) {
  // This integrates with the main leaderboard - hide rows with 0 contribution
  var rows = document.querySelectorAll('#leaderboard-body tr');
  rows.forEach(function(row) {
    if (!active) {
      row.style.display = '';
      return;
    }
    // Check if contribution column shows 0% or very low
    var cells = row.querySelectorAll('td');
    if (cells.length >= 7) {
      var contribText = cells[6].textContent.trim();
      var contribVal = parseFloat(contribText);
      // Show only if contribution > 0
      row.style.display = contribVal > 0 ? '' : 'none';
    }
  });
}
