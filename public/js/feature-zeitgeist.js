// ============================================================
// Feature: WEATHER.EXE + PREDICT.EXE - Zeitgeist Dashboard
// Compact overview card combining period-in-review highlights,
// top performers, records, and a rotating fun-facts ticker.
// Period buttons (Woche/Monat/Jahr) switch the data range.
// Fetches data from /api/zeitgeist/:period
// Container: #zeitgeist-section
// Called via initZeitgeist(). Depends on: utils.js
// ============================================================

// Inject component-specific styles into <head>
(function() {
  var style = document.createElement('style');
  style.textContent = [
    '.zg-card { font-family: "Courier New", monospace; background: #0c0c0c; border: 2px inset #404040; color: #f0f0e8; }',
    '.zg-titlebar { display: flex; align-items: center; justify-content: space-between; padding: 4px 10px; background: #000080; color: #ffffff; font-size: 0.75rem; font-weight: 700; letter-spacing: 0.05em; }',
    '.zg-titlebar-btns { display: flex; gap: 4px; }',
    '.zg-titlebar-btn { width: 14px; height: 14px; background: #c0c0c0; border: 1px outset #e0e0e0; font-size: 0.6rem; text-align: center; line-height: 12px; cursor: default; }',
    '.zg-period-bar { display: flex; gap: 0; background: #1a1a1a; border-bottom: 1px solid #333; }',
    '.zg-period-btn { flex: 1; padding: 6px 12px; font-family: "Courier New", monospace; font-size: 0.7rem; font-weight: 700; text-align: center; text-transform: uppercase; letter-spacing: 0.06em; background: #1a1a1a; color: #808080; border: none; border-right: 1px solid #333; cursor: pointer; }',
    '.zg-period-btn:last-child { border-right: none; }',
    '.zg-period-btn:hover { color: #00ff00; }',
    '.zg-period-btn.active { background: #0a2a0a; color: #00ff00; }',
    '.zg-body { padding: 12px; }',
    '.zg-date-range { font-size: 0.65rem; color: #666; text-align: center; margin-bottom: 10px; }',
    '.zg-highlights { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 14px; }',
    '.zg-hl-item { text-align: center; padding: 8px 6px; background: #1a1a1a; border: 1px solid #333; }',
    '.zg-hl-value { font-size: 1.1rem; font-weight: 700; }',
    '.zg-hl-value-green { color: #00ff00; }',
    '.zg-hl-value-yellow { color: #ffff00; }',
    '.zg-hl-value-cyan { color: #00ccff; }',
    '.zg-hl-value-purple { color: #cc44ff; }',
    '.zg-hl-value-orange { color: #ff8800; }',
    '.zg-hl-value-white { color: #ffffff; }',
    '.zg-hl-label { font-size: 0.6rem; color: #666; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 2px; }',
    '.zg-section-title { font-size: 0.65rem; font-weight: 700; color: #00ff00; text-transform: uppercase; letter-spacing: 0.06em; padding: 6px 0; border-bottom: 1px solid #333; margin: 12px 0 6px 0; }',
    '.zg-performers { display: flex; flex-direction: column; gap: 0; }',
    '.zg-perf-row { display: flex; align-items: center; gap: 8px; padding: 4px 6px; border-bottom: 1px solid #1a1a1a; font-size: 0.75rem; }',
    '.zg-perf-row:hover { background: #0a1a0a; }',
    '.zg-perf-rank { width: 24px; text-align: center; font-weight: 700; color: #ffff00; }',
    '.zg-perf-name { flex: 1; font-weight: 700; color: #ffffff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
    '.zg-perf-score { color: #00ff00; font-weight: 700; white-space: nowrap; }',
    '.zg-perf-wus { color: #808080; white-space: nowrap; margin-left: 8px; }',
    '.zg-records { display: flex; flex-direction: column; gap: 4px; }',
    '.zg-record { display: flex; align-items: center; gap: 8px; padding: 6px; background: #1a1a0a; border: 1px solid #333300; font-size: 0.75rem; }',
    '.zg-record-icon { color: #ffff00; flex-shrink: 0; }',
    '.zg-record-name { color: #ffffff; font-weight: 700; }',
    '.zg-record-detail { color: #808080; font-size: 0.65rem; }',
    '.zg-record-value { color: #00ff00; font-weight: 700; margin-left: auto; white-space: nowrap; }',
    '.zg-ticker { margin-top: 12px; border: 1px solid #333; background: #0a0a1a; }',
    '.zg-ticker-title { display: flex; align-items: center; justify-content: space-between; padding: 4px 8px; background: #1a1a2a; border-bottom: 1px solid #333; }',
    '.zg-ticker-label { font-size: 0.6rem; font-weight: 700; color: #cc44ff; text-transform: uppercase; letter-spacing: 0.06em; }',
    '.zg-ticker-counter { font-size: 0.6rem; color: #666; }',
    '.zg-ticker-body { padding: 10px; min-height: 44px; display: flex; align-items: center; gap: 8px; font-size: 0.75rem; color: #aaaaaa; }',
    '.zg-ticker-icon { font-size: 1rem; flex-shrink: 0; }',
    '.zg-ticker-text { flex: 1; line-height: 1.4; }',
    '.zg-ticker-nav { display: flex; justify-content: center; gap: 8px; padding: 4px 8px; border-top: 1px solid #333; background: #1a1a2a; }',
    '.zg-ticker-btn { padding: 2px 10px; font-family: "Courier New", monospace; font-size: 0.65rem; font-weight: 700; background: #1a1a2a; color: #cc44ff; border: 1px solid #cc44ff; cursor: pointer; }',
    '.zg-ticker-btn:hover { background: #2a1a3a; }',
    '.zg-status-bar { display: flex; align-items: center; justify-content: space-between; padding: 3px 10px; background: #c0c0c0; color: #000000; font-size: 0.6rem; font-weight: 700; }',
    '.zg-loading, .zg-empty { text-align: center; padding: 24px; font-size: 0.8rem; color: #808080; }',
    '@media (max-width: 768px) {',
    '  .zg-highlights { grid-template-columns: repeat(2, 1fr); }',
    '  .zg-hl-value { font-size: 0.95rem; }',
    '  .zg-perf-wus { display: none; }',
    '}',
    '@media (max-width: 480px) {',
    '  .zg-highlights { grid-template-columns: 1fr; }',
    '  .zg-period-bar { flex-direction: column; }',
    '  .zg-period-btn { border-right: none; border-bottom: 1px solid #333; }',
    '  .zg-period-btn:last-child { border-bottom: none; }',
    '}'
  ].join('\n');
  document.head.appendChild(style);
})();

