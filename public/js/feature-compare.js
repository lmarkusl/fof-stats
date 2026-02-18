// ============================================================
// Feature: Member-vs-Member Comparison
// Two dropdowns to select members, a compare button, and side-by-side
// bar charts showing Score, WUs, Efficiency, and Rank differences.
// Called via initCompare(). Depends on: utils.js, Chart.js
// ============================================================

// Inject component-specific styles into <head>
(function() {
  var style = document.createElement('style');
  style.textContent = [
    '.compare-controls { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 20px; padding: 12px; background: var(--bg-surface, #f8f8f2); border: 1px solid var(--border-subtle, #c0c0c0); }',
    '.compare-select { font-family: var(--font-mono, "Courier New", monospace); font-size: 0.85rem; padding: 6px 10px; background: #ffffff; border: 2px inset #c0c0c0; color: var(--text-primary, #1a1a1a); min-width: 160px; max-width: 220px; }',
    '.compare-select:focus-visible { border-color: var(--accent-blue, #0000cc); outline: 2px solid var(--accent-blue, #0000cc); outline-offset: -1px; }',
    '.compare-vs { font-family: var(--font-mono, "Courier New", monospace); font-size: 1rem; font-weight: 700; color: var(--text-muted, #666); }',
    '.compare-btn { padding: 6px 20px; font-size: 0.8rem; font-family: var(--font-mono, "Courier New", monospace); font-weight: 700; color: var(--text-primary, #1a1a1a); background: #d4d4d4; border: 2px outset #e0e0e0; cursor: pointer; text-transform: uppercase; }',
    '.compare-btn:hover { background: #c0c0c0; }',
    '.compare-btn:active { border-style: inset; }',
    '.compare-btn:disabled { opacity: 0.5; cursor: not-allowed; }',
    '.compare-result { display: grid; grid-template-columns: 1fr; gap: 16px; }',
    '.compare-header { display: grid; grid-template-columns: 1fr auto 1fr; gap: 12px; align-items: center; text-align: center; margin-bottom: 16px; padding: 12px; }',
    '.compare-player-name { font-family: var(--font-mono, "Courier New", monospace); font-size: 1.1rem; font-weight: 700; color: var(--text-primary, #1a1a1a); }',
    '.compare-player-name.winner { color: var(--accent-green, #008800); }',
    '.compare-header-vs { font-family: var(--font-mono, "Courier New", monospace); font-size: 1.4rem; font-weight: 700; color: var(--text-muted, #666); }',
    '.compare-bars { display: flex; flex-direction: column; gap: 12px; }',
    '.compare-bar-row { padding: 10px 12px; }',
    '.compare-bar-label { font-family: var(--font-mono, "Courier New", monospace); font-size: 0.7rem; font-weight: 700; color: var(--text-muted, #666); text-transform: uppercase; letter-spacing: 0.06em; text-align: center; margin-bottom: 8px; }',
    '.compare-bar-container { display: grid; grid-template-columns: 1fr 40px 1fr; gap: 4px; align-items: center; }',
    '.compare-bar-left { display: flex; justify-content: flex-end; }',
    '.compare-bar-right { display: flex; justify-content: flex-start; }',
    '.compare-bar-mid { text-align: center; font-family: var(--font-mono, "Courier New", monospace); font-size: 0.65rem; color: var(--text-muted, #666); }',
    '.compare-bar { height: 22px; border: 1px solid; min-width: 2px; transition: width 0.6s ease; position: relative; }',
    '.compare-bar-val { position: absolute; top: 50%; transform: translateY(-50%); font-family: var(--font-mono, "Courier New", monospace); font-size: 0.7rem; font-weight: 700; white-space: nowrap; padding: 0 6px; }',
    '.compare-bar-left .compare-bar { border-radius: 0; }',
    '.compare-bar-left .compare-bar-val { right: 100%; padding-right: 6px; }',
    '.compare-bar-right .compare-bar-val { left: 100%; padding-left: 6px; }',
    '.compare-bar.bar-green { background: var(--accent-green, #008800); border-color: #006600; }',
    '.compare-bar.bar-green .compare-bar-val { color: var(--accent-green, #008800); }',
    '.compare-bar.bar-red { background: var(--accent-red, #cc0000); border-color: #990000; }',
    '.compare-bar.bar-red .compare-bar-val { color: var(--accent-red, #cc0000); }',
    '.compare-bar.bar-tie { background: var(--text-muted, #666); border-color: #444; }',
    '.compare-bar.bar-tie .compare-bar-val { color: var(--text-muted, #666); }',
    '.compare-chart-container { min-height: 300px; margin-top: 16px; padding: 12px; }',
    '.compare-chart-canvas-wrap { position: relative; width: 100%; min-height: 280px; background: #ffffff; border: 1px solid #d0d0d0; }',
    '.compare-loading { text-align: center; padding: 24px; font-family: var(--font-mono, "Courier New", monospace); font-size: 0.8rem; color: var(--text-muted, #666); }',
    '@media (max-width: 768px) {',
    '  .compare-controls { flex-direction: column; align-items: stretch; }',
    '  .compare-select { max-width: 100%; }',
    '  .compare-vs { text-align: center; }',
    '  .compare-btn { width: 100%; }',
    '  .compare-header { grid-template-columns: 1fr; gap: 4px; }',
    '  .compare-bar-container { grid-template-columns: 1fr 30px 1fr; }',
    '}',
    '@media (max-width: 480px) {',
    '  .compare-bar-val { font-size: 0.6rem; }',
    '  .compare-player-name { font-size: 0.9rem; }',
    '}'
  ].join('\n');
  document.head.appendChild(style);
})();

