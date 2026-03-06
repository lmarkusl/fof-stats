// ============================================================
// Feature: EHRUNG.EXE - Milestone Ehrung (Celebration)
// Shows the last 10 members who reached a milestone.
// Fetches from /api/milestones/chronology?limit=10
// Container: #milestone-ehrung-card
// Called via initMilestoneEhrung(). Depends on: utils.js
// ============================================================

(function(){
  var style = document.createElement('style');
  style.textContent = `
    .ehrung-list {
      display: flex;
      flex-direction: column;
      gap: 0;
    }
    .ehrung-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 14px;
      background: #ffffff;
      border-bottom: 1px solid #d0d0d0;
      font-family: var(--font-mono);
      font-size: 0.85rem;
    }
    .ehrung-item:nth-child(even) {
      background: #f5f5f0;
    }
    .ehrung-item:hover {
      background: #e8e8e0;
    }
    .ehrung-item:last-child {
      border-bottom: none;
    }
    .ehrung-icon {
      font-size: 1.2rem;
      flex-shrink: 0;
    }
    .ehrung-name {
      color: #00cc66;
      font-weight: bold;
      cursor: pointer;
    }
    .ehrung-name:hover {
      text-decoration: underline;
    }
    .ehrung-milestone {
      color: #cc8800;
      font-weight: bold;
    }
    .ehrung-date {
      color: #888888;
      font-size: 0.75rem;
      margin-left: auto;
      white-space: nowrap;
    }
    .ehrung-empty {
      color: var(--text-muted);
      font-size: 0.85rem;
      font-family: var(--font-mono);
      padding: 16px;
    }
    .ehrung-header {
      padding: 8px 12px;
      background: #0000aa;
      color: #ffffff;
      font-family: var(--font-mono);
      font-size: 0.85rem;
      font-weight: 700;
      letter-spacing: 0.04em;
    }
  `;
  document.head.appendChild(style);
})();

function initMilestoneEhrung() {
  var container = document.getElementById('milestone-ehrung-card');
  if (!container) return;

  fetch('/api/milestones/chronology?limit=10')
    .then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function(data) {
      if (!data || data.length === 0) {
        container.innerHTML = '<div class="ehrung-empty">Noch keine Meilensteine erreicht.</div>';
        return;
      }

      var thresholdLabels = {
        '1000000': '1 Mio', '2000000': '2 Mio', '3000000': '3 Mio',
        '4000000': '4 Mio', '5000000': '5 Mio', '6000000': '6 Mio',
        '7000000': '7 Mio', '8000000': '8 Mio', '9000000': '9 Mio',
        '10000000': '10 Mio', '20000000': '20 Mio', '30000000': '30 Mio',
        '40000000': '40 Mio', '50000000': '50 Mio', '60000000': '60 Mio',
        '70000000': '70 Mio', '80000000': '80 Mio', '90000000': '90 Mio',
        '100000000': '100 Mio', '200000000': '200 Mio', '300000000': '300 Mio',
        '400000000': '400 Mio', '500000000': '500 Mio', '600000000': '600 Mio',
        '700000000': '700 Mio', '800000000': '800 Mio', '900000000': '900 Mio',
        '1000000000': '1 Mrd', '2000000000': '2 Mrd', '3000000000': '3 Mrd',
        '4000000000': '4 Mrd', '5000000000': '5 Mrd', '6000000000': '6 Mrd',
        '7000000000': '7 Mrd', '8000000000': '8 Mrd', '9000000000': '9 Mrd',
        '10000000000': '10 Mrd', '20000000000': '20 Mrd', '30000000000': '30 Mrd',
        '40000000000': '40 Mrd', '50000000000': '50 Mrd', '60000000000': '60 Mrd',
        '70000000000': '70 Mrd', '80000000000': '80 Mrd', '90000000000': '90 Mrd',
        '100000000000': '100 Mrd', '200000000000': '200 Mrd', '300000000000': '300 Mrd',
        '400000000000': '400 Mrd', '500000000000': '500 Mrd', '600000000000': '600 Mrd',
        '700000000000': '700 Mrd', '800000000000': '800 Mrd', '900000000000': '900 Mrd',
        '1000000000000': '1 Bio'
      };

      var html = '<div class="ehrung-header">&#x1F3C6; EHRUNG.EXE - Letzte Meilensteine</div>';
      html += '<div class="ehrung-list">';
      for (var i = 0; i < data.length; i++) {
        var item = data[i];
        var label = thresholdLabels[item.milestone] || formatScore(Number(item.milestone));
        var dateStr = '---';
        if (item.detected_at) {
          var d = new Date(item.detected_at.replace(' ', 'T') + 'Z');
          dateStr = d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
            + ' ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
        }
        html += '<div class="ehrung-item">'
          + '<span class="ehrung-icon">&#x2B50;</span>'
          + '<a class="ehrung-name" href="/donor.html?name=' + encodeURIComponent(item.name) + '">' + escapeHtml(item.name) + '</a>'
          + '<span>hat</span>'
          + '<span class="ehrung-milestone">' + escapeHtml(label) + '</span>'
          + '<span>Punkte erreicht!</span>'
          + '<span class="ehrung-date">' + escapeHtml(dateStr) + '</span>'
          + '</div>';
      }
      html += '</div>';
      container.innerHTML = html;
    })
    .catch(function(err) {
      console.error('[EHRUNG] Load failed:', err.message);
      container.innerHTML = '<div class="ehrung-empty">Fehler beim Laden der Meilenstein-Ehrungen.</div>';
    });
}
