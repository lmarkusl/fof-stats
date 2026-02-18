// ============================================================
// Feature: Research Impact Dashboard
// Displays disease distribution as a doughnut chart and a list
// of top research areas with their work unit counts.
// Called from app.js via initResearch() or standalone.
// Depends on: utils.js (escapeHtml, formatNumber), Chart.js
// ============================================================

// Inject component-specific styles into <head>
(function() {
  var style = document.createElement('style');
  style.textContent = [
    '.research-wrapper { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }',
    '.research-chart-area { display: flex; align-items: center; justify-content: center; min-height: 280px; }',
    '.research-chart-container { position: relative; width: 100%; max-width: 320px; }',
    '.research-list { display: flex; flex-direction: column; gap: 0; }',
    '.research-list-header { font-family: var(--font-mono, "Courier New", monospace); font-size: 0.7rem; font-weight: 700; color: var(--text-muted, #666); text-transform: uppercase; letter-spacing: 0.06em; padding: 8px 12px; background: #d4d4d4; border: 1px solid var(--border-strong, #808080); }',
    '.research-item { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; font-family: var(--font-mono, "Courier New", monospace); font-size: 0.8rem; border: 1px solid #d0d0d0; border-top: none; background: #ffffff; }',
    '.research-item:nth-child(even) { background: #f5f5ef; }',
    '.research-item:hover { background: #e8e8ff; }',
    '.research-item-name { display: flex; align-items: center; gap: 8px; font-weight: 700; color: var(--text-primary, #1a1a1a); }',
    '.research-color-dot { width: 10px; height: 10px; flex-shrink: 0; border: 1px solid var(--border-strong, #808080); }',
    '.research-item-wus { color: var(--text-secondary, #444); font-weight: 400; }',
    '.research-item-bar { flex: 1; max-width: 80px; height: 10px; background: #e8e8e8; border: 1px inset #c0c0c0; margin: 0 12px; overflow: hidden; }',
    '.research-item-bar-fill { height: 100%; transition: width 0.6s ease; }',
    '.research-summary { display: flex; gap: 16px; margin-top: 16px; flex-wrap: wrap; }',
    '.research-summary-card { flex: 1; min-width: 140px; text-align: center; padding: 12px; }',
    '.research-summary-value { font-family: var(--font-mono, "Courier New", monospace); font-size: 1.4rem; font-weight: 700; color: var(--accent-blue, #0000cc); }',
    '.research-summary-label { font-family: var(--font-mono, "Courier New", monospace); font-size: 0.7rem; color: var(--text-muted, #666); text-transform: uppercase; margin-top: 4px; }',
    '@media (max-width: 768px) {',
    '  .research-wrapper { grid-template-columns: 1fr; }',
    '  .research-chart-container { max-width: 260px; margin: 0 auto; }',
    '  .research-summary { gap: 10px; }',
    '  .research-summary-card { min-width: 100px; }',
    '  .research-summary-value { font-size: 1.1rem; }',
    '}',
    '@media (max-width: 480px) {',
    '  .research-summary { flex-direction: column; }',
    '  .research-item-bar { display: none; }',
    '}'
  ].join('\n');
  document.head.appendChild(style);
})();

/** Reference to the Chart.js doughnut instance for cleanup on re-init. */
var _researchChartInstance = null;

/**
 * Initializes the Research Impact section by fetching data from /api/research
 * and rendering a doughnut chart + ranked list into #research-stats.
 */
function initResearch() {
  var container = document.getElementById('research-stats');
  if (!container) return;

  container.innerHTML = '<div style="text-align:center;padding:24px;font-family:var(--font-mono);font-size:0.8rem;color:var(--text-muted);">Lade Forschungsdaten...</div>';

  fetch('/api/research')
    .then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function(data) {
      renderResearch(container, data);
    })
    .catch(function(err) {
      container.innerHTML = '<div class="error-message">' +
        '<span class="error-icon">!</span>' +
        'Fehler beim Laden der Forschungsdaten: ' + escapeHtml(err.message) +
        '</div>';
    });
}

/**
 * Renders the research impact dashboard: doughnut chart, ranked list, summary cards.
 * @param {HTMLElement} container - The #research-stats DOM element.
 * @param {object} data - API response with diseases array and summary fields.
 */