/** Reference to the Chart.js comparison chart for cleanup. */
var _compareChartInstance = null;

/**
 * Initializes the compare section: loads member list into dropdowns
 * and wires up the compare button.
 */
function initCompare() {
  var container = document.getElementById('compare-section');
  if (!container) return;

  container.innerHTML = '<div class="compare-loading">Lade Mitgliederliste...</div>';

  fetch('/api/members')
    .then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function(members) {
      renderCompareUI(container, members);
    })
    .catch(function(err) {
      container.innerHTML = '<div class="error-message">' +
        'Fehler beim Laden der Mitgliederliste: ' + escapeHtml(err.message) +
        '</div>';
    });
}

/**
 * Renders the comparison UI with two dropdowns and a compare button.
 * @param {HTMLElement} container - The #compare-section element.
 * @param {Array} members - Array of member objects with name property.
 */
function renderCompareUI(container, members) {
  // Sort members alphabetically for dropdown
  var sorted = members.slice().sort(function(a, b) {
    return a.name.localeCompare(b.name);
  });

  var optionsHtml = '<option value="">-- Mitglied waehlen --</option>';
  for (var i = 0; i < sorted.length; i++) {
    optionsHtml += '<option value="' + escapeHtml(sorted[i].name) + '">' + escapeHtml(sorted[i].name) + '</option>';
  }

  var html = '';
  html += '<div class="compare-controls">';
  html += '<select id="compare-member-1" class="compare-select">' + optionsHtml + '</select>';
  html += '<span class="compare-vs">VS</span>';
  html += '<select id="compare-member-2" class="compare-select">' + optionsHtml + '</select>';
  html += '<button id="compare-btn" class="compare-btn" disabled>Vergleichen</button>';
  html += '</div>';
  html += '<div id="compare-result"></div>';

  container.innerHTML = html;

  var select1 = document.getElementById('compare-member-1');
  var select2 = document.getElementById('compare-member-2');
  var btn = document.getElementById('compare-btn');

  function updateBtnState() {
    btn.disabled = !(select1.value && select2.value && select1.value !== select2.value);
  }

  select1.addEventListener('change', updateBtnState);
  select2.addEventListener('change', updateBtnState);

  btn.addEventListener('click', function() {
    var name1 = select1.value;
    var name2 = select2.value;
    if (!name1 || !name2 || name1 === name2) return;
    performCompare(name1, name2);
  });
}

/**
 * Fetches comparison data and renders the result.
 * @param {string} name1 - First member name.
 * @param {string} name2 - Second member name.
 */
