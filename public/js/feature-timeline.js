// ============================================================
// Feature: TIMELINE.EXE - Activity Feed
// DOS-Terminal-Log-Style chronological feed of team events:
// milestones, achievements, rank changes, and score jumps.
// Fetches data from /api/activity-feed
// Container: #timeline-feed
// Called via initTimeline(). Depends on: utils.js
// ============================================================

// Inject component-specific styles into <head>
(function() {
  var style = document.createElement('style');
  style.textContent = [
    '.tl-terminal { background: #0c0c0c; border: 2px inset #404040; font-family: "Courier New", monospace; color: #00ff00; }',
    '.tl-titlebar { display: flex; align-items: center; justify-content: space-between; padding: 4px 10px; background: #000080; color: #ffffff; font-size: 0.75rem; font-weight: 700; letter-spacing: 0.05em; }',
    '.tl-titlebar-btns { display: flex; gap: 4px; }',
    '.tl-titlebar-btn { width: 14px; height: 14px; background: #c0c0c0; border: 1px outset #e0e0e0; font-size: 0.6rem; text-align: center; line-height: 12px; cursor: default; }',
    '.tl-filter-bar { display: flex; gap: 4px; flex-wrap: wrap; padding: 6px 10px; background: #1a1a1a; border-bottom: 1px solid #333; }',
    '.tl-filter-btn { padding: 2px 8px; font-family: "Courier New", monospace; font-size: 0.65rem; font-weight: 700; background: #1a1a1a; color: #808080; border: 1px solid #333; cursor: pointer; text-transform: uppercase; }',
    '.tl-filter-btn:hover { color: #00ff00; border-color: #00ff00; }',
    '.tl-filter-btn.active { color: #00ff00; border-color: #00ff00; background: #0a2a0a; }',
    '.tl-log { max-height: 420px; overflow-y: auto; padding: 8px 10px; }',
    '.tl-log::-webkit-scrollbar { width: 12px; }',
    '.tl-log::-webkit-scrollbar-track { background: #1a1a1a; }',
    '.tl-log::-webkit-scrollbar-thumb { background: #404040; border: 1px solid #555; }',
    '.tl-entry { display: flex; gap: 8px; padding: 3px 0; font-size: 0.75rem; line-height: 1.4; border-bottom: 1px solid #1a1a1a; }',
    '.tl-entry:hover { background: #0a1a0a; }',
    '.tl-ts { color: #666666; white-space: nowrap; flex-shrink: 0; }',
    '.tl-icon { flex-shrink: 0; width: 20px; text-align: center; }',
    '.tl-icon-milestone { color: #ffff00; }',
    '.tl-icon-achievement { color: #00ff88; }',
    '.tl-icon-rank_change { color: #00ccff; }',
    '.tl-icon-score_jump { color: #ff4444; }',
    '.tl-msg { flex: 1; color: #00ff00; word-break: break-word; }',
    '.tl-msg-name { color: #ffffff; font-weight: 700; }',
    '.tl-msg-value { color: #ffff00; }',
    '.tl-status-bar { display: flex; align-items: center; justify-content: space-between; padding: 3px 10px; background: #c0c0c0; color: #000000; font-size: 0.65rem; font-weight: 700; }',
    '.tl-prompt { padding: 4px 10px; font-size: 0.75rem; color: #00ff00; }',
    '.tl-prompt-cursor { display: inline-block; width: 8px; height: 12px; background: #00ff00; animation: tl-blink 1s step-end infinite; vertical-align: middle; margin-left: 2px; }',
    '@keyframes tl-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }',
    '.tl-loading, .tl-empty { text-align: center; padding: 24px; font-family: "Courier New", monospace; font-size: 0.8rem; color: #808080; }',
    '@media (max-width: 768px) {',
    '  .tl-log { max-height: 320px; }',
    '  .tl-entry { font-size: 0.7rem; gap: 6px; }',
    '  .tl-filter-bar { padding: 4px 8px; }',
    '}',
    '@media (max-width: 480px) {',
    '  .tl-ts { display: none; }',
    '  .tl-entry { font-size: 0.65rem; }',
    '}'
  ].join('\n');
  document.head.appendChild(style);
})();

