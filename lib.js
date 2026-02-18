// Shared utility functions (testable without starting server)

function parseMembers(raw) {
  if (Array.isArray(raw) && raw.length > 0 && Array.isArray(raw[0])) {
    const headers = raw[0];
    return raw.slice(1).map(row => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = row[i]; });
      return obj;
    });
  }
  return raw;
}

function getTier(score) {
  if (score >= 100e9) return { name: 'Diamond', color: '#0066cc' };
  if (score >= 10e9)  return { name: 'Platinum', color: '#6600aa' };
  if (score >= 1e9)   return { name: 'Gold', color: '#cc8800' };
  if (score >= 100e6) return { name: 'Silver', color: '#666666' };
  if (score >= 10e6)  return { name: 'Bronze', color: '#994400' };
  return { name: 'Copper', color: '#884422' };
}

function formatScore(n) {
  if (n >= 1e12) return (n / 1e12).toFixed(2) + ' T';
  if (n >= 1e9) return (n / 1e9).toFixed(2) + ' B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + ' M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + ' K';
  return String(n);
}

function computeGini(scores) {
  const sorted = [...scores].sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return 0;
  const total = sorted.reduce((a, b) => a + b, 0);
  if (total === 0) return 0;
  let sum = 0;
  sorted.forEach((s, i) => { sum += (2 * (i + 1) - n - 1) * s; });
  return sum / (n * total);
}

function computePercentileFor80(members) {
  const sorted = [...members].sort((a, b) => b.score - a.score);
  const total = sorted.reduce((s, m) => s + m.score, 0);
  const target = total * 0.8;
  let cum = 0;
  let count = 0;
  for (const m of sorted) {
    cum += m.score;
    count++;
    if (cum >= target) break;
  }
  return { count, total: members.length, pct: (count / members.length) * 100 };
}

module.exports = {
  parseMembers,
  getTier,
  formatScore,
  computeGini,
  computePercentileFor80,
};
