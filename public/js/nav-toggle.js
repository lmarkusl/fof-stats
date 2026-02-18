// ============================================================
// Navigation Toggle & Impressum Modal
// Handles the mobile hamburger menu toggle and the legal
// information (Impressum) modal dialog. Extracted from inline
// scripts for Content Security Policy compliance.
// ============================================================
document.addEventListener('DOMContentLoaded', function () {
  var toggle = document.getElementById('nav-toggle');
  if (!toggle) return;

  // Toggle mobile navigation menu open/closed
  toggle.addEventListener('click', function () {
    var links = document.getElementById('nav-links');
    links.classList.toggle('open');
    this.setAttribute('aria-expanded', links.classList.contains('open'));
  });

  // Close mobile nav when any link is clicked
  document.querySelectorAll('.nav-links a').forEach(function (link) {
    link.addEventListener('click', function () {
      document.getElementById('nav-links').classList.remove('open');
      document.getElementById('nav-toggle').setAttribute('aria-expanded', 'false');
    });
  });

  // Impressum (legal information) modal
  var impressumLink = document.querySelector('a[href="#impressum"]');
  var impressumModal = document.getElementById('impressum-modal');
  if (impressumLink && impressumModal) {
    impressumLink.addEventListener('click', function (e) {
      e.preventDefault();
      impressumModal.style.display = 'flex';
    });
    // Close when clicking outside the modal content
    impressumModal.addEventListener('click', function (e) {
      if (e.target === impressumModal) impressumModal.style.display = 'none';
    });
    var closeBtn = impressumModal.querySelector('button');
    if (closeBtn) {
      closeBtn.addEventListener('click', function () {
        impressumModal.style.display = 'none';
      });
    }
  }
});