/** Cached activity feed events for filtering. */
var _timelineEvents = [];

/** Current filter type (null = all). */
var _timelineFilter = null;

/**
 * Initializes the Timeline feed by fetching from /api/activity-feed.
 */
function initTimeline() {
  var container = document.getElementById('timeline-feed');
  if (!container) return;

  container.innerHTML = '<div class="tl-loading">C:\\FOF\\TIMELINE.EXE wird geladen...</div>';

  fetch('/api/activity-feed?limit=100')
    .then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function(data) {
      _timelineEvents = data.events || [];
      renderTimeline(container, _timelineEvents, null);
    })
    .catch(function(err) {
      console.error('[TIMELINE] Load failed:', err.message);
      container.innerHTML = '<div class="tl-empty">FEHLER: Timeline konnte nicht geladen werden.</div>';
    });
}

/**
 * Returns icon char and CSS class for activity-feed event types.
 * @param {string} type - Event type from /api/activity-feed.
 * @returns {{ char: string, cssClass: string }}
 */
function getTimelineIcon(type) {
  var icons = {
    milestone:    { char: '*', cssClass: 'tl-icon-milestone' },
    achievement:  { char: '+', cssClass: 'tl-icon-achievement' },
    rank_change:  { char: '#', cssClass: 'tl-icon-rank_change' },
    score_jump:   { char: '!', cssClass: 'tl-icon-score_jump' }
  };
  return icons[type] || { char: '>', cssClass: '' };
}

/**
 * Returns German filter label for activity-feed event types.
 * @param {string} type - Event type.
 * @returns {string} German label.
 */
function getTimelineFilterLabel(type) {
  var labels = {
    milestone:    'MEILENSTEINE',
    achievement:  'ACHIEVEMENTS',
    rank_change:  'RANG',
    score_jump:   'SCORE-SPRUENGE'
  };
  return labels[type] || type.toUpperCase();
}

/**
 * Formats an ISO timestamp as a DOS-style date string.
 * @param {string} ts - ISO timestamp string.
 * @returns {string} DOS-style formatted date.
 */
function formatDOSTimestamp(ts) {
  if (!ts) return '----/--/--';
  var datePart = ts.split('T')[0];
  var parts = datePart.split('-');
  if (parts.length >= 3) {
    return parts[0] + '/' + parts[1] + '/' + parts[2];
  }
  return datePart;
}

/**
 * Builds the terminal-style log message for an activity-feed event.
 * Uses: event.type, event.donor_name, event.details
 * @param {object} ev - Activity-feed event from /api/activity-feed.
 * @returns {string} HTML string for the message.
 */
function buildTimelineMessage(ev) {
  var d = ev.details || {};
  var donor = ev.donor_name || '???';
  var donorHtml = donor === '_team_'
    ? '<span class="tl-msg-name">TEAM</span>'
    : '<span class="tl-msg-name">' + escapeHtml(donor) + '</span>';

  switch (ev.type) {
    case 'milestone':
      var msLabel = d.milestone ? formatScore(Number(d.milestone)) : '?';
      return donorHtml + ' erreichte Meilenstein ' +
        '<span class="tl-msg-value">' + escapeHtml(msLabel) + '</span>' +
        (d.score_at_time ? ' (Score: ' + escapeHtml(formatScore(d.score_at_time)) + ')' : '');

    case 'achievement':
      return donorHtml + ' hat ' +
        '<span class="tl-msg-value">"' + escapeHtml(d.achievement_name || '?') + '"</span>' +
        ' freigeschaltet [' + escapeHtml(d.achievement_tier || '?') + ']' +
        (d.achievement_points ? ' +' + escapeHtml(String(d.achievement_points)) + ' Pkt.' : '');

    case 'rank_change':
      var arrow = d.direction === 'up' ? '&uarr;' : '&darr;';
      return donorHtml + ' Rang ' + arrow + ' ' +
        '<span class="tl-msg-value">#' + escapeHtml(String(d.old_rank || '?')) +
        ' -&gt; #' + escapeHtml(String(d.new_rank || '?')) + '</span>' +
        ' (' + escapeHtml(String(d.positions || 0)) + ' Plaetze)';

    case 'score_jump':
      return donorHtml + ' mit Score-Sprung: ' +
        '<span class="tl-msg-value">+' + escapeHtml(formatScore(d.score_gain || 0)) + '</span>' +
        (d.period ? ' (' + escapeHtml(d.period) + ')' : '');

    default:
      return donorHtml + ' - ' + escapeHtml(ev.type || 'Ereignis');
  }
}

