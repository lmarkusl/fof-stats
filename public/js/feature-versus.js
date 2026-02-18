// ============================================================
// Feature: VERSUS.EXE - 1v1 Wochenduell-System
// Displays current week's 1v1 duels with VS graphics, progress
// bars, winner highlights, and a duel-rankings table.
// Fetches from /api/versus/current + /api/versus/rankings
// Container: #versus-arena (in Tab Rangliste)
// Depends on: utils.js (escapeHtml, formatScore, formatNumber)
// ============================================================

// Inject component-specific styles into <head>
(function() {
  var style = document.createElement('style');
  style.textContent = [
    '.versus-week-header { font-family: var(--font-mono, "Courier New", monospace); font-size: 0.75rem; font-weight: 700; color: var(--text-muted, #666); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 12px; text-align: center; }',
    '.versus-duels { display: flex; flex-direction: column; gap: 12px; margin-bottom: 20px; }',
    '.versus-card { padding: 14px 16px; position: relative; overflow: hidden; }',
    '.versus-card-winner { border-left: 4px solid var(--accent-green, #008800); }',
    '.versus-card-active { border-left: 4px solid var(--accent-blue, #0000cc); }',
    '.versus-matchup { display: grid; grid-template-columns: 1fr auto 1fr; gap: 12px; align-items: center; margin-bottom: 10px; }',
    '.versus-player { text-align: center; font-family: var(--font-mono, "Courier New", monospace); }',
    '.versus-player-name { font-size: 0.85rem; font-weight: 700; color: var(--text-primary, #1a1a1a); }',
    '.versus-player-name.winner { color: var(--accent-green, #008800); }',
    '.versus-player-score { font-size: 1.1rem; font-weight: 700; color: var(--accent-blue, #0000cc); margin-top: 4px; }',
    '.versus-vs { font-family: var(--font-mono, "Courier New", monospace); font-size: 1.4rem; font-weight: 700; color: var(--text-muted, #666); text-align: center; }',
    '.versus-bar-container { display: flex; height: 18px; background: #e8e8e8; border: 1px inset #c0c0c0; overflow: hidden; }',
    '.versus-bar-left { height: 100%; background: var(--accent-blue, #0000cc); transition: width 0.6s ease; }',
    '.versus-bar-right { height: 100%; background: var(--accent-amber, #cc6600); transition: width 0.6s ease; }',
    '.versus-status { font-family: var(--font-mono, "Courier New", monospace); font-size: 0.7rem; text-align: center; margin-top: 6px; color: var(--text-muted, #666); text-transform: uppercase; letter-spacing: 0.06em; }',
    '.versus-status-finished { color: var(--accent-green, #008800); font-weight: 700; }',
    '.versus-section-title { font-family: var(--font-mono, "Courier New", monospace); font-size: 0.7rem; font-weight: 700; color: var(--text-muted, #666); text-transform: uppercase; letter-spacing: 0.06em; padding: 8px 12px; background: #d4d4d4; border: 1px solid var(--border-strong, #808080); margin-bottom: 0; }',
    '.versus-rankings-wrap { overflow-x: auto; }',
    '.versus-rankings { width: 100%; border-collapse: collapse; font-family: var(--font-mono, "Courier New", monospace); font-size: 0.8rem; }',
    '.versus-rankings thead tr { background: #d4d4d4; border: 1px solid var(--border-strong, #808080); }',
    '.versus-rankings th { padding: 8px 12px; text-align: left; font-size: 0.7rem; font-weight: 700; color: var(--text-muted, #666); text-transform: uppercase; letter-spacing: 0.06em; }',
    '.versus-rankings-row { border: 1px solid #d0d0d0; border-top: none; background: #ffffff; }',
    '.versus-rankings-row:nth-child(even) { background: #f5f5ef; }',
    '.versus-rankings-row:hover { background: #e8e8ff; }',
    '.versus-rankings-row td { padding: 8px 12px; }',
    '.versus-rank-col { font-weight: 700; color: var(--text-primary, #1a1a1a); min-width: 40px; }',
    '.versus-name-col a { color: var(--accent-blue, #0000cc); text-decoration: none; font-weight: 700; }',
    '.versus-name-col a:hover { text-decoration: underline; }',
    '.versus-wins-col { color: var(--accent-green, #008800); font-weight: 700; }',
    '.versus-losses-col { color: var(--accent-red, #cc0000); }',
    '.versus-winrate-col { font-weight: 700; color: var(--accent-blue, #0000cc); }',
    '.versus-duel-rank-col { font-style: italic; color: var(--text-secondary, #444); }',
    '.versus-loading, .versus-empty { text-align: center; padding: 24px; font-family: var(--font-mono, "Courier New", monospace); font-size: 0.8rem; color: var(--text-muted, #666); }',
    '@media (max-width: 768px) {',
    '  .versus-matchup { gap: 8px; }',
    '  .versus-player-name { font-size: 0.75rem; }',
    '  .versus-player-score { font-size: 0.9rem; }',
    '  .versus-vs { font-size: 1.1rem; }',
    '  .versus-rankings { font-size: 0.75rem; }',
    '  .versus-rankings-row td, .versus-rankings th { padding: 6px 8px; }',
    '}',
    '@media (max-width: 480px) {',
    '  .versus-matchup { grid-template-columns: 1fr; gap: 4px; }',
    '  .versus-vs { font-size: 0.9rem; }',
    '  .versus-card { padding: 10px 12px; }',
    '}'
  ].join('\n');
  document.head.appendChild(style);
})();

/**
 * Initializes the Versus arena by fetching current duels and rankings.
 */
