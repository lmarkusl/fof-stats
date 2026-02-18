// ============================================================
// Feature: Team Challenge System
// Renders active team challenges with countdown, progress bars,
// and mini-leaderboards of top 5 participants.
// Fetches data from /api/challenges
// Container: #challenges-section
// ============================================================

// Utilities provided by utils.js (escapeHtml, formatScore, formatNumber)

// Inject component-specific styles into <head>
(function() {
  var style = document.createElement('style');
  style.textContent = [
    '.challenges-list { display: flex; flex-direction: column; gap: 16px; }',
    '.challenge-card { padding: 16px; }',
    '.challenge-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; flex-wrap: wrap; gap: 8px; }',
    '.challenge-title { font-family: var(--font-mono, "Courier New", monospace); font-size: 0.9rem; font-weight: 700; color: var(--text-primary, #1a1a1a); }',
    '.challenge-countdown { font-family: var(--font-mono, "Courier New", monospace); font-size: 0.8rem; font-weight: 700; color: var(--accent-blue, #0000cc); background: #e8e8ff; padding: 2px 10px; border: 1px solid #c0c0e0; }',
    '.challenge-expired { color: var(--text-muted, #666) !important; background: #e8e8e8 !important; border-color: #c0c0c0 !important; }',
    '.challenge-desc { font-family: var(--font-mono, "Courier New", monospace); font-size: 0.8rem; color: var(--text-secondary, #444); margin-bottom: 12px; line-height: 1.4; }',
    '.challenge-progress-section { margin-bottom: 12px; }',
    '.challenge-progress-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }',
    '.challenge-progress-label { font-family: var(--font-mono, "Courier New", monospace); font-size: 0.7rem; font-weight: 700; color: var(--text-muted, #666); text-transform: uppercase; }',
    '.challenge-progress-value { font-family: var(--font-mono, "Courier New", monospace); font-size: 0.75rem; color: var(--text-secondary, #444); }',
    '.challenge-bar { height: 16px; background: #e8e8e8; border: 1px inset #c0c0c0; overflow: hidden; }',
    '.challenge-bar-fill { height: 100%; background: var(--accent-green, #008800); transition: width 0.6s ease; }',
    '.challenge-pct { font-family: var(--font-mono, "Courier New", monospace); font-size: 0.7rem; color: var(--text-muted, #666); text-align: right; margin-top: 2px; }',
    '.challenge-leaderboard { margin-top: 12px; border-top: 1px solid #d0d0d0; padding-top: 8px; }',
    '.challenge-lb-title { font-family: var(--font-mono, "Courier New", monospace); font-size: 0.7rem; font-weight: 700; color: var(--text-muted, #666); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 6px; }',
    '.challenge-lb-table { width: 100%; border-collapse: collapse; font-family: var(--font-mono, "Courier New", monospace); font-size: 0.8rem; }',
    '.challenge-lb-table tr { border-bottom: 1px solid #e8e8e8; }',
    '.challenge-lb-table tr:last-child { border-bottom: none; }',
    '.challenge-lb-table td { padding: 4px 8px; }',
    '.challenge-lb-rank { font-weight: 700; color: var(--text-primary, #1a1a1a); white-space: nowrap; width: 40px; }',
    '.challenge-lb-name { color: var(--text-primary, #1a1a1a); }',
    '.challenge-lb-score { text-align: right; color: var(--accent-blue, #0000cc); font-weight: 700; }',
    '.challenges-loading, .challenges-empty { text-align: center; padding: 24px; font-family: var(--font-mono, "Courier New", monospace); font-size: 0.8rem; color: var(--text-muted, #666); }',
    '@media (max-width: 768px) {',
    '  .challenge-header { flex-direction: column; align-items: flex-start; }',
    '  .challenge-lb-table { font-size: 0.75rem; }',
    '}',
    '@media (max-width: 480px) {',
    '  .challenge-card { padding: 12px; }',
    '}'
  ].join('\n');
  document.head.appendChild(style);
})();

/**
 * Initializes the Challenges section by fetching active challenges
 * and rendering them with countdown timers and progress indicators.
 */
async function initChallenges() {
  var container = document.getElementById('challenges-section');
  if (!container) return;

  container.innerHTML = '<div class="challenges-loading">Lade Challenges...</div>';

  try {
    var res = await fetch('/api/challenges');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    var data = await res.json();
    renderChallenges(container, data);
  } catch (err) {
    console.error('[CHALLENGES] Load failed:', err.message);
    container.innerHTML = '<div class="challenges-empty">Fehler beim Laden der Challenges.</div>';
  }
}

/**
 * Renders active challenges into the given container.
 * @param {HTMLElement} container - The #challenges-section element.
 * @param {Object|Array} data - API response; array of challenges or object with .challenges array.
 */
