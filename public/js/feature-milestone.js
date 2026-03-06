// ============================================================
// Feature: Milestone Tracker + Rank Prediction
// ============================================================

// Utilities provided by utils.js (escapeHtml, formatScore, formatNumber, formatScoreShort)

async function initMilestoneFeatures() {
  try {
    const [milestonesRes, predictionRes] = await Promise.all([
      fetch('/api/milestones'),
      fetch('/api/prediction/rank'),
    ]);

    if (milestonesRes.ok) {
      const data = await milestonesRes.json();
      renderMilestones(data);
    }

    if (predictionRes.ok) {
      const pred = await predictionRes.json();
      renderPredictions(pred);
    }
  } catch (err) {
    console.error('[MILESTONES] Load failed:', err.message);
    var msEl = document.getElementById('milestone-tracker');
    if (msEl) msEl.innerHTML = '<div class="milestone-empty">Fehler beim Laden der Meilenstein-Daten.</div>';
    var rpEl = document.getElementById('rank-prediction');
    if (rpEl) rpEl.innerHTML = '<div class="prediction-empty">Fehler beim Laden der Prognose-Daten.</div>';
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

function renderPredictions(data) {
  const container = document.getElementById('rank-prediction');
  if (!container) return;

  if (!data.predictions || data.predictions.length === 0) {
    container.innerHTML = '<div class="prediction-empty">Noch nicht genug historische Daten fuer Rang-Prognosen.</div>';
    return;
  }

  const direction = data.rank_change_per_day < 0 ? 'aufsteigend' : data.rank_change_per_day > 0 ? 'absteigend' : 'stabil';

  const html = `
    <div class="prediction-current">
      Aktueller Rang: <strong>#${escapeHtml(String(data.current_rank))}</strong> | Trend: <strong>${escapeHtml(direction)}</strong> (${data.rank_change_per_day > 0 ? '+' : ''}${escapeHtml(data.rank_change_per_day.toFixed(2))}/Tag)
    </div>
    <div class="prediction-table">
      <table>
        <tr><th>Zeitraum</th><th>Prognose</th></tr>
        ${data.predictions.map(p => `
          <tr>
            <td>${escapeHtml(String(p.days))} Tage</td>
            <td><strong>#${escapeHtml(String(p.predicted_rank))}</strong></td>
          </tr>
        `).join('')}
      </table>
    </div>
  `;

  container.innerHTML = html;
}

