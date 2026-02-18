// ============================================================
// Feature: Activity Feed (Live Event Stream)
// Renders a chronological feed of team events: milestones,
// achievements, rank changes, and big score jumps.
// Fetches data from /api/activity-feed
// Container: #activity-feed
// Called via initActivityFeed(). Depends on: utils.js
// ============================================================

// Inject component-specific styles into <head>
(function() {
  var style = document.createElement('style');
  style.textContent = [
    '.af-container { max-height: 500px; overflow-y: auto; border: 1px inset #c0c0c0; background: #ffffff; }',
    '.af-event { display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px; border-bottom: 1px solid #e8e8e8; font-family: var(--font-mono, "Courier New", monospace); transition: background 0.15s; }',
    '.af-event:hover { background: #f5f5ff; }',
    '.af-event:last-child { border-bottom: none; }',
    '.af-icon { flex-shrink: 0; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; font-size: 1.1rem; background: #d4d4d4; border: 2px outset #e0e0e0; }',
    '.af-icon-milestone { background: #ffe0b2; border-color: #ffcc80; }',
    '.af-icon-achievement { background: #c8e6c9; border-color: #a5d6a7; }',
    '.af-icon-rank { background: #bbdefb; border-color: #90caf9; }',
    '.af-icon-score { background: #f8bbd0; border-color: #f48fb1; }',
    '.af-body { flex: 1; min-width: 0; }',
    '.af-title { font-size: 0.8rem; font-weight: 700; color: var(--text-primary, #1a1a1a); line-height: 1.3; }',
    '.af-donor { color: var(--accent-blue, #0000cc); }',
    '.af-detail { font-size: 0.7rem; color: var(--text-secondary, #444); margin-top: 2px; }',
    '.af-time { flex-shrink: 0; font-size: 0.65rem; color: var(--text-muted, #666); white-space: nowrap; padding-top: 2px; }',
    '.af-filter-bar { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; padding: 8px 10px; background: var(--bg-surface, #f8f8f2); border: 1px solid var(--border-subtle, #c0c0c0); }',
    '.af-filter-btn { padding: 3px 10px; font-family: var(--font-mono, "Courier New", monospace); font-size: 0.7rem; font-weight: 700; background: #d4d4d4; border: 2px outset #e0e0e0; cursor: pointer; text-transform: uppercase; }',
    '.af-filter-btn:hover { background: #c0c0c0; }',
    '.af-filter-btn:active { border-style: inset; }',
    '.af-filter-btn.active { background: #a0a0e0; border-style: inset; color: #000080; }',
    '.af-loading, .af-empty { text-align: center; padding: 24px; font-family: var(--font-mono, "Courier New", monospace); font-size: 0.8rem; color: var(--text-muted, #666); }',
    '.af-count { font-family: var(--font-mono, "Courier New", monospace); font-size: 0.7rem; color: var(--text-muted, #666); text-align: right; padding: 4px 8px; }',
    '@media (max-width: 768px) {',
    '  .af-container { max-height: 400px; }',
    '  .af-event { padding: 8px 10px; gap: 8px; }',
    '  .af-icon { width: 28px; height: 28px; font-size: 0.9rem; }',
    '  .af-filter-bar { flex-direction: column; }',
    '  .af-filter-btn { width: 100%; text-align: center; }',
    '}',
    '@media (max-width: 480px) {',
    '  .af-time { display: none; }',
    '  .af-title { font-size: 0.75rem; }',
    '}'
  ].join('\n');
  document.head.appendChild(style);
})();

/** Cached activity feed data for filtering. */
var _activityFeedData = [];

/**
 * Initializes the Activity Feed by fetching events and rendering them.
 */
function initActivityFeed() {
  var container = document.getElementById('activity-feed');
  if (!container) return;

  container.innerHTML = '<div class="af-loading">Lade Aktivitaets-Feed...</div>';

  fetch('/api/activity-feed?limit=100')
    .then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function(data) {
      _activityFeedData = data.events || [];
      renderActivityFeed(container, _activityFeedData, null);
    })
    .catch(function(err) {
      console.error('[ACTIVITY-FEED] Load failed:', err.message);
      container.innerHTML = '<div class="af-empty">Fehler beim Laden des Aktivitaets-Feeds.</div>';
    });
}

/**
 * Returns icon data for a given event type.
 * @param {string} type - Event type string.
 * @returns {{ icon: string, cssClass: string, label: string }}
 */
function getEventIcon(type) {
  var icons = {
    milestone: { icon: '&#x1F3C6;', cssClass: 'af-icon-milestone', label: 'Meilenstein' },
    achievement: { icon: '&#x2B50;', cssClass: 'af-icon-achievement', label: 'Achievement' },
    rank_change: { icon: '&#x1F4C8;', cssClass: 'af-icon-rank', label: 'Rang' },
    score_jump: { icon: '&#x1F680;', cssClass: 'af-icon-score', label: 'Score-Sprung' },
    new_member: { icon: '&#x1F44B;', cssClass: 'af-icon-achievement', label: 'Neues Mitglied' }
  };
  return icons[type] || { icon: '&#x2022;', cssClass: '', label: 'Ereignis' };
}

/**
 * Formats a timestamp string into a relative time description in German.
 * @param {string} ts - ISO timestamp string.
 * @returns {string} Relative time description.
 */
