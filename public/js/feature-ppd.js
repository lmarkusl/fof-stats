// ============================================================
// Feature: Points Per Day (PPD) and Production Stats
// ============================================================

// Inject styles
(function() {
  var style = document.createElement('style');
  style.textContent = [
    '.ppd-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 16px; }',
    '.ppd-card { text-align: center; padding: 16px 12px; }',
    '.ppd-value { font-size: 1.6rem; font-weight: bold; color: var(--accent-primary, #00cc66); font-family: var(--font-mono, "Courier New", monospace); }',
    '.ppd-label { font-size: 0.8rem; color: var(--text-secondary, #888); margin-top: 4px; text-transform: uppercase; }',
    '.ppd-trend { font-size: 0.75rem; margin-top: 4px; }',
    '.trend-up { color: #00cc66; }',
    '.trend-down { color: #cc3333; }',
    '.trend-stable { color: #888; }',
    '.production-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 16px; }',
    '.production-card { text-align: center; padding: 14px 12px; }',
    '.production-value { font-size: 1.3rem; font-weight: bold; color: var(--accent-secondary, #ffcc00); font-family: var(--font-mono, "Courier New", monospace); }',
    '.production-label { font-size: 0.8rem; color: var(--text-secondary, #888); margin-top: 4px; }',
    '.ppd-sparkline-container { display: flex; align-items: center; gap: 12px; padding: 8px 0; }',
    '.ppd-sparkline-label { font-size: 0.75rem; color: var(--text-secondary, #888); white-space: nowrap; }',
    '.ppd-sparkline { display: flex; align-items: flex-end; gap: 3px; height: 32px; }',
    '.spark-bar { width: 16px; background: var(--accent-primary, #00cc66); border-radius: 2px 2px 0 0; min-height: 2px; }',
    '@media (max-width: 768px) {',
    '  .ppd-grid, .production-grid { grid-template-columns: repeat(3, 1fr); gap: 8px; }',
    '  .ppd-value { font-size: 1.2rem; }',
    '  .production-value { font-size: 1.1rem; }',
    '}',
    '@media (max-width: 480px) {',
    '  .ppd-grid { grid-template-columns: 1fr; }',
    '  .production-grid { grid-template-columns: 1fr; }',
    '}'
  ].join('\n');
  document.head.appendChild(style);
})();

// Utilities provided by utils.js (formatScore, formatNumber, escapeHtml)

function initPPD() {
  var container = document.getElementById('ppd-stats');
  if (!container) return;

  Promise.all([
    fetch('/api/ppd').then(function(r) { return r.json(); }),
    fetch('/api/history/team?period=daily&limit=31').then(function(r) { return r.json(); })
  ]).then(function(results) {
    var ppdData = results[0];
    var historyData = results[1];
    renderPPD(container, ppdData, historyData);
  }).catch(function(err) {
    container.innerHTML = '<div class="error-message">Fehler beim Laden der PPD-Daten</div>';
  });
}

function renderPPD(container, ppdData, historyData) {
  var team = ppdData.team;

  // Calculate today/week/month gains from history data
  var todayGain = historyData.length > 0 ? historyData[historyData.length - 1].score_delta : 0;
  var weekGain = 0;
  var monthGain = 0;
  var weekSlice = historyData.slice(-7);
  for (var i = 0; i < weekSlice.length; i++) weekGain += (weekSlice[i].score_delta || 0);
  for (var i = 0; i < historyData.length; i++) monthGain += (historyData[i].score_delta || 0);

  // PPD trend: compare 7d vs 30d
  var ppdTrend = team.ppd_30d > 0 ? ((team.ppd_7d - team.ppd_30d) / team.ppd_30d * 100) : 0;
  var trendClass = ppdTrend > 0 ? 'trend-up' : ppdTrend < 0 ? 'trend-down' : 'trend-stable';
  var trendArrow = ppdTrend > 0 ? '&#x25B2;' : ppdTrend < 0 ? '&#x25BC;' : '&#x25C6;';
  var trendText = (ppdTrend > 0 ? '+' : '') + ppdTrend.toFixed(1) + '%';

  // 7-day sparkline bars
  var last7 = historyData.slice(-7);
  var maxDelta = Math.max.apply(null, last7.map(function(d) { return d.score_delta || 0; }));
  if (maxDelta <= 0) maxDelta = 1;
  var sparkBars = '';
  for (var i = 0; i < last7.length; i++) {
    var height = Math.max(2, Math.round((last7[i].score_delta || 0) / maxDelta * 30));
    sparkBars += '<div class="spark-bar" style="height:' + height + 'px"></div>';
  }

  var html = '';
  html += '<div class="ppd-grid">';

  // PPD Cards
  html += '<div class="card ppd-card">';
  html += '<div class="ppd-value">' + escapeHtml(formatScore(team.ppd_24h)) + '</div>';
  html += '<div class="ppd-label">PPD (aktuell)</div>';
  html += '</div>';

  html += '<div class="card ppd-card">';
  html += '<div class="ppd-value">' + escapeHtml(formatScore(team.ppd_7d)) + '</div>';
  html += '<div class="ppd-label">PPD (7-Tage &#x00D8;)</div>';
  html += '<div class="ppd-trend ' + trendClass + '">' + trendArrow + ' ' + escapeHtml(trendText) + '</div>';
  html += '</div>';

  html += '<div class="card ppd-card">';
  html += '<div class="ppd-value">' + escapeHtml(formatScore(team.ppd_30d)) + '</div>';
  html += '<div class="ppd-label">PPD (30-Tage &#x00D8;)</div>';
  html += '</div>';

  html += '</div>'; // ppd-grid

  // Production cards
  html += '<div class="production-grid">';

  html += '<div class="card production-card">';
  html += '<div class="production-value">' + escapeHtml(formatScore(todayGain)) + '</div>';
  html += '<div class="production-label">Heute</div>';
  html += '</div>';

  html += '<div class="card production-card">';
  html += '<div class="production-value">' + escapeHtml(formatScore(weekGain)) + '</div>';
  html += '<div class="production-label">Diese Woche</div>';
  html += '</div>';

  html += '<div class="card production-card">';
  html += '<div class="production-value">' + escapeHtml(formatScore(monthGain)) + '</div>';
  html += '<div class="production-label">Dieser Monat</div>';
  html += '</div>';

  html += '</div>'; // production-grid

  // Sparkline
  html += '<div class="ppd-sparkline-container">';
  html += '<div class="ppd-sparkline-label">7-Tage Trend</div>';
  html += '<div class="ppd-sparkline">' + sparkBars + '</div>';
  html += '</div>';

  container.innerHTML = html;
}
