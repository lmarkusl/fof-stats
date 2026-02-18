// ============================================================
// Feature: Donor Predictions (Persoenliche Prognosen)
// Displays personal score/rank projections, next milestones,
// trend analysis, and peer comparison for individual donors.
// Fetches data from /api/donor/:name/predictions
// Container: #donor-predictions (on donor profile page)
// Depends on: utils.js (escapeHtml, formatScore, formatNumber, formatScoreShort)
// ============================================================

// Inject component-specific styles into <head>
(function() {
  var style = document.createElement('style');
  style.textContent = [
    '.predictions-wrapper { display: flex; flex-direction: column; gap: 16px; }',
    '.predictions-trend-banner { display: flex; align-items: center; gap: 12px; padding: 12px 16px; font-family: var(--font-mono, "Courier New", monospace); font-size: 0.85rem; }',
    '.predictions-trend-icon { font-size: 1.6rem; flex-shrink: 0; }',
    '.predictions-trend-info { flex: 1; }',
    '.predictions-trend-direction { font-weight: 700; font-size: 0.9rem; color: var(--text-primary, #1a1a1a); }',
    '.predictions-trend-detail { font-size: 0.75rem; color: var(--text-secondary, #444); margin-top: 2px; }',
    '.predictions-trend-accelerating { border-left: 4px solid var(--accent-green, #008800); }',
    '.predictions-trend-steady { border-left: 4px solid var(--accent-blue, #0000cc); }',
    '.predictions-trend-slowing { border-left: 4px solid var(--accent-amber, #cc6600); }',
    '.predictions-stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }',
    '.predictions-stat-card { text-align: center; padding: 12px 8px; }',
    '.predictions-stat-value { font-family: var(--font-mono, "Courier New", monospace); font-size: 1.1rem; font-weight: 700; color: var(--accent-blue, #0000cc); }',
    '.predictions-stat-label { font-family: var(--font-mono, "Courier New", monospace); font-size: 0.6rem; font-weight: 700; color: var(--text-muted, #666); text-transform: uppercase; letter-spacing: 0.06em; margin-top: 4px; }',
    '.predictions-section-title { font-family: var(--font-mono, "Courier New", monospace); font-size: 0.7rem; font-weight: 700; color: var(--text-muted, #666); text-transform: uppercase; letter-spacing: 0.06em; padding: 8px 12px; background: #d4d4d4; border: 1px solid var(--border-strong, #808080); margin-bottom: 0; }',
    '.predictions-milestones { display: flex; flex-direction: column; gap: 0; }',
    '.predictions-milestone-item { display: flex; align-items: center; gap: 12px; padding: 10px 12px; font-family: var(--font-mono, "Courier New", monospace); font-size: 0.8rem; border: 1px solid #d0d0d0; border-top: none; background: #ffffff; }',
    '.predictions-milestone-item:nth-child(even) { background: #f5f5ef; }',
    '.predictions-milestone-target { font-weight: 700; color: var(--accent-blue, #0000cc); min-width: 80px; }',
    '.predictions-milestone-bar-wrap { flex: 1; display: flex; align-items: center; gap: 8px; }',
    '.predictions-milestone-bar { flex: 1; height: 12px; background: #e8e8e8; border: 1px inset #c0c0c0; overflow: hidden; }',
    '.predictions-milestone-bar-fill { height: 100%; background: var(--accent-green, #008800); transition: width 0.6s ease; }',
    '.predictions-milestone-remaining { font-size: 0.7rem; color: var(--text-muted, #666); white-space: nowrap; }',
    '.predictions-milestone-eta { font-size: 0.75rem; color: var(--text-secondary, #444); white-space: nowrap; min-width: 90px; text-align: right; }',
    '.predictions-projections-table { width: 100%; border-collapse: collapse; font-family: var(--font-mono, "Courier New", monospace); font-size: 0.8rem; }',
    '.predictions-projections-table thead tr { background: #d4d4d4; border: 1px solid var(--border-strong, #808080); }',
    '.predictions-projections-table th { padding: 8px 12px; text-align: left; font-size: 0.7rem; font-weight: 700; color: var(--text-muted, #666); text-transform: uppercase; letter-spacing: 0.06em; }',
    '.predictions-projections-table td { padding: 8px 12px; border: 1px solid #d0d0d0; border-top: none; }',
    '.predictions-projections-table tbody tr { background: #ffffff; }',
    '.predictions-projections-table tbody tr:nth-child(even) { background: #f5f5ef; }',
    '.predictions-projections-table tbody tr:hover { background: #e8e8ff; }',
    '.predictions-proj-score { font-weight: 700; color: var(--accent-blue, #0000cc); }',
    '.predictions-proj-date { color: var(--text-secondary, #444); }',
    '.predictions-peer { display: flex; flex-direction: column; gap: 0; }',
    '.predictions-peer-item { display: flex; align-items: center; gap: 12px; padding: 10px 12px; font-family: var(--font-mono, "Courier New", monospace); font-size: 0.8rem; border: 1px solid #d0d0d0; border-top: none; background: #ffffff; }',
    '.predictions-peer-item:nth-child(even) { background: #f5f5ef; }',
    '.predictions-peer-label { font-size: 0.7rem; font-weight: 700; color: var(--text-muted, #666); text-transform: uppercase; min-width: 70px; }',
    '.predictions-peer-name { font-weight: 700; color: var(--text-primary, #1a1a1a); flex: 1; }',
    '.predictions-peer-gap { font-size: 0.75rem; color: var(--text-secondary, #444); white-space: nowrap; }',
    '.predictions-peer-overtake { font-size: 0.75rem; color: var(--accent-green, #008800); font-weight: 700; white-space: nowrap; }',
    '.predictions-ach-forecast { display: flex; align-items: center; gap: 12px; padding: 12px; font-family: var(--font-mono, "Courier New", monospace); font-size: 0.8rem; }',
    '.predictions-ach-bar-wrap { flex: 1; }',
    '.predictions-ach-bar { height: 16px; background: #e8e8e8; border: 1px inset #c0c0c0; overflow: hidden; }',
    '.predictions-ach-bar-fill { height: 100%; background: var(--accent-purple, #6600aa); transition: width 0.6s ease; }',
    '.predictions-ach-text { font-size: 0.75rem; color: var(--text-secondary, #444); margin-top: 4px; }',
    '.predictions-loading, .predictions-empty { text-align: center; padding: 24px; font-family: var(--font-mono, "Courier New", monospace); font-size: 0.8rem; color: var(--text-muted, #666); }',
    '@media (max-width: 768px) {',
    '  .predictions-stats-grid { grid-template-columns: repeat(2, 1fr); }',
    '  .predictions-stat-value { font-size: 0.95rem; }',
    '  .predictions-milestone-item { flex-wrap: wrap; }',
    '  .predictions-milestone-bar-wrap { min-width: 100%; order: 3; }',
    '}',
    '@media (max-width: 480px) {',
    '  .predictions-stats-grid { grid-template-columns: 1fr; }',
    '  .predictions-peer-item { flex-wrap: wrap; gap: 4px; }',
    '  .predictions-projections-table { font-size: 0.7rem; }',
    '  .predictions-projections-table th, .predictions-projections-table td { padding: 6px 8px; }',
    '}'
  ].join('\n');
  document.head.appendChild(style);
})();

