// ============================================================
// Donors List Page (extracted from inline script for CSP)
// ============================================================

var allMembers = [];

async function loadMembers() {
  try {
    var res = await fetch('/api/members');
    if (!res.ok) throw new Error('API error');
    allMembers = await res.json();
    allMembers.sort(function(a, b) { return b.score - a.score; });
    renderMembers(allMembers);
  } catch (err) {
    document.getElementById('donors-grid').innerHTML = '<div class="forecast-loading">Fehler beim Laden.</div>';
  }
}

function renderMembers(members) {
  var grid = document.getElementById('donors-grid');
  grid.innerHTML = members.map(function(m, i) {
    var tier = getTier(m.score);
    return '<a href="/donor/' + encodeURIComponent(m.name) + '" class="donor-card card">' +
      '<div class="donor-card-rank">#' + (i + 1) + '</div>' +
      '<div class="donor-card-tier"><span class="tier-badge ' + tier.name.toLowerCase() + '">' + escapeHtml(tier.icon + ' ' + tier.name) + '</span></div>' +
      '<div class="donor-card-name">' + escapeHtml(m.name) + '</div>' +
      '<div class="donor-card-score">' + escapeHtml(formatScoreShort(m.score)) + '</div>' +
      '<div class="donor-card-wus">' + escapeHtml(Number(m.wus).toLocaleString('de-DE')) + ' WUs</div>' +
      '</a>';
  }).join('');
}

document.addEventListener('DOMContentLoaded', function() {
  var searchInput = document.getElementById('member-search');
  if (searchInput) {
    searchInput.addEventListener('input', function(e) {
      var q = e.target.value.toLowerCase();
      renderMembers(allMembers.filter(function(m) { return m.name.toLowerCase().includes(q); }));
    });
  }
  loadMembers();
});
