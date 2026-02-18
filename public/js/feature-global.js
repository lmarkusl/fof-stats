// ============================================================
// Feature: Global Context
// Displays 4 info cards showing the team's position in the
// global Folding@Home landscape: team rank, member count vs
// global total, percentile, and absolute rank.
// Called via initGlobalContext(). Depends on: utils.js
// ============================================================

// Inject component-specific styles into <head>
(function() {
  var style = document.createElement('style');
  style.textContent = [
    '.global-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }',
    '.global-card { text-align: center; padding: 16px 12px; position: relative; }',
    '.global-icon { font-size: 1.4rem; margin-bottom: 6px; display: block; }',
    '.global-value { font-family: var(--font-mono, "Courier New", monospace); font-size: 1.3rem; font-weight: 700; color: var(--accent-blue, #0000cc); line-height: 1.2; }',
    '.global-label { font-family: var(--font-mono, "Courier New", monospace); font-size: 0.65rem; font-weight: 700; color: var(--text-muted, #666); text-transform: uppercase; letter-spacing: 0.08em; margin-top: 6px; }',
    '.global-detail { font-family: var(--font-mono, "Courier New", monospace); font-size: 0.65rem; color: var(--text-muted, #666); margin-top: 2px; }',
    '.global-card:nth-child(1) .global-value { color: var(--accent-amber, #cc6600); }',
    '.global-card:nth-child(2) .global-value { color: var(--accent-green, #008800); }',
    '.global-card:nth-child(3) .global-value { color: var(--accent-purple, #6600aa); }',
    '.global-card:nth-child(4) .global-value { color: var(--accent-teal, #008080); }',
    '@media (max-width: 768px) {',
    '  .global-grid { grid-template-columns: repeat(2, 1fr); gap: 10px; }',
    '  .global-value { font-size: 1.1rem; }',
    '}',
    '@media (max-width: 480px) {',
    '  .global-grid { grid-template-columns: repeat(2, 1fr); gap: 8px; }',
    '  .global-card { padding: 12px 8px; }',
    '  .global-value { font-size: 1rem; }',
    '  .global-icon { font-size: 1.1rem; }',
    '}'
  ].join('\n');
  document.head.appendChild(style);
})();

/**
 * Initializes the global context section by fetching /api/global-stats
 * and rendering 4 info cards into #global-context.
 */
function initGlobalContext() {
  var container = document.getElementById('global-context');
  if (!container) return;

  container.innerHTML = '<div style="text-align:center;padding:16px;font-family:var(--font-mono);font-size:0.8rem;color:var(--text-muted);">Lade globale Statistiken...</div>';

  fetch('/api/global-stats')
    .then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function(data) {
      renderGlobalContext(container, data);
    })
    .catch(function(err) {
      container.innerHTML = '<div class="error-message">' +
        'Fehler beim Laden der globalen Daten: ' + escapeHtml(err.message) +
        '</div>';
    });
}

/**
 * Renders 4 global context info cards.
 * @param {HTMLElement} container - The #global-context element.
 * @param {object} data - API response with global stats fields.
 */
function renderGlobalContext(container, data) {
  var teamRank = data.our_rank || data.team_rank || data.rank || 0;
  var totalTeams = data.total_teams || 0;
  var teamMembers = data.our_members || data.team_members || data.members || 0;
  var totalUsers = data.total_users || data.total_donors || 0;
  var percentile = data.percentile || data.top_percent || 0;

  // Calculate percentile if not provided but we have rank and total
  if (!percentile && teamRank > 0 && totalTeams > 0) {
    percentile = ((teamRank / totalTeams) * 100).toFixed(2);
  }

  // Format total users (often in millions)
  var totalUsersStr;
  if (totalUsers >= 1e6) {
    totalUsersStr = (totalUsers / 1e6).toFixed(1) + ' Mio.';
  } else if (totalUsers >= 1e3) {
    totalUsersStr = formatNumber(totalUsers);
  } else {
    totalUsersStr = String(totalUsers);
  }

  // Format total teams
  var totalTeamsStr = formatNumber(totalTeams);

  var html = '<div class="global-grid">';

  // Card 1: Team rank of total teams
  html += '<div class="card global-card">';
  html += '<span class="global-icon">&#x1F3E2;</span>';
  html += '<div class="global-value">Team ' + escapeHtml(formatNumber(teamRank)) + '</div>';
  html += '<div class="global-label">von ' + escapeHtml(totalTeamsStr) + ' Teams</div>';
  html += '<div class="global-detail">Weltweites Ranking</div>';
  html += '</div>';

  // Card 2: Members vs global users
  html += '<div class="card global-card">';
  html += '<span class="global-icon">&#x1F465;</span>';
  html += '<div class="global-value">' + escapeHtml(formatNumber(teamMembers)) + ' Mitglieder</div>';
  html += '<div class="global-label">von ' + escapeHtml(totalUsersStr) + ' Usern</div>';
  html += '<div class="global-detail">Aktive Folder weltweit</div>';
  html += '</div>';

  // Card 3: Top X%
  html += '<div class="card global-card">';
  html += '<span class="global-icon">&#x1F4C8;</span>';
  html += '<div class="global-value">Top ' + escapeHtml(String(percentile)) + '%</div>';
  html += '<div class="global-label">Aller Teams</div>';
  html += '<div class="global-detail">Perzentil-Ranking</div>';
  html += '</div>';

  // Card 4: Absolute rank
  html += '<div class="card global-card">';
  html += '<span class="global-icon">&#x1F3C6;</span>';
  html += '<div class="global-value">Rang #' + escapeHtml(formatNumber(teamRank)) + '</div>';
  html += '<div class="global-label">Weltweit</div>';
  html += '<div class="global-detail">Absolute Position</div>';
  html += '</div>';

  html += '</div>'; // global-grid

  container.innerHTML = html;
}
