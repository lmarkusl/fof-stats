// ============================================================
// Feature: Streak Counter + Member of the Week
// ============================================================

// Utilities provided by utils.js (escapeHtml, formatScore, formatScoreShort)

async function initSocialFeatures() {
  try {
    const [streakRes, motwRes] = await Promise.all([
      fetch('/api/streak'),
      fetch('/api/motw'),
    ]);

    if (streakRes.ok) {
      const streak = await streakRes.json();
      renderStreak(streak);
    }

    if (motwRes.ok) {
      const motw = await motwRes.json();
      renderMOTW(motw);
    }
  } catch (err) {
    console.error('[SOCIAL] Load failed:', err.message);
    var streakEl = document.getElementById('streak-counter');
    if (streakEl) streakEl.innerHTML = '<div class="highlight-loading">Fehler beim Laden der Streak-Daten.</div>';
    var motwEl = document.getElementById('member-of-week');
    if (motwEl) motwEl.innerHTML = '<div class="highlight-loading">Fehler beim Laden.</div>';
  }
}

function renderStreak(data) {
  const container = document.getElementById('streak-counter');
  if (!container) return;

  const flames = data.current_streak >= 7 ? '&#x1F525;'.repeat(Math.min(5, Math.floor(data.current_streak / 7))) : '';

  container.innerHTML = `
    <div class="streak-display">
      <div class="streak-number">${escapeHtml(String(data.current_streak))}</div>
      <div class="streak-label">Tage ununterbrochen aktiv ${flames}</div>
    </div>
    <div class="streak-details">
      <span>Rekord: ${escapeHtml(String(data.max_streak))} Tage</span>
      <span>|</span>
      <span>Gesamt: ${escapeHtml(String(data.total_active_days))} aktive Tage</span>
    </div>
  `;
}

function renderMOTW(data) {
  const container = document.getElementById('member-of-week');
  if (!container) return;

  if (!data || !data.name || data.score_gained <= 0) {
    container.innerHTML = '<div class="motw-empty">Noch keine Daten fuer diese Woche.</div>';
    return;
  }

  container.innerHTML = `
    <div class="motw-card">
      <div class="motw-crown">&#x1F451;</div>
      <div class="motw-title">MEMBER OF THE WEEK</div>
      <div class="motw-name">${escapeHtml(data.name)}</div>
      <div class="motw-stats">
        <div class="motw-stat">
          <span class="motw-stat-value">+${escapeHtml(formatScoreShort(data.score_gained))}</span>
          <span class="motw-stat-label">Score Zuwachs</span>
        </div>
        <div class="motw-stat">
          <span class="motw-stat-value">+${escapeHtml(Number(data.wus_gained).toLocaleString('de-DE'))}</span>
          <span class="motw-stat-label">Work Units</span>
        </div>
      </div>
    </div>
  `;
}
