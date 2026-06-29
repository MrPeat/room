// นำเข้าโมดูล sqlite3 สำหรับจัดการฐานข้อมูล SQLite
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
// นำเข้าโมดูล bcrypt สำหรับเข้ารหัสข้อมูล (เช่น รหัสผ่าน)
const bcrypt = require('bcrypt');

// กำหนดตำแหน่งที่เก็บไฟล์ฐานข้อมูล
// ใช้ persistent disk ของ Render ถ้ามี, ไม่งั้น fallback ไป local
const dataDir = process.env.DB_PATH
  ? path.dirname(process.env.DB_PATH)
  : (process.env.RENDER_DATA_DIR || __dirname);
const dbFile = process.env.DB_PATH || path.join(dataDir, 'data.sqlite');
fs.mkdirSync(path.dirname(dbFile), { recursive: true });
// สร้างหรือเชื่อมต่อกับไฟล์ฐานข้อมูล SQLite
const db = new sqlite3.Database(dbFile);

// ── Password hashing (bcrypt) ──
// ฟังก์ชันสำหรับเข้ารหัสรหัสผ่าน เพื่อป้องกันการเก็บรหัสผ่านเป็นข้อความธรรมดา
function hashPassword(password) {
  const saltRounds = 10;
  const hash = bcrypt.hashSync(password, saltRounds);
  return { hash };
}

function verifyPassword(password, hash) {
  return bcrypt.compareSync(password, hash);
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
      facilities TEXT,
      active INTEGER NOT NULL DEFAULT 1
    )`);

    // สร้างตารางข้อมูลผู้ใช้งาน (users) หากยังไม่มี
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'student',
      password_hash TEXT NOT NULL,
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
        const { hash } = hashPassword('admin123');
        db.run('INSERT INTO users (user_id, full_name, role, password_hash) VALUES (?, ?, ?, ?)',
          ['admin', 'ผู้ดูแลระบบ', 'admin', hash]);
      }
    });

    // ── ข้อมูลห้องประชุม ม.ทักษิณ วิทยาเขตพัทลุง ──
    // ตรวจสอบว่ามีห้องในระบบหรือยัง ถ้ายังให้เพิ่มข้อมูลห้องตัวอย่างลงไป
    db.get('SELECT COUNT(*) AS count FROM rooms', (err, row) => {
      if (!err && row.count === 0) {
        const sampleRooms = [
          ['ห้องประชุมป่าพะยอม', 'อาคารหอประชุมเฉลิมพระเกียรติ ชั้น 2', 200, 'ห้องประชุมขนาดใหญ่ รองรับงานสัมมนาและพิธีการ พร้อมระบบเสียงและโปรเจคเตอร์', 'โปรเจคเตอร์, ปลั๊กพ่วง, ไมโครโฟน, เครื่องเสียง'],
          ['ห้องประชุมควนขนุน', 'อาคารหอประชุมเฉลิมพระเกียรติ ชั้น 1 (ด้านหน้า)', 30, 'ห้องประชุมขนาดเล็ก เหมาะสำหรับประชุมกลุ่มย่อย', 'กระดานไวท์บอร์ด, ปลั๊กพ่วง, สมาร์ททีวี'],
          ['ห้องประชุมศรีบรรพต', 'อาคารหอประชุมเฉลิมพระเกียรติ ชั้น 1 (ห้องกระจก)', 80, 'ห้องประชุมขนาดใหญ่ ผนังกระจก บรรยากาศโปร่งโล่ง', 'โปรเจคเตอร์, ปลั๊กพ่วง, กระดานไวท์บอร์ด'],
          ['ห้องประชุมศรีนครินทร์', 'อาคารหอประชุมเฉลิมพระเกียรติ ชั้น 1', 50, 'ห้องประชุมขนาดกลาง พร้อมโต๊ะประชุมและระบบนำเสนอ', 'โปรเจคเตอร์, ไมโครโฟน'],
          ['ห้องประชุมราชพฤกษ์', 'อาคารสัมมนาคาร', 150, 'ห้องประชุมขนาดใหญ่ รองรับงานสัมมนาและอบรม พร้อมระบบแสงเสียงครบครัน', 'โปรเจคเตอร์, ปลั๊กพ่วง, ไมโครโฟน, เครื่องเสียง'],
          ['ห้องประชุมบัวหลวง', 'อาคารสัมมนาคาร', 60, 'ห้องประชุมขนาดกลาง เหมาะสำหรับประชุมเชิงปฏิบัติการ', 'โปรเจคเตอร์, กระดานไวท์บอร์ด'],
          ['ห้องประชุมบัวหลวง 1', 'อาคารสัมมนาคาร', 30, 'ห้องประชุมขนาดเล็ก พร้อมอุปกรณ์โสตทัศนูปกรณ์', 'สมาร์ททีวี, ปลั๊กพ่วง'],
          ['ห้องประชุมบัวหลวง 2', 'อาคารสัมมนาคาร', 30, 'ห้องประชุมขนาดเล็ก พร้อมอุปกรณ์โสตทัศนูปกรณ์', 'สมาร์ททีวี, ปลั๊กพ่วง'],
          ['ห้องประชุม MF 3200', 'อาคารเรียนรวม', 200, 'ห้องประชุมสัมมนาขนาดใหญ่ พร้อมระบบประชุมทางไกล (Video Conference)', 'โปรเจคเตอร์, ระบบประชุมทางไกล, ไมโครโฟน'],
          ['ห้องประชุมจิรพรรณ (NS2112)', 'อาคารคณะพยาบาลศาสตร์ ชั้น 1', 40, 'ห้องประชุมคณะพยาบาลศาสตร์ พร้อมจอแสดงผลและระบบเสียง', 'โปรเจคเตอร์, ไมโครโฟน']
        ];
        const stmt = db.prepare('INSERT INTO rooms (name, location, capacity, description, facilities) VALUES (?, ?, ?, ?, ?)');
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