/**
 * Initializes the Donor Predictions section by fetching prediction
 * data for the specified donor and rendering the results.
 * @param {string} donorName - The donor name to load predictions for.
 */
function initDonorPredictions(donorName) {
  var container = document.getElementById('donor-predictions');
  if (!container) return;
  if (!donorName) {
    container.innerHTML = '<div class="predictions-empty">Kein Donor angegeben.</div>';
    return;
  }

  container.innerHTML = '<div class="predictions-loading">Lade persoenliche Prognosen...</div>';

  fetch('/api/donor/' + encodeURIComponent(donorName) + '/predictions')
    .then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function(data) {
      renderDonorPredictions(container, data);
    })
    .catch(function(err) {
      console.error('[PREDICTIONS] Load failed:', err.message);
      container.innerHTML = '<div class="predictions-empty">Fehler beim Laden der Prognosen: ' + escapeHtml(err.message) + '</div>';
    });
}

/**
 * Returns a German description and icon for a trend direction.
 * @param {string} direction - 'accelerating', 'steady', or 'slowing'
 * @returns {{ label: string, icon: string, css: string }}
 */
function trendInfo(direction) {
  if (direction === 'accelerating') {
    return { label: 'Beschleunigend', icon: '\u{1F680}', css: 'predictions-trend-accelerating' };
  }
  if (direction === 'slowing') {
    return { label: 'Verlangsamend', icon: '\u{1F4C9}', css: 'predictions-trend-slowing' };
  }
  return { label: 'Stabil', icon: '\u{1F4CA}', css: 'predictions-trend-steady' };
}

