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
      font-weight: bold;
    }
    .ehrung-milestone-mio {
      color: #888888;
    }
    .ehrung-milestone-mrd {
      color: #cc8800;
    }
    .ehrung-milestone-100mrd {
      color: #cc0000;
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

      var html = '<div class="ehrung-header">&#x1F3C6; EHRUNG.EXE - Letzte Meilensteine</div>';
      html += '<div class="ehrung-list">';
      for (var i = 0; i < data.length; i++) {
        var item = data[i];
        var num = Number(item.milestone);
        var label = Number(num).toLocaleString('de-DE');
        var colorClass = 'ehrung-milestone-mio';
        if (num >= 100e9) {
          colorClass = 'ehrung-milestone-100mrd';
        } else if (num >= 1e9) {
          colorClass = 'ehrung-milestone-mrd';
        }
        var dateStr = '---';
        if (item.detected_at) {
          var d = new Date(item.detected_at.replace(' ', 'T') + 'Z');
          dateStr = d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
            + ' ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
        }
        html += '<div class="ehrung-item">'
          + '<span class="ehrung-icon">&#x2B50;</span>'
          + '<a class="ehrung-name" href="/donor/' + encodeURIComponent(item.name) + '">' + escapeHtml(item.name) + '</a>'
          + '<span>hat</span>'
          + '<span class="ehrung-milestone ' + colorClass + '">' + escapeHtml(label) + '</span>'
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