/** Currently active zeitgeist period. */
var _zgCurrentPeriod = 'week';

/** Fun-facts from the latest zeitgeist response. */
var _zgFunFacts = [];

/** Current fun-fact index. */
var _zgFactIndex = 0;

/** Auto-rotation timer for fun-facts ticker. */
var _zgTickerTimer = null;

/**
 * Maps API icon strings to unicode/emoji characters.
 * @param {string} iconName - Icon identifier from the API.
 * @returns {string} Unicode character.
 */
function zgIcon(iconName) {
  var icons = {
    'science': '\u{1F52C}',
    'bolt': '\u26A1',
    'group': '\u{1F465}',
    'trending_up': '\u{1F4C8}',
    'star': '\u2B50',
    'trophy': '\u{1F3C6}'
  };
  return icons[iconName] || '\u{1F4A1}';
}

/**
 * Initializes the Zeitgeist section with period tabs and default view.
 */
function initZeitgeist() {
  var container = document.getElementById('zeitgeist-section');
  if (!container) return;

  renderZeitgeistShell(container);
  loadZeitgeistData(container, 'week');
}

/**
 * Renders the outer shell: titlebar, period buttons, content area, status bar.
 * @param {HTMLElement} container - The #zeitgeist-section element.
 */
function renderZeitgeistShell(container) {
  var html = '';
  html += '<div class="zg-card">';

  // Title bar
  html += '<div class="zg-titlebar">';
  html += '<span>C:\\FOF\\WEATHER.EXE + PREDICT.EXE</span>';
  html += '<div class="zg-titlebar-btns">';
  html += '<div class="zg-titlebar-btn">_</div>';
  html += '<div class="zg-titlebar-btn">X</div>';
  html += '</div>';
  html += '</div>';

  // Period buttons
  html += '<div class="zg-period-bar">';
  html += '<button class="zg-period-btn active" data-zg-period="week">WOCHE</button>';
  html += '<button class="zg-period-btn" data-zg-period="month">MONAT</button>';
  html += '<button class="zg-period-btn" data-zg-period="year">JAHR</button>';
  html += '</div>';

  // Content area
  html += '<div id="zg-content"><div class="zg-loading">Lade Zeitgeist-Daten...</div></div>';

  // Status bar
  html += '<div class="zg-status-bar">';
  html += '<span id="zg-status-text">Bereit</span>';
  html += '<span id="zg-status-time">---</span>';
  html += '</div>';

  html += '</div>'; // zg-card

  container.innerHTML = html;

  // Wire up period buttons
  var buttons = container.querySelectorAll('.zg-period-btn');
  for (var i = 0; i < buttons.length; i++) {
    buttons[i].addEventListener('click', function() {
      var period = this.getAttribute('data-zg-period');
      if (period === _zgCurrentPeriod) return;
      _zgCurrentPeriod = period;

      var allBtns = container.querySelectorAll('.zg-period-btn');
      for (var j = 0; j < allBtns.length; j++) allBtns[j].classList.remove('active');
      this.classList.add('active');

      loadZeitgeistData(container, period);
    });
  }
}

