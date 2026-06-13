const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const { db, initialize, hashPassword, verifyPassword } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(cookieParser());

initialize();

function requireAdmin(req, res, next) {
  if (req.cookies.role === 'admin' && req.cookies.userId) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

function requireAuth(req, res, next) {
  if (req.cookies.role && req.cookies.userId) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

// ═══════════════════════════════════════
// สมัครสมาชิก
// ═══════════════════════════════════════
app.post('/api/register', (req, res) => {
  const { userId, fullName, password, role } = req.body;

  if (!userId || !fullName || !password) {
    return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบ' });
  }

  if (password.length < 4) {
    return res.status(400).json({ error: 'รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษร' });
  }

  const userRole = (role === 'staff') ? 'staff' : 'student';

  // ตรวจสอบว่ามี user นี้อยู่แล้วหรือไม่
  db.get('SELECT * FROM users WHERE user_id = ?', [userId], (err, existing) => {
    if (err) return res.status(500).json({ error: err.message });
    if (existing) return res.status(409).json({ error: 'รหัสนี้ถูกใช้งานแล้ว กรุณาใช้รหัสอื่น' });

    const { hash, salt } = hashPassword(password);
    db.run('INSERT INTO users (user_id, full_name, role, password_hash, password_salt) VALUES (?, ?, ?, ?, ?)',
      [userId, fullName, userRole, hash, salt], function (insertErr) {
        if (insertErr) return res.status(500).json({ error: insertErr.message });
        res.json({ success: true, userId, role: userRole, fullName });
      });
  });
});

// ═══════════════════════════════════════
// เข้าสู่ระบบ
// ═══════════════════════════════════════
app.post('/api/login', (req, res) => {
  const { role, userId, password } = req.body;

  if (!userId || !password) {
    return res.status(400).json({ error: 'กรุณากรอกรหัสผู้ใช้และรหัสผ่าน' });
  }

  db.get('SELECT * FROM users WHERE user_id = ?', [userId], (err, user) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!user) return res.status(401).json({ error: 'ไม่พบบัญชีผู้ใช้นี้ กรุณาสมัครสมาชิกก่อน' });

    // ตรวจสอบรหัสผ่าน
    if (!verifyPassword(password, user.password_hash, user.password_salt)) {
      return res.status(401).json({ error: 'รหัสผ่านไม่ถูกต้อง' });
    }

    // ตรวจสอบว่า role ตรงกัน
    if (role && role !== user.role) {
      return res.status(401).json({ error: `บัญชีนี้ลงทะเบียนเป็น "${user.role === 'student' ? 'นิสิต' : user.role === 'staff' ? 'บุคลากร' : 'ผู้ดูแลระบบ'}" ไม่ใช่ประเภทที่เลือก` });
    }

    // ตั้งค่า cookies
    res.cookie('role', user.role, { httpOnly: true });
    res.cookie('userId', user.user_id, { httpOnly: true });

    return res.json({
      success: true,
      role: user.role,
      userId: user.user_id,
      fullName: user.full_name
    });
  });
});

// ═══════════════════════════════════════
// ดึงข้อมูลผู้ใช้ปัจจุบัน
// ═══════════════════════════════════════
app.get('/api/me', (req, res) => {
  const userId = req.cookies.userId;
  const role = req.cookies.role;
  if (!userId || !role) return res.status(401).json({ error: 'Unauthorized' });

  db.get('SELECT user_id, full_name, role, created_at FROM users WHERE user_id = ?', [userId], (err, user) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  });
});

// ═══════════════════════════════════════
// ห้องประชุม (Public)
// ═══════════════════════════════════════
app.get('/api/rooms', (req, res) => {
  const { status, start, end, search } = req.query;
  let sql = 'SELECT * FROM rooms WHERE active = 1';
  const params = [];

  if (search) {
    sql += ' AND (name LIKE ? OR location LIKE ? OR description LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    if (status === 'available' && start && end) {
      const available = [];
      let pending = rows.length;
      rows.forEach((room) => {
        db.all('SELECT * FROM bookings WHERE room_id = ? AND status != ? AND ? < end AND ? > start', [room.id, 'cancelled', start, end], (bookingErr, bookings) => {
          if (bookingErr) {
            return res.status(500).json({ error: bookingErr.message });
          }
          if (bookings.length === 0) available.push(room);
          pending -= 1;
          if (pending === 0) res.json(available);
        });
      });
      if (rows.length === 0) res.json([]);
      return;
    }

    res.json(rows);
  });
});