function initVersus() {
  var container = document.getElementById('versus-arena');
  if (!container) return;

  container.innerHTML = '<div class="versus-loading">Lade Duell-Daten...</div>';

  Promise.all([
    fetch('/api/versus/current').then(function(r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }),
    fetch('/api/versus/rankings').then(function(r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
  ]).then(function(results) {
    renderVersus(container, results[0], results[1]);
  }).catch(function(err) {
    console.error('[VERSUS] Load failed:', err.message);
    container.innerHTML = '<div class="versus-empty">Fehler beim Laden der Duell-Daten: ' + escapeHtml(err.message) + '</div>';
  });
}

/**
 * Renders the versus arena: duel cards and rankings table.
 * @param {HTMLElement} container - The #versus-arena element.
 * @param {object} current - { week, duels: [{ member1, member2, score1, score2, status }] }
 * @param {Array} rankings - [{ name, wins, losses, win_rate, duel_rank }]
 */
function renderVersus(container, current, rankings) {
  var duels = current.duels || [];
  var rankEntries = Array.isArray(rankings) ? rankings : (rankings.rankings || []);
  var html = '';

  // Week header
  html += '<div class="versus-week-header">&#x2694;&#xFE0F; Duelle - ' + escapeHtml(current.week || 'Aktuelle Woche') + '</div>';

  // Duel cards
  if (duels.length > 0) {
    html += '<div class="versus-duels">';
    for (var i = 0; i < duels.length; i++) {
      var d = duels[i];
      var s1 = d.score1 || 0;
      var s2 = d.score2 || 0;
      var total = s1 + s2;
      var pctLeft = total > 0 ? Math.round((s1 / total) * 100) : 50;
      var pctRight = 100 - pctLeft;
      var isFinished = d.status === 'finished' || d.status === 'abgeschlossen';
      var p1Wins = s1 > s2;
      var p2Wins = s2 > s1;
      var cardClass = isFinished ? 'versus-card-winner' : 'versus-card-active';

      html += '<div class="card versus-card ' + cardClass + '">';

      // Matchup
      html += '<div class="versus-matchup">';

      // Player 1
      html += '<div class="versus-player">';
      html += '<div class="versus-player-name' + (p1Wins ? ' winner' : '') + '">';
      if (p1Wins && isFinished) html += '&#x1F451; ';
      html += escapeHtml(d.member1 || '---');
      html += '</div>';
      html += '<div class="versus-player-score">' + escapeHtml(formatScore(s1)) + '</div>';
      html += '</div>';

      // VS
      html += '<div class="versus-vs">VS</div>';

      // Player 2
      html += '<div class="versus-player">';
      html += '<div class="versus-player-name' + (p2Wins ? ' winner' : '') + '">';
      if (p2Wins && isFinished) html += '&#x1F451; ';
      html += escapeHtml(d.member2 || '---');
      html += '</div>';
      html += '<div class="versus-player-score">' + escapeHtml(formatScore(s2)) + '</div>';
      html += '</div>';

      html += '</div>'; // versus-matchup

      // Progress bar
      html += '<div class="versus-bar-container">';
      html += '<div class="versus-bar-left" style="width:' + pctLeft + '%"></div>';
      html += '<div class="versus-bar-right" style="width:' + pctRight + '%"></div>';
      html += '</div>';

      // Status
      var statusText = isFinished ? 'Abgeschlossen' : (d.status || 'Aktiv');
      html += '<div class="versus-status' + (isFinished ? ' versus-status-finished' : '') + '">' + escapeHtml(statusText) + '</div>';

      html += '</div>'; // versus-card
    }
    html += '</div>'; // versus-duels
  } else {
    html += '<div class="versus-empty">Keine aktiven Duelle diese Woche.</div>';
  }

  // Rankings table
  if (rankEntries.length > 0) {
    html += '<div class="versus-section-title">Duell-Rangliste (Gesamt)</div>';
    html += '<div class="versus-rankings-wrap">';
    html += '<table class="versus-rankings">';
    html += '<thead><tr>';
    html += '<th>Rang</th>';
    html += '<th>Name</th>';
    html += '<th>Siege</th>';
    html += '<th>Niederlagen</th>';
    html += '<th>Siegesquote</th>';
    html += '<th>Duell-Rang</th>';
    html += '</tr></thead>';
    html += '<tbody>';

    for (var i = 0; i < rankEntries.length; i++) {
      var r = rankEntries[i];
      var rank = i + 1;
      var medal = '';
      if (rank === 1) medal = '&#x1F947; ';
      else if (rank === 2) medal = '&#x1F948; ';
      else if (rank === 3) medal = '&#x1F949; ';

      var winRate = r.win_rate !== undefined ? r.win_rate : (r.wins + r.losses > 0 ? Math.round((r.wins / (r.wins + r.losses)) * 100) : 0);
      var encodedName = encodeURIComponent(r.name || '');

      html += '<tr class="versus-rankings-row">';
      html += '<td class="versus-rank-col">' + medal + rank + '</td>';
      html += '<td class="versus-name-col"><a href="/donor/' + encodedName + '">' + escapeHtml(r.name || '---') + '</a></td>';
      html += '<td class="versus-wins-col">' + escapeHtml(String(r.wins || 0)) + '</td>';
      html += '<td class="versus-losses-col">' + escapeHtml(String(r.losses || 0)) + '</td>';
      html += '<td class="versus-winrate-col">' + escapeHtml(String(winRate)) + '%</td>';
      html += '<td class="versus-duel-rank-col">' + escapeHtml(r.duel_rank || '---') + '</td>';
      html += '</tr>';
    }

    html += '</tbody></table>';
    html += '</div>';
  }

  container.innerHTML = html;
}