/**
 * Fetches zeitgeist data for the given period and renders content.
 * @param {HTMLElement} container - The #zeitgeist-section element.
 * @param {string} period - 'week', 'month', or 'year'.
 */
function loadZeitgeistData(container, period) {
  var content = document.getElementById('zg-content');
  if (!content) return;

  content.innerHTML = '<div class="zg-loading">Lade Zeitgeist-Daten...</div>';

  // Stop existing ticker
  if (_zgTickerTimer) { clearInterval(_zgTickerTimer); _zgTickerTimer = null; }

  fetch('/api/zeitgeist/' + encodeURIComponent(period))
    .then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function(data) {
      renderZeitgeistContent(content, data);
      updateZeitgeistStatus(period, data);
    })
    .catch(function(err) {
      console.error('[ZEITGEIST] Load failed:', err.message);
      content.innerHTML = '<div class="zg-empty">Fehler: ' + escapeHtml(err.message) + '</div>';
    });
}

/**
 * Updates the status bar text.
 * @param {string} period - Current period.
 * @param {object} data - API response.
 */
function updateZeitgeistStatus(period, data) {
  var statusText = document.getElementById('zg-status-text');
  var statusTime = document.getElementById('zg-status-time');
  var labels = { week: 'Woche', month: 'Monat', year: 'Jahr' };
  if (statusText) statusText.textContent = 'Zeitraum: ' + (labels[period] || period);
  if (statusTime) statusTime.textContent = new Date().toLocaleString('de-DE');
}

/**
 * Renders the zeitgeist content (highlights, performers, records, ticker).
 * @param {HTMLElement} content - The #zg-content element.
 * @param {object} data - API response from /api/zeitgeist/:period.
 */
