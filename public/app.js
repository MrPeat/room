// Global client script for common behaviors
document.addEventListener('DOMContentLoaded', () => {
  // Attach logout links/buttons
  document.querySelectorAll('#logoutBtn, .logout').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      await fetch('/api/logout');
      window.location.href = '/login.html';
    });
  });

  // Enhance admin pages with auto-refresh for bookings
  if (location.pathname.endsWith('/admin.html')) {
    setInterval(() => {
      if(typeof loadBookings === 'function') {
        loadBookings();
      }
    }, 30000);
  }
});
