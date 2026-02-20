// ============================================================
// Feature: LAST_UPDATE - Letztes Update Datum im Footer
// Zeigt das Datum und die Uhrzeit des letzten API-Snapshots
// im Footer an (deutsches Format: TT.MM.JJJJ, HH:MM Uhr).
// Fetches from /api/history/summary
// Container: #last-update
// Self-initializing (IIFE). Depends on: nothing
// ============================================================

(function () {
  var el = document.getElementById('last-update');
  if (!el) return;

  fetch('/api/history/summary')
    .then(function (res) { return res.json(); })
    .then(function (data) {
      if (data && data.last_snapshot) {
        var d = new Date(data.last_snapshot + 'Z');
        var day = String(d.getDate()).padStart(2, '0');
        var month = String(d.getMonth() + 1).padStart(2, '0');
        var year = d.getFullYear();
        var hours = String(d.getHours()).padStart(2, '0');
        var minutes = String(d.getMinutes()).padStart(2, '0');
        el.textContent = day + '.' + month + '.' + year + ', ' + hours + ':' + minutes + ' Uhr';
      }
    })
    .catch(function () {
      // Silent fail - footer shows fallback "---"
    });
})();
