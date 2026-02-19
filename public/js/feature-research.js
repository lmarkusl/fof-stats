// ============================================================
// Feature: Research Catalog - RESEARCH.EXE
// Displays a catalog of active Folding@Home research projects
// grouped by disease/cause. Shows a doughnut chart of project
// distribution, summary cards, and expandable cause sections
// with sample project details (institution, description).
// Fetches from /api/research
// Container: #research-stats
// Called via initResearch(). Depends on: utils.js, Chart.js
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
    '.research-item-name { display: flex; align-items: center; gap: 8px; font-weight: 700; color: var(--text-primary, #1a1a1a); }',
    '.research-color-dot { width: 10px; height: 10px; flex-shrink: 0; border: 1px solid var(--border-strong, #808080); }',
    '.research-item-stats { color: var(--text-secondary, #444); font-weight: 400; white-space: nowrap; }',
    '.research-item-bar { flex: 1; max-width: 80px; height: 10px; background: #e8e8e8; border: 1px inset #c0c0c0; margin: 0 12px; overflow: hidden; }',
    '.research-item-bar-fill { height: 100%; transition: width 0.6s ease; }',
    '.research-summary { display: flex; gap: 16px; margin-top: 16px; flex-wrap: wrap; }',
    '.research-summary-card { flex: 1; min-width: 140px; text-align: center; padding: 12px; }',
    '.research-summary-value { font-family: var(--font-mono, "Courier New", monospace); font-size: 1.4rem; font-weight: 700; color: var(--accent-blue, #0000cc); }',
    '.research-summary-label { font-family: var(--font-mono, "Courier New", monospace); font-size: 0.7rem; color: var(--text-muted, #666); text-transform: uppercase; margin-top: 4px; }',
    '.research-cause-header { cursor: pointer; user-select: none; }',
    '.research-cause-header:hover { background: #e8e8ff !important; }',
    '.research-cause-toggle { font-size: 0.65rem; margin-left: 6px; display: inline-block; transition: transform 0.3s ease; }',
    '.research-cause-toggle.open { transform: rotate(180deg); }',
    '.research-projects-body { max-height: 0; overflow: hidden; transition: max-height 0.4s ease; }',
    '.research-projects-body.expanded { max-height: 800px; }',
    '.research-project-card { padding: 8px 12px 8px 30px; font-family: var(--font-mono, "Courier New", monospace); font-size: 0.75rem; border: 1px solid #d0d0d0; border-top: none; background: #fafaf5; }',
    '.research-project-meta { color: var(--text-muted, #666); font-size: 0.7rem; margin-top: 2px; }',
    '.research-project-desc { color: var(--text-secondary, #444); font-size: 0.72rem; margin-top: 4px; line-height: 1.4; }',
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

/** German display names for FAH cause categories */
var _researchCauseNames = {
  'unspecified': 'Allgemein',
  'alzheimers': 'Alzheimer',
  'cancer': 'Krebs',
  'huntingtons': 'Huntington',
  'parkinsons': 'Parkinson',
  'influenza': 'Influenza',
  'diabetes': 'Diabetes',
  'covid-19': 'COVID-19'
};

/** Reference to the Chart.js doughnut instance for cleanup on re-init. */
var _researchChartInstance = null;

/**
 * Initializes the Research Catalog section by fetching data from /api/research
 * and rendering a doughnut chart + cause list into #research-stats.
 */
function initResearch() {
  var container = document.getElementById('research-stats');
  if (!container) return;

  container.innerHTML = '<div style="text-align:center;padding:24px;font-family:var(--font-mono);font-size:0.8rem;color:var(--text-muted);">Lade Projektkatalog...</div>';

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
        'Fehler beim Laden des Projektkatalogs: ' + escapeHtml(err.message) +
        '</div>';
    });
}

/**
 * Renders the research catalog: doughnut chart, summary cards, expandable cause list.
 * @param {HTMLElement} container - The #research-stats DOM element.
 * @param {object} data - API response with total_projects and causes array.
 */