function renderZeitgeistContent(content, data) {
  var h = data.highlights || {};
  var dr = data.date_range || {};
  var html = '';

  html += '<div class="zg-body">';

  // Date range
  if (dr.start && dr.end) {
    html += '<div class="zg-date-range">' + escapeHtml(dr.start) + ' &mdash; ' + escapeHtml(dr.end) + '</div>';
  }

  // Highlight KPIs
  html += '<div class="zg-highlights">';

  html += '<div class="zg-hl-item">';
  html += '<div class="zg-hl-value zg-hl-value-green">+' + escapeHtml(formatScore(h.total_score_gained || 0)) + '</div>';
  html += '<div class="zg-hl-label">Score Zuwachs</div>';
  html += '</div>';

  html += '<div class="zg-hl-item">';
  html += '<div class="zg-hl-value zg-hl-value-orange">+' + escapeHtml(formatNumber(h.total_wus_gained || 0)) + '</div>';
  html += '<div class="zg-hl-label">Work Units</div>';
  html += '</div>';

  html += '<div class="zg-hl-item">';
  html += '<div class="zg-hl-value zg-hl-value-cyan">' + escapeHtml(String(h.active_members || 0)) + '</div>';
  html += '<div class="zg-hl-label">Aktive Mitglieder</div>';
  html += '</div>';

  html += '<div class="zg-hl-item">';
  html += '<div class="zg-hl-value zg-hl-value-yellow">' + escapeHtml(String(h.new_milestones || 0)) + '</div>';
  html += '<div class="zg-hl-label">Meilensteine</div>';
  html += '</div>';

  html += '<div class="zg-hl-item">';
  html += '<div class="zg-hl-value zg-hl-value-purple">' + escapeHtml(String(h.new_achievements || 0)) + '</div>';
  html += '<div class="zg-hl-label">Achievements</div>';
  html += '</div>';

  var rankChange = h.rank_change || 0;
  var rankStr = rankChange > 0 ? '+' + rankChange : String(rankChange);
  var rankColor = rankChange > 0 ? 'zg-hl-value-green' : rankChange < 0 ? 'zg-hl-value-orange' : 'zg-hl-value-white';
  html += '<div class="zg-hl-item">';
  html += '<div class="zg-hl-value ' + rankColor + '">' + escapeHtml(rankStr) + '</div>';
  html += '<div class="zg-hl-label">Rang-Aenderung</div>';
  html += '</div>';

  html += '</div>'; // zg-highlights

  // Top Performers
  var performers = data.top_performers || [];
  if (performers.length > 0) {
    html += '<div class="zg-section-title">&gt; TOP PERFORMER</div>';
    html += '<div class="zg-performers">';
    var medals = ['#1', '#2', '#3', '#4', '#5'];
    for (var i = 0; i < performers.length; i++) {
      var p = performers[i];
      html += '<div class="zg-perf-row">';
      html += '<span class="zg-perf-rank">' + escapeHtml(medals[i] || '#' + (i + 1)) + '</span>';
      html += '<span class="zg-perf-name">' + escapeHtml(p.name || '---') + '</span>';
      html += '<span class="zg-perf-score">+' + escapeHtml(formatScore(p.score_gained || 0)) + '</span>';
      html += '<span class="zg-perf-wus">+' + escapeHtml(formatNumber(p.wus_gained || 0)) + ' WU</span>';
      html += '</div>';
    }
    html += '</div>';
  }

  // Records
  var records = data.records || [];
  if (records.length > 0) {
    html += '<div class="zg-section-title">&gt; REKORDE</div>';
    html += '<div class="zg-records">';
    for (var r = 0; r < records.length; r++) {
      var rec = records[r];
      var recIcon = rec.type === 'best_daily_score' ? '*' : '!';
      var recDesc = rec.type === 'best_daily_score' ? 'Bester Tages-Score' : 'Meiste WUs/Tag';
      html += '<div class="zg-record">';
      html += '<span class="zg-record-icon">' + escapeHtml(recIcon) + '</span>';
      html += '<span class="zg-record-name">' + escapeHtml(rec.holder || '---') + '</span>';
      html += '<span class="zg-record-detail"> &mdash; ' + escapeHtml(recDesc) + '</span>';
      html += '<span class="zg-record-value">' + escapeHtml(formatScore(rec.value || 0)) + '</span>';
      html += '</div>';
    }
    html += '</div>';
  }

  // Fun-Facts Ticker (PREDICT.EXE part)
  var funFacts = data.fun_facts || [];
  _zgFunFacts = funFacts;
  _zgFactIndex = 0;

  if (funFacts.length > 0) {
    html += '<div class="zg-ticker" id="zg-ticker">';
    html += '<div class="zg-ticker-title">';
    html += '<span class="zg-ticker-label">PREDICT.EXE - Fun Facts</span>';
    html += '<span class="zg-ticker-counter" id="zg-ticker-counter">1/' + funFacts.length + '</span>';
    html += '</div>';
    html += '<div class="zg-ticker-body" id="zg-ticker-body">';
    html += '<span class="zg-ticker-icon">' + zgIcon(funFacts[0].icon) + '</span>';
    html += '<span class="zg-ticker-text">' + escapeHtml(funFacts[0].text || '') + '</span>';
    html += '</div>';
    html += '<div class="zg-ticker-nav">';
    html += '<button class="zg-ticker-btn" id="zg-ticker-prev">&lt;&lt;</button>';
    html += '<button class="zg-ticker-btn" id="zg-ticker-next">&gt;&gt;</button>';
    html += '</div>';
    html += '</div>';
  }

  // Empty state
  if (performers.length === 0 && records.length === 0 && funFacts.length === 0 && (h.total_score_gained || 0) === 0) {
    html += '<div class="zg-empty">Noch nicht genug Daten fuer diesen Zeitraum.</div>';
  }

  html += '</div>'; // zg-body

  content.innerHTML = html;

  // Wire up fun-facts ticker navigation
  if (funFacts.length > 1) {
    var prevBtn = document.getElementById('zg-ticker-prev');
    var nextBtn = document.getElementById('zg-ticker-next');

    if (prevBtn) {
      prevBtn.addEventListener('click', function() {
        stopZgTicker();
        _zgFactIndex = (_zgFactIndex - 1 + _zgFunFacts.length) % _zgFunFacts.length;
        showZgFact(_zgFactIndex);
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener('click', function() {
        stopZgTicker();
        _zgFactIndex = (_zgFactIndex + 1) % _zgFunFacts.length;
        showZgFact(_zgFactIndex);
      });
    }

    // Start auto-rotation
    _zgTickerTimer = setInterval(function() {
      _zgFactIndex = (_zgFactIndex + 1) % _zgFunFacts.length;
      showZgFact(_zgFactIndex);
    }, 7000);
  }
}

/**
 * Shows a specific fun fact in the ticker.
 * @param {number} idx - Fact index.
 */
function showZgFact(idx) {
  var body = document.getElementById('zg-ticker-body');
  var counter = document.getElementById('zg-ticker-counter');
  if (!body || idx < 0 || idx >= _zgFunFacts.length) return;

  var fact = _zgFunFacts[idx];
  body.innerHTML = '<span class="zg-ticker-icon">' + zgIcon(fact.icon) + '</span>' +
    '<span class="zg-ticker-text">' + escapeHtml(fact.text || '') + '</span>';

  if (counter) counter.textContent = (idx + 1) + '/' + _zgFunFacts.length;
}

/**
 * Stops the fun-facts auto-rotation timer.
 */
function stopZgTicker() {
  if (_zgTickerTimer) {
    clearInterval(_zgTickerTimer);
    _zgTickerTimer = null;
  }
}
