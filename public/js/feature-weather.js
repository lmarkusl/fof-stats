// ============================================================
// Feature: WEATHER.EXE - Team-Aktivitaets-Wetterbericht
// Compact card with ASCII weather art, temperature, wind, humidity,
// pressure, description, 3-day forecast, and weather alerts.
// Fetches data from /api/weather
// Container: #weather-station
// Called via initWeather(). Depends on: utils.js
// ============================================================

// Inject component-specific styles into <head>
(function() {
  var style = document.createElement('style');
  style.textContent = [
    '.wx-card { font-family: "Courier New", monospace; background: #0c0c0c; border: 2px inset #404040; color: #f0f0e8; }',
    '.wx-titlebar { display: flex; align-items: center; justify-content: space-between; padding: 4px 10px; background: #000080; color: #ffffff; font-size: 0.75rem; font-weight: 700; letter-spacing: 0.05em; }',
    '.wx-titlebar-btns { display: flex; gap: 4px; }',
    '.wx-titlebar-btn { width: 14px; height: 14px; background: #c0c0c0; border: 1px outset #e0e0e0; font-size: 0.6rem; text-align: center; line-height: 12px; cursor: default; }',
    '.wx-body { padding: 12px; }',
    '.wx-main { display: flex; align-items: flex-start; gap: 16px; margin-bottom: 12px; }',
    '.wx-ascii { flex-shrink: 0; font-size: 0.7rem; line-height: 1.2; white-space: pre; color: #ffff00; text-align: center; }',
    '.wx-info { flex: 1; }',
    '.wx-condition { font-size: 1rem; font-weight: 700; color: #ffffff; margin-bottom: 4px; text-transform: uppercase; }',
    '.wx-temp { font-size: 2rem; font-weight: 700; margin-bottom: 4px; }',
    '.wx-temp-hot { color: #ff4444; }',
    '.wx-temp-warm { color: #ffaa00; }',
    '.wx-temp-mild { color: #00cc44; }',
    '.wx-temp-cool { color: #4488ff; }',
    '.wx-temp-cold { color: #88bbff; }',
    '.wx-desc { font-size: 0.75rem; color: #aaaaaa; line-height: 1.4; margin-bottom: 8px; }',
    '.wx-stats { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; margin-bottom: 12px; }',
    '.wx-stat { padding: 6px 8px; background: #1a1a1a; border: 1px solid #333; }',
    '.wx-stat-label { font-size: 0.6rem; color: #666; text-transform: uppercase; letter-spacing: 0.05em; }',
    '.wx-stat-value { font-size: 0.85rem; font-weight: 700; color: #00ff00; }',
    '.wx-divider { border: none; border-top: 1px solid #333; margin: 10px 0; }',
    '.wx-forecast-title { font-size: 0.7rem; font-weight: 700; color: #808080; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 6px; }',
    '.wx-forecast { display: flex; gap: 8px; }',
    '.wx-forecast-day { flex: 1; text-align: center; padding: 8px 4px; background: #1a1a1a; border: 1px solid #333; }',
    '.wx-forecast-name { font-size: 0.65rem; color: #808080; font-weight: 700; text-transform: uppercase; margin-bottom: 4px; }',
    '.wx-forecast-icon { font-size: 0.8rem; margin-bottom: 2px; }',
    '.wx-forecast-temp { font-size: 0.8rem; font-weight: 700; }',
    '.wx-alerts { margin-top: 10px; display: flex; flex-direction: column; gap: 4px; }',
    '.wx-alert { padding: 4px 8px; font-size: 0.7rem; font-weight: 700; border-left: 3px solid; }',
    '.wx-alert-hot { background: #2a1a0a; border-color: #ff4444; color: #ff8888; }',
    '.wx-alert-cold { background: #0a1a2a; border-color: #4488ff; color: #88bbff; }',
    '.wx-alert-record { background: #2a2a0a; border-color: #ffff00; color: #ffff88; }',
    '.wx-status-bar { display: flex; align-items: center; justify-content: space-between; padding: 3px 10px; background: #c0c0c0; color: #000000; font-size: 0.6rem; font-weight: 700; }',
    '.wx-loading, .wx-empty { text-align: center; padding: 24px; font-family: "Courier New", monospace; font-size: 0.8rem; color: #808080; }',
    '@media (max-width: 768px) {',
    '  .wx-main { flex-direction: column; align-items: center; text-align: center; }',
    '  .wx-stats { grid-template-columns: 1fr; }',
    '  .wx-forecast { flex-wrap: wrap; }',
    '  .wx-forecast-day { min-width: 60px; }',
    '}',
    '@media (max-width: 480px) {',
    '  .wx-temp { font-size: 1.5rem; }',
    '  .wx-ascii { font-size: 0.6rem; }',
    '}'
  ].join('\n');
  document.head.appendChild(style);
})();