function renderResearch(container, data) {
  var diseases = data.diseases || data.areas || [];
  if (!diseases.length) {
    container.innerHTML = '<div class="error-message">Keine Forschungsdaten verfuegbar.</div>';
    return;
  }

  // Sort by WUs descending
  diseases.sort(function(a, b) { return (b.wus || b.wu_count || 0) - (a.wus || a.wu_count || 0); });

  var totalWUs = 0;
  for (var i = 0; i < diseases.length; i++) {
    totalWUs += (diseases[i].wus || diseases[i].wu_count || 0);
  }

  // Color palette matching the retro theme
  var colors = [
    '#0000cc', '#cc0000', '#008800', '#6600aa', '#008080',
    '#cc6600', '#0066cc', '#994400', '#666666', '#884422',
    '#cc8800', '#330066', '#006644', '#990000', '#004488'
  ];

  var labels = [];
  var values = [];
  for (var i = 0; i < diseases.length; i++) {
    labels.push(diseases[i].name || diseases[i].disease || 'Unbekannt');
    values.push(diseases[i].wus || diseases[i].wu_count || 0);
  }

  // Build HTML structure
  var html = '';

  // Summary cards at top
  html += '<div class="research-summary">';
  html += '<div class="card research-summary-card">';
  html += '<div class="research-summary-value">' + escapeHtml(String(diseases.length)) + '</div>';
  html += '<div class="research-summary-label">Forschungsgebiete</div>';
  html += '</div>';
  html += '<div class="card research-summary-card">';
  html += '<div class="research-summary-value">' + escapeHtml(formatNumber(totalWUs)) + '</div>';
  html += '<div class="research-summary-label">Work Units gesamt</div>';
  html += '</div>';
  if (data.top_disease || diseases.length > 0) {
    var topName = data.top_disease || labels[0];
    html += '<div class="card research-summary-card">';
    html += '<div class="research-summary-value">' + escapeHtml(topName) + '</div>';
    html += '<div class="research-summary-label">Top-Forschungsgebiet</div>';
    html += '</div>';
  }
  html += '</div>';

  // Main content: chart + list side by side
  html += '<div class="research-wrapper">';

  // Chart area
  html += '<div class="research-chart-area">';
  html += '<div class="research-chart-container">';
  html += '<canvas id="research-doughnut-chart"></canvas>';
  html += '</div>';
  html += '</div>';

  // Ranked list
  html += '<div class="research-list">';
  html += '<div class="research-list-header">Forschungsgebiet / Work Units</div>';
  var maxWU = values.length > 0 ? values[0] : 1;
  for (var i = 0; i < diseases.length; i++) {
    var wuVal = values[i];
    var pct = totalWUs > 0 ? ((wuVal / totalWUs) * 100).toFixed(1) : '0.0';
    var barWidth = maxWU > 0 ? Math.max(2, Math.round((wuVal / maxWU) * 100)) : 0;
    var color = colors[i % colors.length];
    html += '<div class="research-item">';
    html += '<span class="research-item-name">';
    html += '<span class="research-color-dot" style="background:' + color + '"></span>';
    html += escapeHtml(labels[i]);
    html += '</span>';
    html += '<span class="research-item-bar"><span class="research-item-bar-fill" style="width:' + barWidth + '%;background:' + color + '"></span></span>';
    html += '<span class="research-item-wus">' + escapeHtml(formatNumber(wuVal)) + ' WU (' + escapeHtml(pct) + '%)</span>';
    html += '</div>';
  }
  html += '</div>';

  html += '</div>'; // research-wrapper

  container.innerHTML = html;

  // Render Chart.js doughnut
  var canvas = document.getElementById('research-doughnut-chart');
  if (canvas && typeof Chart !== 'undefined') {
    // Destroy previous instance if any
    if (_researchChartInstance) {
      _researchChartInstance.destroy();
      _researchChartInstance = null;
    }

    var ctx = canvas.getContext('2d');
    _researchChartInstance = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: values,
          backgroundColor: colors.slice(0, labels.length),
          borderColor: '#ffffff',
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        cutout: '55%',
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            backgroundColor: '#2c2c2c',
            titleFont: { family: "'Courier New', monospace", size: 12 },
            bodyFont: { family: "'Courier New', monospace", size: 11 },
            borderColor: '#808080',
            borderWidth: 1,
            callbacks: {
              label: function(context) {
                var val = context.parsed;
                var pct = totalWUs > 0 ? ((val / totalWUs) * 100).toFixed(1) : '0.0';
                return ' ' + formatNumber(val) + ' WU (' + pct + '%)';
              }
            }
          }
        }
      }
    });
  }
}