/**
 * Renders the full timeline terminal UI with filter bar.
 * @param {HTMLElement} container - The #timeline-feed element.
 * @param {Array} events - Event array from /api/activity-feed.
 * @param {string|null} filterType - Type filter or null for all.
 */
function renderTimeline(container, events, filterType) {
  var filtered = filterType
    ? events.filter(function(e) { return e.type === filterType; })
    : events;

  // Collect unique event types for filter buttons
  var types = {};
  for (var i = 0; i < events.length; i++) {
    types[events[i].type] = true;
  }
  var typeKeys = Object.keys(types);

  var html = '';
  html += '<div class="tl-terminal">';

  // Title bar (Win95 style)
  html += '<div class="tl-titlebar">';
  html += '<span>C:\\FOF\\TIMELINE.EXE</span>';
  html += '<div class="tl-titlebar-btns">';
  html += '<div class="tl-titlebar-btn">_</div>';
  html += '<div class="tl-titlebar-btn">X</div>';
  html += '</div>';
  html += '</div>';

  // Filter bar
  html += '<div class="tl-filter-bar">';
  html += '<button class="tl-filter-btn' + (!filterType ? ' active' : '') + '" data-tl-filter="">ALLE</button>';
  for (var t = 0; t < typeKeys.length; t++) {
    var isActive = filterType === typeKeys[t];
    html += '<button class="tl-filter-btn' + (isActive ? ' active' : '') + '" data-tl-filter="' + escapeHtml(typeKeys[t]) + '">';
    html += getTimelineFilterLabel(typeKeys[t]);
    html += '</button>';
  }
  html += '</div>';

  // Log entries
  html += '<div class="tl-log" id="tl-log">';

  if (filtered.length === 0) {
    html += '<div class="tl-entry"><span class="tl-msg" style="color:#808080;">Keine Ereignisse in dieser Kategorie.</span></div>';
  } else {
    for (var i = 0; i < filtered.length; i++) {
      var ev = filtered[i];
      var icon = getTimelineIcon(ev.type);

      html += '<div class="tl-entry">';
      html += '<span class="tl-ts">[' + formatDOSTimestamp(ev.timestamp) + ']</span>';
      html += '<span class="tl-icon ' + icon.cssClass + '">' + escapeHtml(icon.char) + '</span>';
      html += '<span class="tl-msg">' + buildTimelineMessage(ev) + '</span>';
      html += '</div>';
    }
  }

  html += '</div>';

  // Prompt line with blinking cursor
  html += '<div class="tl-prompt">C:\\FOF&gt; feed --count=' + escapeHtml(String(filtered.length)) + ' <span class="tl-prompt-cursor"></span></div>';

  // Status bar
  html += '<div class="tl-status-bar">';
  html += '<span>' + escapeHtml(String(filtered.length)) + ' von ' + escapeHtml(String(events.length)) + ' Ereignissen</span>';
  html += '<span>Quelle: /api/activity-feed</span>';
  html += '</div>';

  html += '</div>'; // tl-terminal

  container.innerHTML = html;

  // Attach filter handlers
  var buttons = container.querySelectorAll('.tl-filter-btn');
  for (var b = 0; b < buttons.length; b++) {
    buttons[b].addEventListener('click', function() {
      var type = this.getAttribute('data-tl-filter') || null;
      _timelineFilter = type;
      renderTimeline(container, _timelineEvents, type);
    });
  }
}