/**
 * Formats a number of days into a German string like "3 Tage" or "2 Monate".
 * @param {number|null} days - Number of days, or null.
 * @returns {string} Formatted string.
 */
function formatDaysDE(days) {
  if (days === null || days === undefined) return '---';
  if (days <= 0) return 'Jetzt';
  if (days === 1) return '1 Tag';
  if (days < 30) return days + ' Tage';
  if (days < 365) {
    var months = Math.round(days / 30);
    return months + (months === 1 ? ' Monat' : ' Monate');
  }
  var years = (days / 365).toFixed(1);
  return years + ' Jahre';
}

/**
 * Renders the full donor predictions dashboard.
 * @param {HTMLElement} container - The #donor-predictions element.
 * @param {object} data - API response with trends, projections, milestones, etc.
 */
function renderDonorPredictions(container, data) {
  var trends = data.trends || {};
  var current = data.current || {};
  var html = '<div class="predictions-wrapper">';

  // Trend banner
  var ti = trendInfo(trends.trend_direction);
  html += '<div class="card predictions-trend-banner ' + ti.css + '">';
  html += '<span class="predictions-trend-icon">' + ti.icon + '</span>';
  html += '<div class="predictions-trend-info">';
  html += '<div class="predictions-trend-direction">Trend: ' + escapeHtml(ti.label) + '</div>';
  html += '<div class="predictions-trend-detail">';
  html += '7-Tage PPD: ' + escapeHtml(formatScore(trends.ppd_7d || 0));
  html += ' | 30-Tage PPD: ' + escapeHtml(formatScore(trends.ppd_30d || 0));
  html += '</div>';
  html += '</div>';
  html += '</div>';

  // Current stats grid
  html += '<div class="predictions-stats-grid">';

  html += '<div class="card predictions-stat-card">';
  html += '<div class="predictions-stat-value">' + escapeHtml(formatScore(current.score || 0)) + '</div>';
  html += '<div class="predictions-stat-label">Aktueller Score</div>';
  html += '</div>';

  html += '<div class="card predictions-stat-card">';
  html += '<div class="predictions-stat-value">' + escapeHtml(formatNumber(current.wus || 0)) + '</div>';
  html += '<div class="predictions-stat-label">Work Units</div>';
  html += '</div>';

  html += '<div class="card predictions-stat-card">';
  html += '<div class="predictions-stat-value">' + escapeHtml(formatScore(trends.ppd_7d || 0)) + '/Tag</div>';
  html += '<div class="predictions-stat-label">PPD (7 Tage)</div>';
  html += '</div>';

  html += '<div class="card predictions-stat-card">';
  html += '<div class="predictions-stat-value">' + escapeHtml(formatNumber(trends.wus_per_day_7d || 0)) + '/Tag</div>';
  html += '<div class="predictions-stat-label">WU pro Tag</div>';
  html += '</div>';

  html += '</div>'; // predictions-stats-grid

  // Next milestones
  var milestones = data.next_milestones || [];
  if (milestones.length > 0) {
    html += '<div class="predictions-section-title">Naechste Meilensteine</div>';
    html += '<div class="predictions-milestones">';
    for (var i = 0; i < milestones.length; i++) {
      var ms = milestones[i];
      var pct = current.score > 0 ? Math.min(100, Math.round((current.score / ms.milestone) * 100)) : 0;
      html += '<div class="predictions-milestone-item">';
      html += '<span class="predictions-milestone-target">' + escapeHtml(formatScoreShort(ms.milestone)) + '</span>';
      html += '<span class="predictions-milestone-bar-wrap">';
      html += '<span class="predictions-milestone-bar">';
      html += '<span class="predictions-milestone-bar-fill" style="width:' + pct + '%"></span>';
      html += '</span>';
      html += '</span>';
      html += '<span class="predictions-milestone-remaining">Noch ' + escapeHtml(formatScoreShort(ms.remaining)) + '</span>';
      html += '<span class="predictions-milestone-eta">';
      if (ms.days_estimated !== null) {
        html += '~' + escapeHtml(formatDaysDE(ms.days_estimated));
      } else {
        html += '---';
      }
      html += '</span>';
      html += '</div>';
    }
    html += '</div>';
  }

  // Score projections table
  var projections = data.score_projections || [];
  if (projections.length > 0) {
    html += '<div class="predictions-section-title">Score-Prognosen</div>';
    html += '<table class="predictions-projections-table">';
    html += '<thead><tr>';
    html += '<th>Zeitraum</th>';
    html += '<th>Prognostizierter Score</th>';
    html += '<th>Datum</th>';
    html += '</tr></thead>';
    html += '<tbody>';
    for (var i = 0; i < projections.length; i++) {
      var proj = projections[i];
      html += '<tr>';
      html += '<td>' + escapeHtml(formatDaysDE(proj.days)) + '</td>';
      html += '<td class="predictions-proj-score">' + escapeHtml(formatScore(proj.projected_score || 0)) + '</td>';
      html += '<td class="predictions-proj-date">' + escapeHtml(proj.date || '---') + '</td>';
      html += '</tr>';
    }
    html += '</tbody></table>';
  }

  // Rank projections
  var rankProj = data.rank_projection || [];
  if (rankProj.length > 0) {
    html += '<div class="predictions-section-title">Rang-Prognosen</div>';
    html += '<table class="predictions-projections-table">';
    html += '<thead><tr>';
    html += '<th>Zeitraum</th>';
    html += '<th>Prognostizierter Rang</th>';
    html += '</tr></thead>';
    html += '<tbody>';
    for (var i = 0; i < rankProj.length; i++) {
      var rp = rankProj[i];
      html += '<tr>';
      html += '<td>' + escapeHtml(formatDaysDE(rp.days)) + '</td>';
      html += '<td class="predictions-proj-score">#' + escapeHtml(formatNumber(rp.projected_rank || 0)) + '</td>';
      html += '</tr>';
    }
    html += '</tbody></table>';
  }

  // Peer comparison
  var peer = data.peer_comparison || {};
  if (peer.above || peer.below) {
    html += '<div class="predictions-section-title">Peer-Vergleich (Team-Rang)</div>';
    html += '<div class="predictions-peer">';

    if (peer.above) {
      html += '<div class="predictions-peer-item">';
      html += '<span class="predictions-peer-label">\u25B2 Darueber</span>';
      html += '<span class="predictions-peer-name">' + escapeHtml(peer.above.name || '---') + '</span>';
      html += '<span class="predictions-peer-gap">Abstand: ' + escapeHtml(formatScore(peer.above.gap || 0)) + '</span>';
      if (peer.days_to_overtake !== null && peer.days_to_overtake !== undefined) {
        html += '<span class="predictions-peer-overtake">~' + escapeHtml(formatDaysDE(peer.days_to_overtake)) + ' zum Ueberholen</span>';
      }
      html += '</div>';
    }

    if (peer.below) {
      html += '<div class="predictions-peer-item">';
      html += '<span class="predictions-peer-label">\u25BC Darunter</span>';
      html += '<span class="predictions-peer-name">' + escapeHtml(peer.below.name || '---') + '</span>';
      html += '<span class="predictions-peer-gap">Vorsprung: ' + escapeHtml(formatScore(peer.below.gap || 0)) + '</span>';
      html += '</div>';
    }

    html += '</div>';
  }

  // Achievement forecast
  var achForecast = data.achievement_forecast || {};
  if (achForecast.total > 0) {
    var achPct = Math.round((achForecast.current_unlocked / achForecast.total) * 100);
    html += '<div class="predictions-section-title">Achievement-Fortschritt</div>';
    html += '<div class="card predictions-ach-forecast">';
    html += '<div class="predictions-ach-bar-wrap">';
    html += '<div class="predictions-ach-bar">';
    html += '<div class="predictions-ach-bar-fill" style="width:' + achPct + '%"></div>';
    html += '</div>';
    html += '<div class="predictions-ach-text">' +
      escapeHtml(String(achForecast.current_unlocked)) + ' / ' +
      escapeHtml(String(achForecast.total)) + ' Achievements freigeschaltet (' + achPct + '%)' +
      '</div>';
    html += '</div>';
    html += '</div>';
  }

  html += '</div>'; // predictions-wrapper

  container.innerHTML = html;
}