function performCompare(name1, name2) {
  var resultDiv = document.getElementById('compare-result');
  if (!resultDiv) return;

  resultDiv.innerHTML = '<div class="compare-loading">Vergleiche ' + escapeHtml(name1) + ' mit ' + escapeHtml(name2) + '...</div>';

  fetch('/api/compare/' + encodeURIComponent(name1) + '/' + encodeURIComponent(name2))
    .then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function(data) {
      renderCompareResult(resultDiv, data, name1, name2);
    })
    .catch(function(err) {
      resultDiv.innerHTML = '<div class="error-message">' +
        'Fehler beim Vergleich: ' + escapeHtml(err.message) +
        '</div>';
    });
}

/**
 * Renders the side-by-side comparison bars and optional Chart.js bar chart.
 * @param {HTMLElement} container - The #compare-result element.
 * @param {object} data - API response with member1/member2 stats.
 * @param {string} name1 - First member name.
 * @param {string} name2 - Second member name.
 */
function renderCompareResult(container, data, name1, name2) {
  var m1 = data.member1 || data.player1 || {};
  var m2 = data.member2 || data.player2 || {};

  var score1 = m1.score || 0;
  var score2 = m2.score || 0;
  var wus1 = m1.wus || m1.wu || 0;
  var wus2 = m2.wus || m2.wu || 0;
  var eff1 = wus1 > 0 ? Math.round(score1 / wus1) : 0;
  var eff2 = wus2 > 0 ? Math.round(score2 / wus2) : 0;
  var rank1 = m1.rank || 0;
  var rank2 = m2.rank || 0;

  // For rank, lower is better
  var metrics = [
    { label: 'Score', v1: score1, v2: score2, fmt: formatScore, lowerBetter: false },
    { label: 'Work Units', v1: wus1, v2: wus2, fmt: formatNumber, lowerBetter: false },
    { label: 'Effizienz (Pts/WU)', v1: eff1, v2: eff2, fmt: formatNumber, lowerBetter: false },
    { label: 'Rang', v1: rank1, v2: rank2, fmt: formatNumber, lowerBetter: true }
  ];

  // Determine overall winner
  var wins1 = 0;
  var wins2 = 0;
  for (var i = 0; i < metrics.length; i++) {
    var m = metrics[i];
    if (m.lowerBetter) {
      if (m.v1 > 0 && m.v2 > 0) {
        if (m.v1 < m.v2) wins1++;
        else if (m.v2 < m.v1) wins2++;
      }
    } else {
      if (m.v1 > m.v2) wins1++;
      else if (m.v2 > m.v1) wins2++;
    }
  }

  var html = '';

  // Header with names
  html += '<div class="card compare-header">';
  html += '<div class="compare-player-name' + (wins1 >= wins2 && wins1 > 0 ? ' winner' : '') + '">' + escapeHtml(name1) + (wins1 > wins2 ? ' *' : '') + '</div>';
  html += '<div class="compare-header-vs">VS</div>';
  html += '<div class="compare-player-name' + (wins2 >= wins1 && wins2 > 0 ? ' winner' : '') + '">' + escapeHtml(name2) + (wins2 > wins1 ? ' *' : '') + '</div>';
  html += '</div>';

  // Bar comparisons
  html += '<div class="compare-bars">';
  for (var i = 0; i < metrics.length; i++) {
    var m = metrics[i];
    var v1 = m.v1;
    var v2 = m.v2;
    var maxVal = Math.max(v1, v2, 1);

    // Determine who wins this metric
    var leftWins, rightWins;
    if (m.lowerBetter) {
      leftWins = (v1 > 0 && (v1 < v2 || v2 === 0));
      rightWins = (v2 > 0 && (v2 < v1 || v1 === 0));
    } else {
      leftWins = v1 > v2;
      rightWins = v2 > v1;
    }

    var leftClass = leftWins ? 'bar-green' : (rightWins ? 'bar-red' : 'bar-tie');
    var rightClass = rightWins ? 'bar-green' : (leftWins ? 'bar-red' : 'bar-tie');

    // For rank (lower=better), bar width is inverted: higher rank = smaller bar
    var leftWidth, rightWidth;
    if (m.lowerBetter) {
      // Invert: lower value gets bigger bar
      if (v1 === 0 && v2 === 0) {
        leftWidth = 50;
        rightWidth = 50;
      } else {
        var sumRank = (v1 || 1) + (v2 || 1);
        leftWidth = Math.max(5, Math.round(((v2 || 1) / sumRank) * 100));
        rightWidth = Math.max(5, Math.round(((v1 || 1) / sumRank) * 100));
      }
    } else {
      leftWidth = Math.max(5, Math.round((v1 / maxVal) * 100));
      rightWidth = Math.max(5, Math.round((v2 / maxVal) * 100));
    }

    html += '<div class="card compare-bar-row">';
    html += '<div class="compare-bar-label">' + escapeHtml(m.label) + '</div>';
    html += '<div class="compare-bar-container">';

    // Left bar (member 1) - grows from right to left
    html += '<div class="compare-bar-left">';
    html += '<div class="compare-bar ' + leftClass + '" style="width:' + leftWidth + '%">';
    html += '<span class="compare-bar-val">' + escapeHtml(m.fmt(v1)) + '</span>';
    html += '</div>';
    html += '</div>';

    html += '<div class="compare-bar-mid">|</div>';

    // Right bar (member 2) - grows from left to right
    html += '<div class="compare-bar-right">';
    html += '<div class="compare-bar ' + rightClass + '" style="width:' + rightWidth + '%">';
    html += '<span class="compare-bar-val">' + escapeHtml(m.fmt(v2)) + '</span>';
    html += '</div>';
    html += '</div>';

    html += '</div>'; // compare-bar-container
    html += '</div>'; // card
  }
  html += '</div>'; // compare-bars

  // Chart.js grouped bar chart
  html += '<div class="card compare-chart-container">';
  html += '<div class="compare-chart-canvas-wrap">';
  html += '<canvas id="compare-bar-chart"></canvas>';
  html += '</div>';
  html += '</div>';

  container.innerHTML = html;

  // Render Chart.js bar chart
  var canvas = document.getElementById('compare-bar-chart');
  if (canvas && typeof Chart !== 'undefined') {
    if (_compareChartInstance) {
      _compareChartInstance.destroy();
      _compareChartInstance = null;
    }

    // Normalize values to percentage of max for each metric so they fit on one chart
    var chartLabels = [];
    var data1 = [];
    var data2 = [];
    for (var i = 0; i < metrics.length; i++) {
      chartLabels.push(metrics[i].label);
      var localMax = Math.max(metrics[i].v1, metrics[i].v2, 1);
      data1.push(Math.round((metrics[i].v1 / localMax) * 100));
      data2.push(Math.round((metrics[i].v2 / localMax) * 100));
    }

    var ctx = canvas.getContext('2d');
    _compareChartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: chartLabels,
        datasets: [
          {
            label: name1,
            data: data1,
            backgroundColor: '#0000cc',
            borderColor: '#000088',
            borderWidth: 1
          },
          {
            label: name2,
            data: data2,
            backgroundColor: '#cc6600',
            borderColor: '#884400',
            borderWidth: 1
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            max: 110,
            ticks: {
              callback: function(val) { return val + '%'; },
              font: { family: "'Courier New', monospace", size: 10 }
            },
            title: {
              display: true,
              text: '% vom Maximum',
              font: { family: "'Courier New', monospace", size: 11 }
            },
            grid: { color: '#e0e0e0' }
          },
          x: {
            ticks: {
              font: { family: "'Courier New', monospace", size: 10 }
            },
            grid: { display: false }
          }
        },
        plugins: {
          legend: {
            labels: {
              font: { family: "'Courier New', monospace", size: 11 }
            }
          },
          tooltip: {
            backgroundColor: '#2c2c2c',
            titleFont: { family: "'Courier New', monospace", size: 12 },
            bodyFont: { family: "'Courier New', monospace", size: 11 },
            borderColor: '#808080',
            borderWidth: 1,
            callbacks: {
              label: function(context) {
                var idx = context.dataIndex;
                var setIdx = context.datasetIndex;
                var m = metrics[idx];
                var val = setIdx === 0 ? m.v1 : m.v2;
                return ' ' + context.dataset.label + ': ' + m.fmt(val);
              }
            }
          }
        }
      }
    });
  }
}
