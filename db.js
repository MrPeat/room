// นำเข้าโมดูล sqlite3 สำหรับจัดการฐานข้อมูล SQLite
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
// นำเข้าโมดูล crypto สำหรับเข้ารหัสข้อมูล (เช่น รหัสผ่าน)
const crypto = require('crypto');

// กำหนดตำแหน่งที่เก็บไฟล์ฐานข้อมูล
// ใช้ persistent disk ของ Render ถ้ามี, ไม่งั้น fallback ไป local
const dataDir = process.env.RENDER_DATA_DIR || __dirname;
const dbFile = path.join(dataDir, 'data.sqlite');
// สร้างหรือเชื่อมต่อกับไฟล์ฐานข้อมูล SQLite
const db = new sqlite3.Database(dbFile);

// ── Password hashing (SHA-256 + salt) ──
// ฟังก์ชันสำหรับเข้ารหัสรหัสผ่าน เพื่อป้องกันการเก็บรหัสผ่านเป็นข้อความธรรมดา
function hashPassword(password, salt) {
  // หากไม่มี Salt (สำหรับผู้ใช้ใหม่) ให้สุ่มชุดอักขระขึ้นมา
  if (!salt) salt = crypto.randomBytes(16).toString('hex');
  // นำ Salt มาต่อกับรหัสผ่าน แล้วนำไปเข้ารหัสด้วยวิธี SHA-256
  const hash = crypto.createHash('sha256').update(salt + password).digest('hex');
  return { hash, salt };
}

function verifyPassword(password, hash, salt) {
  const check = crypto.createHash('sha256').update(salt + password).digest('hex');
  return check === hash;
}

// ฟังก์ชันเตรียมความพร้อมของฐานข้อมูล (สร้างตารางและข้อมูลเริ่มต้น)
function initialize() {
  db.serialize(() => {
    // สร้างตารางข้อมูลห้องประชุม (rooms) หากยังไม่มี
    db.run(`CREATE TABLE IF NOT EXISTS rooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      location TEXT NOT NULL,
      capacity INTEGER NOT NULL,
      description TEXT,
      active INTEGER NOT NULL DEFAULT 1
    )`);

    // สร้างตารางข้อมูลผู้ใช้งาน (users) หากยังไม่มี
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'student',
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);

    // สร้างตารางข้อมูลการจอง (bookings) หากยังไม่มี
    db.run(`CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booker_id TEXT NOT NULL,
      booker_type TEXT NOT NULL DEFAULT 'student',
      room_id INTEGER NOT NULL,
      start TEXT NOT NULL,
      end TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      note TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(room_id) REFERENCES rooms(id)
    )`);

    // เพิ่ม column booker_type ถ้ายังไม่มี (สำหรับ database เดิม)
    db.run(`ALTER TABLE bookings ADD COLUMN booker_type TEXT NOT NULL DEFAULT 'student'`, () => {});
    // เปลี่ยนชื่อคอลัมน์ student_id เป็น booker_id สำหรับฐานข้อมูลเก่า (ถ้ามี)
    db.run(`ALTER TABLE bookings RENAME COLUMN student_id TO booker_id`, () => {});

    // ── สร้าง Admin account ตั้งต้น ──
    // ตรวจสอบว่าในระบบมีแอดมินหรือยัง ถ้ายังให้สร้างแอดมินเริ่มต้น
    db.get('SELECT COUNT(*) AS count FROM users WHERE role = ?', ['admin'], (err, row) => {
      if (!err && row.count === 0) {
        const { hash, salt } = hashPassword('admin123');
        db.run('INSERT INTO users (user_id, full_name, role, password_hash, password_salt) VALUES (?, ?, ?, ?, ?)',
          ['admin', 'ผู้ดูแลระบบ', 'admin', hash, salt]);
      }
    });

    // ── ข้อมูลห้องประชุม ม.ทักษิณ วิทยาเขตพัทลุง ──
    // ตรวจสอบว่ามีห้องในระบบหรือยัง ถ้ายังให้เพิ่มข้อมูลห้องตัวอย่างลงไป
    db.get('SELECT COUNT(*) AS count FROM rooms', (err, row) => {
      if (!err && row.count === 0) {
        const sampleRooms = [
          ['ห้องประชุมป่าพะยอม', 'อาคารหอประชุมเฉลิมพระเกียรติ ชั้น 2', 200, 'ห้องประชุมขนาดใหญ่ รองรับงานสัมมนาและพิธีการ พร้อมระบบเสียงและโปรเจคเตอร์'],
          ['ห้องประชุมควนขนุน', 'อาคารหอประชุมเฉลิมพระเกียรติ ชั้น 1 (ด้านหน้า)', 30, 'ห้องประชุมขนาดเล็ก เหมาะสำหรับประชุมกลุ่มย่อย'],
          ['ห้องประชุมศรีบรรพต', 'อาคารหอประชุมเฉลิมพระเกียรติ ชั้น 1 (ห้องกระจก)', 80, 'ห้องประชุมขนาดใหญ่ ผนังกระจก บรรยากาศโปร่งโล่ง'],
          ['ห้องประชุมศรีนครินทร์', 'อาคารหอประชุมเฉลิมพระเกียรติ ชั้น 1', 50, 'ห้องประชุมขนาดกลาง พร้อมโต๊ะประชุมและระบบนำเสนอ'],
          ['ห้องประชุมราชพฤกษ์', 'อาคารสัมมนาคาร', 150, 'ห้องประชุมขนาดใหญ่ รองรับงานสัมมนาและอบรม พร้อมระบบแสงเสียงครบครัน'],
          ['ห้องประชุมบัวหลวง', 'อาคารสัมมนาคาร', 60, 'ห้องประชุมขนาดกลาง เหมาะสำหรับประชุมเชิงปฏิบัติการ'],
          ['ห้องประชุมบัวหลวง 1', 'อาคารสัมมนาคาร', 30, 'ห้องประชุมขนาดเล็ก พร้อมอุปกรณ์โสตทัศนูปกรณ์'],
          ['ห้องประชุมบัวหลวง 2', 'อาคารสัมมนาคาร', 30, 'ห้องประชุมขนาดเล็ก พร้อมอุปกรณ์โสตทัศนูปกรณ์'],
          ['ห้องประชุม MF 3200', 'อาคารเรียนรวม', 200, 'ห้องประชุมสัมมนาขนาดใหญ่ พร้อมระบบประชุมทางไกล (Video Conference)'],
          ['ห้องประชุมจิรพรรณ (NS2112)', 'อาคารคณะพยาบาลศาสตร์ ชั้น 1', 40, 'ห้องประชุมคณะพยาบาลศาสตร์ พร้อมจอแสดงผลและระบบเสียง']
        ];
        const stmt = db.prepare('INSERT INTO rooms (name, location, capacity, description) VALUES (?, ?, ?, ?)');
        sampleRooms.forEach(room => stmt.run(room));
        stmt.finalize();
      }
    });
  });
}

module.exports = {
  db,
  initialize,
  hashPassword,
  verifyPassword
};