function renderChallenges(container, data) {
  var challenges = Array.isArray(data) ? data : (data.challenges || []);

  if (!challenges.length) {
    container.innerHTML = '<div class="challenges-empty">Keine aktiven Challenges vorhanden.</div>';
    return;
  }

  var html = '<div class="challenges-list">';

  challenges.forEach(function(ch) {
    var title = escapeHtml(ch.title || 'Challenge');
    var desc = escapeHtml(ch.description || '');
    var endDate = ch.end_date || ch.ends_at || '';
    var countdown = computeCountdown(endDate);
    var progress = ch.progress || 0;
    var goal = ch.goal || 0;
    var pct = goal > 0 ? Math.min(Math.round((progress / goal) * 100), 100) : 0;
    var participants = ch.participants || ch.leaderboard || [];
    var top5 = participants.slice(0, 5);
    var isExpired = countdown === 'Abgelaufen';

    html += '<div class="challenge-card card">';
    html += '<div class="challenge-header">';
    html += '<div class="challenge-title">&#x1F3AF; ' + title + '</div>';
    html += '<div class="challenge-countdown' + (isExpired ? ' challenge-expired' : '') + '">' + escapeHtml(countdown) + '</div>';
    html += '</div>';

    if (desc) {
      html += '<div class="challenge-desc">' + desc + '</div>';
    }

    // Progress bar
    if (goal > 0) {
      html += '<div class="challenge-progress-section">';
      html += '<div class="challenge-progress-header">';
      html += '<span class="challenge-progress-label">Fortschritt</span>';
      html += '<span class="challenge-progress-value">' + escapeHtml(formatScore(progress)) + ' / ' + escapeHtml(formatScore(goal)) + '</span>';
      html += '</div>';
      html += '<div class="challenge-bar">';
      html += '<div class="challenge-bar-fill" style="width:' + pct + '%"></div>';
      html += '</div>';
      html += '<div class="challenge-pct">' + pct + '%</div>';
      html += '</div>';
    }

    // Mini leaderboard
    if (top5.length > 0) {
      html += '<div class="challenge-leaderboard">';
      html += '<div class="challenge-lb-title">TOP 5 TEILNEHMER</div>';
      html += '<table class="challenge-lb-table">';
      top5.forEach(function(p, j) {
        var rank = j + 1;
        var medal = '';
        if (rank === 1) medal = '&#x1F947; ';
        else if (rank === 2) medal = '&#x1F948; ';
        else if (rank === 3) medal = '&#x1F949; ';

        var pName = escapeHtml(p.name || '---');
        var pScore = p.score || p.contribution || 0;

        html += '<tr>';
        html += '<td class="challenge-lb-rank">' + medal + rank + '</td>';
        html += '<td class="challenge-lb-name">' + pName + '</td>';
        html += '<td class="challenge-lb-score">' + escapeHtml(formatScore(pScore)) + '</td>';
        html += '</tr>';
      });
      html += '</table>';
      html += '</div>';
    }

    html += '</div>';
  });

  html += '</div>';

  container.innerHTML = html;

  // Start countdown timers that update every minute
  startCountdownTimers(container, challenges);
}

/**
 * Computes a human-readable countdown string from now until the given end date.
 * @param {string} endDateStr - ISO date string or similar parseable date.
 * @returns {string} Countdown like "3T 12H" or "Abgelaufen".
 */
function computeCountdown(endDateStr) {
  if (!endDateStr) return '---';

  var end = new Date(endDateStr);
  var now = new Date();
  var diff = end - now;

  if (diff <= 0) return 'Abgelaufen';

  var days = Math.floor(diff / (1000 * 60 * 60 * 24));
  var hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  var minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) return days + 'T ' + hours + 'H';
  if (hours > 0) return hours + 'H ' + minutes + 'M';
  return minutes + 'M';
}

/**
 * Starts a periodic timer that updates countdown displays every 60 seconds.
 * @param {HTMLElement} container - The challenges container element.
 * @param {Array} challenges - The challenges data array.
 */
function startCountdownTimers(container, challenges) {
  // Update countdowns every 60 seconds
  var timerId = setInterval(function() {
    // Stop if container was removed from DOM
    if (!document.body.contains(container)) {
      clearInterval(timerId);
      return;
    }

    var countdownEls = container.querySelectorAll('.challenge-countdown');
    countdownEls.forEach(function(el, i) {
      if (challenges[i]) {
        var endDate = challenges[i].end_date || challenges[i].ends_at || '';
        var newCountdown = computeCountdown(endDate);
        el.textContent = newCountdown;
        if (newCountdown === 'Abgelaufen') {
          el.classList.add('challenge-expired');
        }
      }
    });
  }, 60000);
}
