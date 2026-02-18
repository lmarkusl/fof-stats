// ============================================================
// Feature: Rivals - Rank History, Team Rivals & Crossings
// Displays team rank history chart (90 days), nearby rival teams
// with score deltas, and a timeline of rank crossing events.
// Fetches from /api/history/team, /api/rivals, /api/crossings
// Containers: #chart-rank-history, #rivals-container, #crossings-timeline
// Called via initRivals(). Depends on: utils.js (escapeHtml, formatScore), Chart.js
// ============================================================

// Inject CSS
(function() {
  var style = document.createElement('style');
  style.textContent = `
    .rivals-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .rivals-table { width: 100%; border-collapse: collapse; font-family: var(--font-mono, 'Courier New', monospace); font-size: 0.85rem; }
    .rivals-table th, .rivals-table td { padding: 8px 12px; text-align: left; border-bottom: 1px solid var(--border-color, #ccc); }
    .rivals-table th { color: var(--text-secondary, #888); font-size: 0.75rem; text-transform: uppercase; }
    .rivals-table tr.our-team { background: rgba(0,204,102,0.1); font-weight: bold; }
    .rivals-table .delta-positive { color: #00cc66; }
    .rivals-table .delta-negative { color: #cc3333; }
    .crossings-list { list-style: none; padding: 0; margin: 0; }
    .crossing-item { padding: 10px 12px; border-bottom: 1px solid var(--border-color, #ccc); display: flex; justify-content: space-between; align-items: center; font-family: var(--font-mono, 'Courier New', monospace); font-size: 0.85rem; }
    .crossing-date { color: var(--text-secondary, #888); }
    .crossing-rank { font-weight: bold; }
    .crossing-up { color: #00cc66; }
    .crossing-down { color: #cc3333; }
    .crossing-arrow { font-size: 1.2rem; }
    .crossing-positions { font-size: 0.8rem; color: var(--text-secondary, #888); }
    @media (max-width: 768px) { .rivals-grid { grid-template-columns: 1fr; } }
  `;
  document.head.appendChild(style);
})();

function initRivals() {
  initRankHistoryChart();
  initTeamRivals();
  initTeamCrossings();
}

function initRankHistoryChart() {
  var container = document.getElementById('chart-rank-history');
  if (!container || typeof Chart === 'undefined') return;

  fetch('/api/history/team?period=daily&limit=90')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (!data || data.length < 2) {
        container.innerHTML = '<div class="placeholder-message">Daten werden gesammelt...</div>';
        return;
      }

      // Use ensureCanvas from charts.js if available, otherwise create canvas manually
      var canvasId = 'canvas-rank-history';
      if (typeof destroyChart === 'function') destroyChart('chart-rank-history');
      container.innerHTML = '';
      var canvas = document.createElement('canvas');
      canvas.id = canvasId;
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', 'Rang-Verlauf der letzten 90 Tage');
      container.appendChild(canvas);
      var ctx = canvas.getContext('2d');

      var labels = data.map(function(d) { return d.date; });
      var ranks = data.map(function(d) { return d.best_rank; });

      var chart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [{
            label: 'Team Rang',
            data: ranks,
            borderColor: '#0066cc',
            backgroundColor: 'rgba(0, 102, 204, 0.1)',
            fill: true,
            tension: 0.3,
            pointRadius: 1,
            pointHoverRadius: 4,
            borderWidth: 2,
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                title: function(items) { return items[0].label; },
                label: function(item) { return 'Rang #' + item.raw; }
              }
            }
          },
          scales: {
            y: {
              reverse: true, // Lower rank = higher on chart
              title: { display: true, text: 'Rang', color: '#888' },
              ticks: { color: '#888' },
              grid: { color: 'rgba(136,136,136,0.2)' }
            },
            x: {
              ticks: {
                color: '#888',
                maxTicksLimit: 8,
                maxRotation: 0
              },
              grid: { display: false }
            }
          }
        }
      });

      if (typeof storeChart === 'function') storeChart('chart-rank-history', chart);
    })
    .catch(function() {
      container.innerHTML = '<div class="error-message">Fehler beim Laden des Rang-Verlaufs</div>';
    });
}

function initTeamRivals() {
  var container = document.getElementById('rivals-container');
  if (!container) return;

  fetch('/api/rivals')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (!data || !data.rivals || data.rivals.length === 0) {
        container.innerHTML = '<div class="placeholder-message">Keine Rivalen-Daten verfuegbar</div>';
        return;
      }

      var html = '<table class="rivals-table">';
      html += '<thead><tr><th>Rang</th><th>Team</th><th>Score</th><th>Delta</th></tr></thead>';
      html += '<tbody>';

      data.rivals.forEach(function(team) {
        var isUs = data.our_team && team.team_id === data.our_team.team_id;
        var rowClass = isUs ? ' class="our-team"' : '';
        var deltaClass = team.delta_score > 0 ? 'delta-positive' : team.delta_score < 0 ? 'delta-negative' : '';
        var deltaPrefix = team.delta_score > 0 ? '+' : '';

        html += '<tr' + rowClass + '>';
        html += '<td>#' + team.rank + '</td>';
        html += '<td>' + escapeHtml(team.name) + (isUs ? ' &#x2B50;' : '') + '</td>';
        html += '<td>' + formatScore(team.score) + '</td>';
        html += '<td class="' + deltaClass + '">' + (isUs ? '-' : deltaPrefix + formatScore(team.delta_score)) + '</td>';
        html += '</tr>';
      });

      html += '</tbody></table>';
      container.innerHTML = html;
    })
    .catch(function() {
      container.innerHTML = '<div class="error-message">Fehler beim Laden der Rivalen</div>';
    });
}

function initTeamCrossings() {
  var container = document.getElementById('crossings-timeline');
  if (!container) return;

  fetch('/api/crossings')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (!data || data.length === 0) {
        container.innerHTML = '<div class="placeholder-message">Noch keine Rang-Wechsel erfasst. Daten werden gesammelt...</div>';
        return;
      }

      // Show latest 20 crossings
      var crossings = data.slice(0, 20);
      var html = '<ul class="crossings-list">';

      crossings.forEach(function(c) {
        var dirClass = c.direction === 'up' ? 'crossing-up' : 'crossing-down';
        var arrow = c.direction === 'up' ? '&#x25B2;' : '&#x25BC;';
        var label = c.direction === 'up' ? 'aufgestiegen' : 'abgestiegen';

        html += '<li class="crossing-item">';
        html += '<span class="crossing-date">' + escapeHtml(c.date) + '</span>';
        html += '<span class="crossing-rank ' + dirClass + '">';
        html += '<span class="crossing-arrow">' + arrow + '</span> ';
        html += '#' + c.old_rank + ' &#x2192; #' + c.new_rank;
        html += '</span>';
        html += '<span class="crossing-positions">' + c.positions + ' ' + (c.positions === 1 ? 'Platz' : 'Plaetze') + ' ' + label + '</span>';
        html += '</li>';
      });

      html += '</ul>';
      container.innerHTML = html;
    })
    .catch(function() {
      container.innerHTML = '<div class="error-message">Fehler beim Laden der Crossings</div>';
    });
}
