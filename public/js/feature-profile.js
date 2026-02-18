// ============================================================
// Feature: Donor Profile Modal + Export/Share
// ============================================================

// Utilities provided by utils.js (escapeHtml, formatScoreShort)

// Create modal HTML once
function createProfileModal() {
  if (document.getElementById('profile-modal')) return;

  const modal = document.createElement('div');
  modal.id = 'profile-modal';
  modal.className = 'profile-modal';
  modal.innerHTML = `
    <div class="profile-modal-content card">
      <div class="profile-modal-header">
        <span class="profile-modal-title">MEMBER.EXE</span>
        <button class="profile-modal-close" onclick="closeProfileModal()">[ X ]</button>
      </div>
      <div class="profile-modal-body" id="profile-modal-body">
        Loading...
      </div>
    </div>
  `;
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeProfileModal();
  });
  document.body.appendChild(modal);
}

function openProfileModal(memberName, memberData) {
  createProfileModal();
  const modal = document.getElementById('profile-modal');
  const body = document.getElementById('profile-modal-body');

  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';

  body.innerHTML = `
    <div class="profile-header-info">
      <h3>${escapeHtml(memberName)}</h3>
      <div class="profile-stats-grid">
        <div class="profile-stat">
          <span class="profile-stat-label">Score</span>
          <span class="profile-stat-value">${formatScoreShort(memberData.score)}</span>
        </div>
        <div class="profile-stat">
          <span class="profile-stat-label">Work Units</span>
          <span class="profile-stat-value">${Number(memberData.wus).toLocaleString('de-DE')}</span>
        </div>
        <div class="profile-stat">
          <span class="profile-stat-label">Rang</span>
          <span class="profile-stat-value">#${memberData.rank || '---'}</span>
        </div>
        <div class="profile-stat">
          <span class="profile-stat-label">Effizienz</span>
          <span class="profile-stat-value">${memberData.wus > 0 ? formatScoreShort(Math.round(memberData.score / memberData.wus)) + ' P/WU' : '---'}</span>
        </div>
      </div>
    </div>
    <div class="profile-chart-container">
      <canvas id="profile-chart"></canvas>
    </div>
    <div class="profile-links">
      <a href="https://stats.foldingathome.org/donor/${encodeURIComponent(memberData.id)}" target="_blank" rel="noopener">F@H Profil</a>
    </div>
  `;

  // Load history chart
  loadProfileChart(memberName);
}

async function loadProfileChart(name) {
  try {
    const res = await fetch('/api/history/member/' + encodeURIComponent(name) + '?period=daily&limit=30');
    if (!res.ok) return;
    const history = await res.json();

    const canvas = document.getElementById('profile-chart');
    if (!canvas || !history.length) return;

    new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels: history.map(h => h.date),
        datasets: [{
          label: 'Score',
          data: history.map(h => h.score),
          borderColor: '#0000cc',
          backgroundColor: 'rgba(0,0,204,0.1)',
          borderWidth: 2,
          fill: true,
          tension: 0.3,
          pointRadius: 2,
        }],
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#ffffff',
            borderColor: '#808080',
            borderWidth: 1,
            titleColor: '#1a1a1a',
            bodyColor: '#444444',
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 9 } } },
          y: { ticks: { callback: v => formatScoreShort(v) }, grid: { color: 'rgba(0,0,0,0.06)' } },
        },
      },
    });
  } catch (err) {
    console.error('[PROFILE] Chart load failed:', err.message);
  }
}

function closeProfileModal() {
  const modal = document.getElementById('profile-modal');
  if (modal) {
    modal.style.display = 'none';
    document.body.style.overflow = '';
  }
}

// Close on Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeProfileModal();
});

// Export/Share: Generate team score card as image
function generateShareCard() {
  const canvas = document.createElement('canvas');
  canvas.width = 600;
  canvas.height = 340;
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#2c2c2c';
  ctx.fillRect(0, 0, 600, 340);

  // Border
  ctx.strokeStyle = '#555555';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, 596, 336);

  // Terminal prefix
  ctx.fillStyle = '#cccccc';
  ctx.font = "14px 'Courier New', monospace";
  ctx.fillText('C:\\FOF>', 20, 36);

  // Team name
  ctx.fillStyle = '#ffffff';
  ctx.font = "bold 28px 'Courier New', monospace";
  ctx.fillText('FreilaufendeOnlineFuzzies', 20, 76);

  // Team info
  ctx.fillStyle = '#aaaaaa';
  ctx.font = "14px 'Courier New', monospace";
  ctx.fillText('Team #240890 | Folding@Home', 20, 100);

  // Stats
  if (typeof APP !== 'undefined' && APP.team) {
    const t = APP.team;
    ctx.font = "bold 18px 'Courier New', monospace";

    ctx.fillStyle = '#0066cc';
    ctx.fillText('SCORE', 40, 150);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(formatScoreShort(t.score), 180, 150);

    ctx.fillStyle = '#008080';
    ctx.fillText('WUs', 40, 180);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(Number(t.wus).toLocaleString('de-DE'), 180, 180);

    ctx.fillStyle = '#cc6600';
    ctx.fillText('RANK', 40, 210);
    ctx.fillStyle = '#ffffff';
    ctx.fillText('#' + t.rank, 180, 210);

    ctx.fillStyle = '#008800';
    ctx.fillText('MEMBERS', 40, 240);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(String(APP.members ? APP.members.length : '---'), 180, 240);
  }

  // Footer
  ctx.fillStyle = '#666666';
  ctx.font = "11px 'Courier New', monospace";
  ctx.fillText('Generated: ' + new Date().toLocaleDateString('de-DE'), 20, 300);
  ctx.fillText('foldingathome.org/team/240890', 20, 318);

  // Download
  const link = document.createElement('a');
  link.download = 'fof-stats-' + new Date().toISOString().split('T')[0] + '.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
}

// Initialize
function initProfileFeatures() {
  var exportBtn = document.getElementById('export-share-btn');
  if (exportBtn) exportBtn.addEventListener('click', generateShareCard);
}