/**
 * Returns ASCII art for a weather condition.
 * @param {string} condition - Weather condition from API.
 * @returns {string} Multi-line ASCII art string.
 */
function getWeatherAscii(condition) {
  var art = {
    thunderstorm: [
      '     .--.    ',
      '  .-(    ).  ',
      ' (___.__)__) ',
      '   /_/_/_/   ',
      '  /_/ /_/    ',
      '   /  /      ',
      '  * *  *     '
    ],
    sunny: [
      '    \\   /    ',
      '     .-.     ',
      '  - (   ) -  ',
      '     `-\'     ',
      '    /   \\    ',
      '             ',
      '  FOLDING!   '
    ],
    partly_cloudy: [
      '   \\  /      ',
      ' _ /"".--.   ',
      '   \\_(   ).  ',
      '   /(___(__) ',
      '             ',
      '             ',
      '             '
    ],
    cloudy: [
      '             ',
      '     .--.    ',
      '  .-(    ).  ',
      ' (___.__)__) ',
      '             ',
      '             ',
      '             '
    ],
    rainy: [
      '     .--.    ',
      '  .-(    ).  ',
      ' (___.__)__) ',
      '  , , , , ,  ',
      ' , , , , ,   ',
      '             ',
      '             '
    ],
    snowy: [
      '     .--.    ',
      '  .-(    ).  ',
      ' (___.__)__) ',
      '  *  *  *    ',
      '   *  *  *   ',
      '  *  *  *    ',
      '             '
    ],
    foggy: [
      '             ',
      ' _ - _ - _ - ',
      '  _ - _ - _  ',
      ' _ - _ - _ - ',
      '  _ - _ - _  ',
      '             ',
      '   ???       '
    ]
  };
  return (art[condition] || art.foggy).join('\n');
}

/**
 * Returns a small ASCII icon for forecast conditions.
 * @param {string} condition - Forecast condition.
 * @returns {string} Small ASCII representation.
 */
function getForecastIcon(condition) {
  var icons = {
    thunderstorm: '/_/',
    sunny: '\\O/',
    partly_cloudy: '~O ',
    cloudy: '(~)',
    rainy: ',,,',
    snowy: '***',
    foggy: '---'
  };
  return icons[condition] || '???';
}

/**
 * Returns the CSS class for temperature coloring.
 * @param {number} temp - Temperature value.
 * @returns {string} CSS class.
 */
function getTempClass(temp) {
  if (temp >= 40) return 'wx-temp-hot';
  if (temp >= 25) return 'wx-temp-warm';
  if (temp >= 10) return 'wx-temp-mild';
  if (temp >= 0) return 'wx-temp-cool';
  return 'wx-temp-cold';
}

/**
 * Returns a German day name from English abbreviation.
 * @param {string} day - English day abbreviation.
 * @returns {string} German day name.
 */
function translateDay(day) {
  var map = {
    'Mon': 'Mo', 'Tue': 'Di', 'Wed': 'Mi', 'Thu': 'Do',
    'Fri': 'Fr', 'Sat': 'Sa', 'Sun': 'So'
  };
  return map[day] || day;
}

/**
 * Initializes the Weather Station feature.
 */
function initWeather() {
  var container = document.getElementById('weather-station');
  if (!container) return;

  container.innerHTML = '<div class="wx-loading">C:\\FOF\\WEATHER.EXE wird geladen...</div>';

  fetch('/api/weather')
    .then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function(data) {
      renderWeather(container, data);
    })
    .catch(function(err) {
      console.error('[WEATHER] Load failed:', err.message);
      container.innerHTML = '<div class="wx-empty">FEHLER: Wetterdaten nicht verfuegbar.</div>';
    });
}

/**
 * Renders the weather station card.
 * @param {HTMLElement} container - The #weather-station element.
 * @param {object} data - API response with condition, temperature, wind, etc.
 */
