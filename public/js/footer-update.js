// ============================================================
// Footer: Letztes Update - Zeigt Datum des letzten Snapshots
// Fetches from /api/history/summary
// Container: #last-update (im Footer aller Seiten)
// Auto-initialisiert bei DOMContentLoaded. Depends on: nichts
// ============================================================

(function() {
  document.addEventListener('DOMContentLoaded', function() {
    var el = document.getElementById('last-update');
    if (!el) return;

    fetch('/api/history/summary')
      .then(function(res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function(data) {
        if (!data.last_snapshot) return;
        var d = new Date(data.last_snapshot + 'Z');
        var day = String(d.getDate()).padStart(2, '0');
        var month = String(d.getMonth() + 1).padStart(2, '0');
        var year = d.getFullYear();
        var hours = String(d.getHours()).padStart(2, '0');
        var minutes = String(d.getMinutes()).padStart(2, '0');
        el.textContent = 'Letztes Update: ' + day + '.' + month + '.' + year + ', ' + hours + ':' + minutes + ' Uhr';
      })
      .catch(function() {
        // Silent fail - footer update is non-critical
      });
  });
})();