function renderResearch(container, data) {
  var causes = data.causes || [];
  if (!causes.length) {
    container.innerHTML = '<div class="error-message">Keine Forschungsdaten verfuegbar.</div>';
    return;
  }

  causes.sort(function(a, b) { return (b.project_count || 0) - (a.project_count || 0); });

  var totalProjects = data.total_projects || 0;
  var activeCauses = 0;
  for (var i = 0; i < causes.length; i++) {
    if (causes[i].project_count > 0) activeCauses++;
  }

  var colors = [
    '#0000cc', '#cc0000', '#008800', '#6600aa', '#008080',
    '#cc6600', '#0066cc', '#994400', '#666666', '#884422'
  ];

  var labels = [];
  var values = [];
  for (var i = 0; i < causes.length; i++) {
    var displayName = _researchCauseNames[causes[i].name] || causes[i].name || 'Unbekannt';
    labels.push(displayName);
    values.push(causes[i].project_count || 0);
  }

  // === Summary Cards ===
  var html = '';
  html += '<div class="research-summary">';
  html += '<div class="card research-summary-card">';
  html += '<div class="research-summary-value">' + escapeHtml(formatNumber(totalProjects)) + '</div>';
  html += '<div class="research-summary-label">Projekte gesamt</div>';
  html += '</div>';
  html += '<div class="card research-summary-card">';
  html += '<div class="research-summary-value">' + escapeHtml(String(activeCauses)) + '</div>';
  html += '<div class="research-summary-label">Forschungsgebiete</div>';
  html += '</div>';
  if (causes.length > 0 && causes[0].project_count > 0) {
    html += '<div class="card research-summary-card">';
    html += '<div class="research-summary-value">' + escapeHtml(labels[0]) + '</div>';
    html += '<div class="research-summary-label">Aktivstes Gebiet</div>';
    html += '</div>';
  }
  html += '</div>';

  // === Main Content: Chart + List ===
  html += '<div class="research-wrapper">';

  // Chart area
  html += '<div class="research-chart-area">';
  html += '<div class="research-chart-container">';
  html += '<canvas id="research-doughnut-chart"></canvas>';
  html += '</div>';
  html += '</div>';

  // Cause list with expandable sample projects
  html += '<div class="research-list">';
  html += '<div class="research-list-header">Forschungsgebiet / Projekte</div>';

  var maxCount = values.length > 0 ? values[0] : 1;

  for (var i = 0; i < causes.length; i++) {
    var c = causes[i];
    var count = c.project_count || 0;
    if (count === 0) continue;
    var pct = totalProjects > 0 ? ((count / totalProjects) * 100).toFixed(1) : '0.0';
    var barWidth = maxCount > 0 ? Math.max(2, Math.round((count / maxCount) * 100)) : 0;
    var color = colors[i % colors.length];
    var hasSamples = c.sample_projects && c.sample_projects.length > 0;

    // Cause header row
    html += '<div class="research-item' + (hasSamples ? ' research-cause-header' : '') + '" data-cause-idx="' + i + '">';
    html += '<span class="research-item-name">';
    html += '<span class="research-color-dot" style="background:' + color + '"></span>';
    html += escapeHtml(labels[i]);
    html += '</span>';
    html += '<span class="research-item-bar"><span class="research-item-bar-fill" style="width:' + barWidth + '%;background:' + color + '"></span></span>';
    html += '<span class="research-item-stats">' + escapeHtml(formatNumber(count)) + ' (' + escapeHtml(pct) + '%)';
    if (hasSamples) {
      html += '<span class="research-cause-toggle" id="research-toggle-' + i + '">&#x25BC;</span>';
    }
    html += '</span>';
    html += '</div>';

    // Expandable sample projects
    if (hasSamples) {
      html += '<div class="research-projects-body" id="research-body-' + i + '">';
      for (var j = 0; j < c.sample_projects.length; j++) {
        var p = c.sample_projects[j];
        html += '<div class="research-project-card">';
        html += '<strong>Projekt #' + escapeHtml(String(p.id)) + '</strong>';
        if (p.institution) {
          html += ' &mdash; ' + escapeHtml(p.institution);
        }
        html += '<div class="research-project-meta">';
        if (p.manager) html += 'Manager: ' + escapeHtml(p.manager);
        if (p.modified) html += ' | Aktualisiert: ' + escapeHtml(p.modified.substring(0, 10));
        html += '</div>';
        if (p.description) {
          html += '<div class="research-project-desc">' + escapeHtml(p.description) + '</div>';
        }
        html += '</div>';
      }
      html += '</div>';
    }
  }
  html += '</div>'; // research-list
  html += '</div>'; // research-wrapper

  container.innerHTML = html;

  // === Wire up expand/collapse toggles ===
  for (var i = 0; i < causes.length; i++) {
    (function(idx) {
      var header = container.querySelector('[data-cause-idx="' + idx + '"]');
      var body = document.getElementById('research-body-' + idx);
      var toggle = document.getElementById('research-toggle-' + idx);
      if (header && body && toggle) {
        header.addEventListener('click', function() {
          var isOpen = body.classList.contains('expanded');
          if (isOpen) {
            body.classList.remove('expanded');
            toggle.classList.remove('open');
          } else {
            body.classList.add('expanded');
            toggle.classList.add('open');
          }
        });
      }
    })(i);
  }

  // === Render Doughnut Chart ===
  var canvas = document.getElementById('research-doughnut-chart');
  if (canvas && typeof Chart !== 'undefined') {
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
          legend: { display: false },
          tooltip: {
            backgroundColor: '#2c2c2c',
            titleFont: { family: "'Courier New', monospace", size: 12 },
            bodyFont: { family: "'Courier New', monospace", size: 11 },
            borderColor: '#808080',
            borderWidth: 1,
            callbacks: {
              label: function(context) {
                var val = context.parsed;
                var pct = totalProjects > 0 ? ((val / totalProjects) * 100).toFixed(1) : '0.0';
                return ' ' + formatNumber(val) + ' Projekte (' + pct + '%)';
              }
            }
          }
        }
      }
    });
  }
}
