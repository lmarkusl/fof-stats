// ============================================================
// Shared Utility Functions
// Used across all JS modules (app.js, donor-page.js, donors-page.js,
// feature-ppd.js, feature-extras.js) to avoid duplication.
// Must be loaded before any other application script.
// ============================================================

/**
 * Escapes a string for safe HTML insertion by leveraging the browser's
 * built-in textContent encoding.
 * @param {string} str - The raw string to escape.
 * @returns {string} The HTML-escaped string.
 */
function escapeHtml(str) {
  var div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Formats a numeric score into a human-readable abbreviated string
 * (e.g. 1.5 M, 3.20 B). Uses German locale for numbers below 1000.
 * @param {number} n - The score value.
 * @returns {string} The formatted score string with unit suffix.
 */
function formatScore(n) {
  if (n >= 1e12) return (n / 1e12).toFixed(2) + ' T';
  if (n >= 1e9) return (n / 1e9).toFixed(2) + ' B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + ' M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + ' K';
  return Number(n).toLocaleString('de-DE');
}

/**
 * Formats a number with German locale separators (e.g. 1.234.567).
 * @param {number} n - The number to format.
 * @returns {string} The locale-formatted number string.
 */
function formatNumber(n) {
  return Number(n).toLocaleString('de-DE');
}

/**
 * Formats a score as a short string without locale formatting for small values.
 * Similar to formatScore but returns a plain string for numbers below 1000.
 * @param {number} n - The score value.
 * @returns {string} The abbreviated score string.
 */
function formatScoreShort(n) {
  if (n >= 1e12) return (n / 1e12).toFixed(2) + ' T';
  if (n >= 1e9) return (n / 1e9).toFixed(2) + ' B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + ' M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + ' K';
  return String(n);
}

/**
 * Returns the tier classification for a given score.
 * Tiers (ascending): Copper, Bronze, Silver, Gold, Platinum, Diamond.
 * @param {number} score - The donor's total score.
 * @returns {{ name: string, icon: string, color: string, class: string }} Tier metadata.
 */
function getTier(score) {
  if (score >= 100e9) return { name: 'Diamond', icon: '\u{1F48E}', color: '#0066cc', class: 'tier-diamond' };
  if (score >= 10e9)  return { name: 'Platinum', icon: '\u2B50', color: '#6600aa', class: 'tier-platinum' };
  if (score >= 1e9)   return { name: 'Gold', icon: '\u{1F947}', color: '#cc8800', class: 'tier-gold' };
  if (score >= 100e6) return { name: 'Silver', icon: '\u{1F948}', color: '#666666', class: 'tier-silver' };
  if (score >= 10e6)  return { name: 'Bronze', icon: '\u{1F949}', color: '#994400', class: 'tier-bronze' };
  return { name: 'Copper', icon: '\u{1F530}', color: '#884422', class: 'tier-copper' };
}