function formatRelativeTime(ts) {
  if (!ts) return '---';
  var date = new Date(ts.indexOf('T') === -1 ? ts + 'T00:00:00' : ts);
  var now = new Date();
  var diffMs = now - date;
  var diffH = Math.floor(diffMs / (1000 * 60 * 60));
  var diffD = Math.floor(diffH / 24);

  if (diffD > 30) return date.toLocaleDateString('de-DE');
  if (diffD > 1) return 'vor ' + diffD + ' Tagen';
  if (diffD === 1) return 'gestern';
  if (diffH > 1) return 'vor ' + diffH + ' Std.';
  if (diffH === 1) return 'vor 1 Std.';
  return 'gerade eben';
}

/**
 * Builds a human-readable description for an event.
 * @param {object} event - The event object from the API.
 * @returns {object} Object with title and detail strings (HTML).
 */
function buildEventDescription(event) {
  var d = event.details || {};
  var donor = event.donor_name || '';
  var donorHtml = donor === '_team_' ? '<span class="af-donor">Team</span>' : '<span class="af-donor">' + escapeHtml(donor) + '</span>';

  switch (event.type) {
    case 'milestone':
      return {
        title: donorHtml + ' hat einen Meilenstein erreicht!',
        detail: escapeHtml(formatScore(Number(d.milestone || 0))) + ' Score ueberschritten'
      };
    case 'achievement':
      return {
        title: donorHtml + ' hat "' + escapeHtml(d.achievement_name || '?') + '" freigeschaltet',
        detail: 'Tier: ' + escapeHtml(d.achievement_tier || '?') + ' | ' + escapeHtml(String(d.achievement_points || 0)) + ' Punkte'
      };
    case 'rank_change':
      var arrow = d.direction === 'up' ? '&#x2B06;' : '&#x2B07;';
      return {
        title: donorHtml + ' Rang ' + arrow + ' ' + escapeHtml(String(d.positions || 0)) + ' Plaetze',
        detail: 'Rang ' + escapeHtml(String(d.old_rank || '?')) + ' &#x2192; ' + escapeHtml(String(d.new_rank || '?'))
      };
    case 'score_jump':
      return {
        title: donorHtml + ' mit grossem Score-Sprung!',
        detail: '+' + escapeHtml(formatScore(d.score_gain || 0)) + ' an einem Tag'
      };
    case 'new_member':
      return {
        title: donorHtml + ' ist dem Team beigetreten!',
        detail: 'Willkommen im Team!'
      };
    default:
      return { title: donorHtml + ' - Ereignis', detail: '' };
  }
}

/**
 * Renders the activity feed with optional type filter.
 * @param {HTMLElement} container - The #activity-feed element.
 * @param {Array} events - Array of event objects.
 * @param {string|null} filterType - Event type to filter by, or null for all.
 */
function renderActivityFeed(container, events, filterType) {
  var filtered = filterType ? events.filter(function(e) { return e.type === filterType; }) : events;

  var html = '';

  // Filter bar
  html += '<div class="af-filter-bar">';
  html += '<button class="af-filter-btn' + (!filterType ? ' active' : '') + '" data-af-filter="">ALLE</button>';
  html += '<button class="af-filter-btn' + (filterType === 'milestone' ? ' active' : '') + '" data-af-filter="milestone">MEILENSTEINE</button>';
  html += '<button class="af-filter-btn' + (filterType === 'achievement' ? ' active' : '') + '" data-af-filter="achievement">ACHIEVEMENTS</button>';
  html += '<button class="af-filter-btn' + (filterType === 'rank_change' ? ' active' : '') + '" data-af-filter="rank_change">RANG</button>';
  html += '<button class="af-filter-btn' + (filterType === 'score_jump' ? ' active' : '') + '" data-af-filter="score_jump">SCORE-SPRUENGE</button>';
  html += '</div>';

  if (filtered.length === 0) {
    html += '<div class="af-empty">Keine Ereignisse in dieser Kategorie.</div>';
  } else {
    html += '<div class="af-count">' + escapeHtml(String(filtered.length)) + ' Ereignisse</div>';
    html += '<div class="af-container">';

    for (var i = 0; i < filtered.length; i++) {
      var ev = filtered[i];
      var iconData = getEventIcon(ev.type);
      var desc = buildEventDescription(ev);
      var timeStr = formatRelativeTime(ev.timestamp);

      html += '<div class="af-event">';
      html += '<div class="af-icon ' + iconData.cssClass + '">' + iconData.icon + '</div>';
      html += '<div class="af-body">';
      html += '<div class="af-title">' + desc.title + '</div>';
      if (desc.detail) {
        html += '<div class="af-detail">' + desc.detail + '</div>';
      }
      html += '</div>';
      html += '<div class="af-time">' + escapeHtml(timeStr) + '</div>';
      html += '</div>';
    }

    html += '</div>';
  }

  container.innerHTML = html;

  // Attach filter handlers
  var buttons = container.querySelectorAll('.af-filter-btn');
  for (var j = 0; j < buttons.length; j++) {
    buttons[j].addEventListener('click', function() {
      var type = this.getAttribute('data-af-filter') || null;
      renderActivityFeed(container, _activityFeedData, type);
    });
  }
}
