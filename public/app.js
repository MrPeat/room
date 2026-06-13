// สคริปต์ส่วนกลางที่ใช้งานร่วมกันในหลายๆ หน้าของฝั่ง Client (เบราว์เซอร์)
// รอให้เบราว์เซอร์โหลดโครงสร้าง HTML (DOM) เสร็จสมบูรณ์ก่อนถึงจะเริ่มทำงานโค้ดด้านใน
document.addEventListener('DOMContentLoaded', () => {
  // ค้นหาปุ่มออกจากระบบ (id="logoutBtn" หรือ class="logout") และผูกฟังก์ชันคลิก
  document.querySelectorAll('#logoutBtn, .logout').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      await fetch('/api/logout');
      window.location.href = '/login.html';
    });
  });

  // เพิ่มฟีเจอร์สำหรับหน้าแอดมิน (admin.html) ให้รีเฟรชข้อมูลการจองอัตโนมัติ
  if (location.pathname.endsWith('/admin.html')) {
    // ตั้งเวลาให้ทำงานซ้ำทุกๆ 30 วินาที (30000 มิลลิวินาที)
    setInterval(() => {
      // ตรวจสอบว่ามีฟังก์ชัน loadBookings ให้เรียกใช้หรือไม่
      if(typeof loadBookings === 'function') {
        loadBookings();
      }
    }, 30000);
  }
});