// ═══════════════════════════════════════
// จองห้อง
// ═══════════════════════════════════════
app.post('/api/bookings', requireAuth, (req, res) => {
  const { roomId, start, end, note } = req.body;
  const bookerId = req.cookies.userId;
  const bookerType = req.cookies.role;

  if (bookerType === 'admin') {
    return res.status(403).json({ error: 'ผู้ดูแลระบบไม่สามารถจองห้องได้' });
  }

  if (!bookerId || !roomId || !start || !end) {
    return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบ' });
  }

  const startDate = new Date(start);
  const endDate = new Date(end);
  const now = new Date();

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    return res.status(400).json({ error: 'รูปแบบวันที่ไม่ถูกต้อง' });
  }

  if (startDate < now) {
    return res.status(400).json({ error: 'ไม่สามารถจองวันที่ผ่านมาแล้วได้' });
  }

  if (endDate <= startDate) {
    return res.status(400).json({ error: 'วันสิ้นสุดต้องอยู่หลังวันเริ่มต้น' });
  }

  if (endDate.getTime() - startDate.getTime() > 24 * 60 * 60 * 1000) {
    return res.status(400).json({ error: 'ไม่สามารถจองห้องต่อเนื่องเกิน 24 ชั่วโมงได้' });
  }

  db.all(
    'SELECT * FROM bookings WHERE room_id = ? AND status != ? AND ? < end AND ? > start',
    [roomId, 'cancelled', start, end],
    (err, conflicts) => {
      if (err) return res.status(500).json({ error: err.message });
      if (conflicts.length > 0) {
        return res.status(409).json({ error: 'ห้องนี้ถูกจองในช่วงเวลานี้แล้ว กรุณาเลือกช่วงเวลาอื่น' });
      }

      const sql = 'INSERT INTO bookings (booker_id, booker_type, room_id, start, end, note, status) VALUES (?, ?, ?, ?, ?, ?, ?)';
      db.run(sql, [bookerId, bookerType, roomId, start, end, note || '', 'pending'], function (insertErr) {
        if (insertErr) return res.status(500).json({ error: insertErr.message });
        res.json({ id: this.lastID, bookerId, bookerType, roomId, start, end, note, status: 'pending' });
      });
    }
  );
});

// ═══════════════════════════════════════
// Admin - จัดการห้อง
// ═══════════════════════════════════════
app.get('/api/admin/rooms', requireAdmin, (req, res) => {
  db.all('SELECT * FROM rooms', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/admin/rooms', requireAdmin, (req, res) => {
  const { name, location, capacity, description, active } = req.body;
  if (!name || !location || !capacity) return res.status(400).json({ error: 'Missing required fields' });
  db.run('INSERT INTO rooms (name, location, capacity, description, active) VALUES (?, ?, ?, ?, ?)', [name, location, capacity, description || '', active ? 1 : 0], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID, name, location, capacity, description, active: active ? 1 : 0 });
  });
});

app.put('/api/admin/rooms/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const { name, location, capacity, description, active } = req.body;
  db.run('UPDATE rooms SET name = ?, location = ?, capacity = ?, description = ?, active = ? WHERE id = ?', [name, location, capacity, description || '', active ? 1 : 0, id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Room not found' });
    res.json({ id: Number(id), name, location, capacity, description, active: active ? 1 : 0 });
  });
});

app.delete('/api/admin/rooms/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM rooms WHERE id = ?', [id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Room not found' });
    res.json({ success: true });
  });
});

// ═══════════════════════════════════════
// Admin - จัดการการจอง
// ═══════════════════════════════════════
app.get('/api/admin/bookings', requireAdmin, (req, res) => {
  db.all(`SELECT b.*, r.name AS room_name, u.full_name AS booker_name 
          FROM bookings b 
          LEFT JOIN rooms r ON b.room_id = r.id 
          LEFT JOIN users u ON b.booker_id = u.user_id 
          ORDER BY b.created_at DESC`, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/admin/bookings/:id/status', requireAdmin, (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  if (!['pending', 'confirmed', 'completed', 'cancelled'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  db.run('UPDATE bookings SET status = ? WHERE id = ?', [status, id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Booking not found' });
    res.json({ id: Number(id), status });
  });
});

// ═══════════════════════════════════════
// Admin - จัดการผู้ใช้
// ═══════════════════════════════════════
app.get('/api/admin/users', requireAdmin, (req, res) => {
  db.all('SELECT user_id, full_name, role, created_at FROM users ORDER BY created_at DESC', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// ═══════════════════════════════════════
// User - การจองของฉัน
// ═══════════════════════════════════════
app.get('/api/user/bookings', (req, res) => {
  const userId = req.cookies.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  db.all(`SELECT b.*, r.name AS room_name, r.location AS room_location 
          FROM bookings b 
          LEFT JOIN rooms r ON b.room_id = r.id 
          WHERE b.booker_id = ? 
          ORDER BY b.created_at DESC`, [userId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/user/bookings/:id/cancel', (req, res) => {
  const userId = req.cookies.userId;
  const { id } = req.params;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  db.get('SELECT * FROM bookings WHERE id = ?', [id], (err, booking) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (booking.booker_id !== userId) return res.status(403).json({ error: 'Forbidden' });
    db.run('UPDATE bookings SET status = ? WHERE id = ?', ['cancelled', id], function (updateErr) {
      if (updateErr) return res.status(500).json({ error: updateErr.message });
      res.json({ id: Number(id), status: 'cancelled' });
    });
  });
});

// ═══════════════════════════════════════
// Logout
// ═══════════════════════════════════════
app.get('/api/logout', (req, res) => {
  res.clearCookie('role');
  res.clearCookie('userId');
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