function renderWeather(container, data) {
  var details = data.details || {};
  var wind = data.wind || {};
  var forecast = data.forecast || [];
  var alerts = data.alerts || [];

  var html = '';
  html += '<div class="wx-card">';

  // Title bar
  html += '<div class="wx-titlebar">';
  html += '<span>C:\\FOF\\WEATHER.EXE - Folding-Wetterbericht</span>';
  html += '<div class="wx-titlebar-btns">';
  html += '<div class="wx-titlebar-btn">_</div>';
  html += '<div class="wx-titlebar-btn">X</div>';
  html += '</div>';
  html += '</div>';

  html += '<div class="wx-body">';

  // Main section: ASCII art + info
  html += '<div class="wx-main">';

  // ASCII weather art
  html += '<pre class="wx-ascii">' + escapeHtml(getWeatherAscii(data.condition)) + '</pre>';

  // Info
  html += '<div class="wx-info">';
  html += '<div class="wx-condition">' + escapeHtml(data.condition_label || data.condition || '???') + '</div>';
  html += '<div class="wx-temp ' + getTempClass(data.temperature || 0) + '">' + escapeHtml(String(data.temperature || 0)) + '&deg;F</div>';
  html += '<div class="wx-desc">' + escapeHtml(data.description || '') + '</div>';
  html += '</div>';

  html += '</div>'; // wx-main

  // Stats grid
  html += '<div class="wx-stats">';

  html += '<div class="wx-stat">';
  html += '<div class="wx-stat-label">Wind</div>';
  html += '<div class="wx-stat-value">' + escapeHtml(String(wind.speed || 0)) + ' | ' + escapeHtml(wind.label || 'Ruhig') + '</div>';
  html += '</div>';

  html += '<div class="wx-stat">';
  html += '<div class="wx-stat-label">Feuchtigkeit (Teilnahme)</div>';
  html += '<div class="wx-stat-value">' + escapeHtml(String(data.humidity || 0)) + '%</div>';
  html += '</div>';

  html += '<div class="wx-stat">';
  html += '<div class="wx-stat-label">PPD (24h / 7d / 30d)</div>';
  html += '<div class="wx-stat-value">' +
    escapeHtml(formatScore(details.ppd_24h || 0)) + ' / ' +
    escapeHtml(formatScore(details.ppd_7d || 0)) + ' / ' +
    escapeHtml(formatScore(details.ppd_30d || 0)) +
    '</div>';
  html += '</div>';

  html += '<div class="wx-stat">';
  html += '<div class="wx-stat-label">Aktive Mitglieder</div>';
  html += '<div class="wx-stat-value">' + escapeHtml(String(details.active_members_today || 0)) + ' / ' + escapeHtml(String(details.total_members || 0)) + '</div>';
  html += '</div>';

  html += '</div>'; // wx-stats

  // Forecast
  if (forecast.length > 0) {
    html += '<hr class="wx-divider">';
    html += '<div class="wx-forecast-title">3-TAGE VORHERSAGE</div>';
    html += '<div class="wx-forecast">';

    for (var f = 0; f < forecast.length; f++) {
      var fc = forecast[f];
      html += '<div class="wx-forecast-day">';
      html += '<div class="wx-forecast-name">' + escapeHtml(translateDay(fc.day)) + '</div>';
      html += '<div class="wx-forecast-icon">' + escapeHtml(getForecastIcon(fc.condition)) + '</div>';
      html += '<div class="wx-forecast-temp ' + getTempClass(fc.temperature || 0) + '">' + escapeHtml(String(fc.temperature || 0)) + '&deg;</div>';
      html += '</div>';
    }

    html += '</div>'; // wx-forecast
  }

  // Alerts
  if (alerts.length > 0) {
    html += '<div class="wx-alerts">';
    for (var a = 0; a < alerts.length; a++) {
      var alert = alerts[a];
      var alertClass = 'wx-alert-cold';
      if (alert.type === 'hot_streak') alertClass = 'wx-alert-hot';
      else if (alert.type === 'new_record') alertClass = 'wx-alert-record';
      html += '<div class="wx-alert ' + alertClass + '">! ' + escapeHtml(alert.message) + '</div>';
    }
    html += '</div>';
  }

  html += '</div>'; // wx-body

  // Status bar
  var now = new Date();
  html += '<div class="wx-status-bar">';
  html += '<span>Aktivitaets-Ratio: ' + escapeHtml(String(details.activity_ratio || 0)) + 'x</span>';
  html += '<span>Stand: ' + escapeHtml(now.toLocaleString('de-DE')) + '</span>';
  html += '</div>';

  html += '</div>'; // wx-card

  container.innerHTML = html;
}
