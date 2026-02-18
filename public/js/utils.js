// ============================================================
// Shared Utility Functions
// Used across all JS modules to avoid duplication
// ============================================================

function escapeHtml(str) {
  var div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatScore(n) {
  if (n >= 1e12) return (n / 1e12).toFixed(2) + ' T';
  if (n >= 1e9) return (n / 1e9).toFixed(2) + ' B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + ' M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + ' K';
  return Number(n).toLocaleString('de-DE');
}

function formatNumber(n) {
  return Number(n).toLocaleString('de-DE');
}

function formatScoreShort(n) {
  if (n >= 1e12) return (n / 1e12).toFixed(2) + ' T';
  if (n >= 1e9) return (n / 1e9).toFixed(2) + ' B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + ' M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + ' K';
  return String(n);
}

function getTier(score) {
  if (score >= 100e9) return { name: 'Diamond', icon: '\u{1F48E}', color: '#0066cc', class: 'tier-diamond' };
  if (score >= 10e9)  return { name: 'Platinum', icon: '\u2B50', color: '#6600aa', class: 'tier-platinum' };
  if (score >= 1e9)   return { name: 'Gold', icon: '\u{1F947}', color: '#cc8800', class: 'tier-gold' };
  if (score >= 100e6) return { name: 'Silver', icon: '\u{1F948}', color: '#666666', class: 'tier-silver' };
  if (score >= 10e6)  return { name: 'Bronze', icon: '\u{1F949}', color: '#994400', class: 'tier-bronze' };
  return { name: 'Copper', icon: '\u{1F530}', color: '#884422', class: 'tier-copper' };
}
