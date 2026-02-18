// ============================================================
// Feature: Score Equivalents + ASCII Achievements + Team Goals
// ============================================================

// Utilities provided by utils.js (escapeHtml, formatScoreShort)

// ---- Score Equivalents ----
function renderScoreEquivalents(team, members) {
  const container = document.getElementById('score-equivalents');
  if (!container || !team) return;

  const score = team.score;
  const wus = team.wus;

  // Fun calculations
  const cpuYears = Math.round(score / (8760 * 1000)); // ~1000 pts per CPU-hour, 8760 hours per year
  const proteins = Math.round(wus * 0.8); // rough estimate
  const genomSequencing = Math.round(wus / 50).toLocaleString('de-DE');
  const energyKwh = Math.round(wus * 0.2).toLocaleString('de-DE');

  const equivalents = [
    { icon: '&#x1F4BB;', label: 'CPU-Jahre', value: cpuYears.toLocaleString('de-DE'), desc: 'Aequivalente Rechenzeit auf einem einzelnen CPU-Kern' },
    { icon: '&#x1F9EC;', label: 'Proteine simuliert', value: proteins.toLocaleString('de-DE'), desc: 'Geschaetzte Proteinfaltungs-Simulationen' },
    { icon: '&#x1F9EA;', label: 'Genom-Sequenzierungen', value: genomSequencing, desc: 'Geschaetzte Anzahl aehnlich aufwaendiger Berechnungen wie Genom-Analysen' },
    { icon: '&#x26A1;', label: 'Energie (kWh)', value: energyKwh, desc: 'Geschaetzter Stromverbrauch der Berechnungen in Kilowattstunden' },
  ];

  container.innerHTML = equivalents.map(eq => `
    <div class="equiv-item">
      <span class="equiv-icon">${eq.icon}</span>
      <div class="equiv-content">
        <div class="equiv-value">${escapeHtml(eq.value)}</div>
        <div class="equiv-label">${escapeHtml(eq.label)}</div>
        <div class="equiv-desc">${escapeHtml(eq.desc)}</div>
      </div>
    </div>
  `).join('');
}

// ---- ASCII Art Achievements ----
function renderAsciiAchievements(team, members) {
  const container = document.getElementById('ascii-achievements');
  if (!container || !team) return;

  const achievements = [];

  // Check milestones
  if (team.score >= 100e9) {
    achievements.push({
      art: [
        '  .----.',
        ' | 100B |',
        '  \'----\'',
        '   /||\\',
        '  / || \\',
        ' /  ||  \\',
        '/========\\',
      ].join('\n'),
      title: '100 MILLIARDEN CLUB',
      desc: 'Score ueber 100 Milliarden erreicht!',
    });
  }

  if (team.score >= 300e9) {
    achievements.push({
      art: [
        '    ___',
        '   |   |',
        '   | 3 |',
        '   | 0 |',
        '   | 0 |',
        '   | B |',
        '  /|===|\\',
        ' / |___| \\',
        '/=========\\',
      ].join('\n'),
      title: '300B MEILENSTEIN',
      desc: '300 Milliarden ueberschritten!',
    });
  }

  if (team.rank <= 25) {
    achievements.push({
      art: [
        '     *',
        '    ***',
        '   *****',
        '  TOP 25',
        '   *****',
        '    ***',
        '     *',
      ].join('\n'),
      title: 'TOP 25 WELTWEIT',
      desc: 'Unter den Top 25 aller F@H Teams!',
    });
  }

  if (members && members.length >= 50) {
    achievements.push({
      art: [
        ' _____',
        '|  50+|',
        '| .-. |',
        '| | | |',
        '| \'-\' |',
        '|_____|',
        ' TEAM',
      ].join('\n'),
      title: '50+ MITGLIEDER',
      desc: 'Mehr als 50 aktive Folder im Team!',
    });
  }

  if (team.wus >= 400000) {
    achievements.push({
      art: [
        '  WU WU WU',
        ' WU  400K  WU',
        'WU  WORK   WU',
        ' WU UNITS  WU',
        '  WU WU WU',
      ].join('\n'),
      title: '400K WORK UNITS',
      desc: 'Ueber 400.000 Work Units abgeschlossen!',
    });
  }

  if (achievements.length === 0) {
    container.innerHTML = '<div class="ascii-empty">Achievements werden freigeschaltet wenn Meilensteine erreicht werden.</div>';
    return;
  }

  container.innerHTML = achievements.map(a => `
    <div class="ascii-achievement card">
      <pre class="ascii-art">${escapeHtml(a.art)}</pre>
      <div class="ascii-title">${escapeHtml(a.title)}</div>
      <div class="ascii-desc">${escapeHtml(a.desc)}</div>
    </div>
  `).join('');
}

// ---- Team Goals ----
async function initTeamGoals() {
  const container = document.getElementById('team-goals');
  if (!container) return;

  try {
    const res = await fetch('/api/goals');
    if (!res.ok) throw new Error('API error');
    const goals = await res.json();
    renderGoals(container, goals);
  } catch (err) {
    container.innerHTML = '<div class="goals-empty">Ziele konnten nicht geladen werden.</div>';
  }
}

function renderGoals(container, goals) {
  if (!goals || goals.length === 0) {
    container.innerHTML = '<div class="goals-empty">Keine Ziele definiert.</div>';
    return;
  }

  container.innerHTML = goals.map(g => {
    const pct = Math.min(100, Math.max(0, g.progress));
    const done = pct >= 100;
    return `
      <div class="goal-item ${done ? 'goal-done' : ''}">
        <div class="goal-header">
          <span class="goal-name">${done ? '&#x2705; ' : '&#x1F3AF; '}${escapeHtml(g.name)}</span>
          <span class="goal-pct">${pct.toFixed(1)}%</span>
        </div>
        <div class="goal-bar">
          <div class="goal-bar-fill" style="width:${pct}%"></div>
        </div>
        <div class="goal-footer">
          <span>${escapeHtml(formatScoreShort(g.current))} / ${escapeHtml(formatScoreShort(g.target))}</span>
          <span>${done ? 'Geschafft!' : 'Noch ' + escapeHtml(formatScoreShort(Math.abs(g.remaining)))}</span>
        </div>
      </div>
    `;
  }).join('');
}

// ---- Init ----
async function initExtrasFeatures(team, members) {
  renderScoreEquivalents(team, members);
  renderAsciiAchievements(team, members);
  await initTeamGoals();
}
