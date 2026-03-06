// ============================================================
// Feature: Milestone Tracker
// ============================================================

// Utilities provided by utils.js (escapeHtml, formatScore, formatNumber, formatScoreShort)

async function initMilestoneFeatures() {
  try {
    var res = await fetch('/api/milestones');
    if (res.ok) {
      var data = await res.json();
      renderMilestones(data);
    }
  } catch (err) {
    console.error('[MILESTONES] Load failed:', err.message);
    var msEl = document.getElementById('milestone-tracker');
    if (msEl) msEl.innerHTML = '<div class="milestone-empty">Fehler beim Laden der Meilenstein-Daten.</div>';
  }
}

function renderMilestones(data) {
  const container = document.getElementById('milestone-tracker');
  if (!container) return;

  if (!data.milestones || data.milestones.length === 0 || data.daily_rate === 0) {
    container.innerHTML = '<div class="milestone-empty">Noch nicht genug Daten fuer Prognosen. Bitte warten...</div>';
    return;
  }

  const rateHtml = `
    <div class="milestone-rate">
      <span class="rate-label">Tagesrate:</span>
      <span class="rate-value">+${escapeHtml(formatScoreShort(data.daily_rate))}/Tag</span>
      <span class="rate-sep">|</span>
      <span class="rate-label">Wochenrate:</span>
      <span class="rate-value">+${escapeHtml(formatScoreShort(data.weekly_rate))}/Woche</span>
    </div>
  `;

  const milestonesHtml = data.milestones.slice(0, 4).map(m => {
    const pct = Math.min(100, (data.current_score / m.target) * 100);
    return `
      <div class="milestone-item">
        <div class="milestone-header">
          <span class="milestone-target">${escapeHtml(formatScoreShort(m.target))}</span>
          <span class="milestone-eta">${m.days_estimated ? 'ca. ' + escapeHtml(String(m.days_estimated)) + ' Tage' : '???'}</span>
        </div>
        <div class="milestone-bar">
          <div class="milestone-bar-fill" style="width:${pct}%"></div>
        </div>
        <div class="milestone-footer">
          <span>Noch ${escapeHtml(formatScoreShort(m.remaining))}</span>
          <span>${escapeHtml(String(m.estimated_date || '---'))}</span>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = rateHtml + '<div class="milestones-list">' + milestonesHtml + '</div>';
}
