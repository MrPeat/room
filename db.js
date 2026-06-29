// นำเข้าโมดูล mysql2 สำหรับจัดการฐานข้อมูล MySQL
const mysql = require('mysql2');
const bcrypt = require('bcrypt');

// สร้าง Connection Pool ไปยังฐานข้อมูล MySQL
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'room_booking',
  port: parseInt(process.env.DB_PORT || '3306'),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// ตรวจสอบการเชื่อมต่อเบื้องต้น
pool.getConnection((err, connection) => {
  if (err) {
    console.error('Error connecting to MySQL database:', err.message);
  } else {
    console.log('Successfully connected to MySQL database');
    connection.release();
  }
});

// ── SQLite Compatibility Wrapper ──
// ฟังก์ชันจำลองคำสั่งแบบ sqlite3 เพื่อป้องกันไม่ให้โค้ดส่วนอื่นที่เรียกใช้ db.all, db.get, db.run เกิดข้อผิดพลาด

// 1. db.run(sql, params, callback)
function run(sql, params, callback) {
  if (typeof params === 'function') {
    callback = params;
    params = [];
  }
  pool.query(sql, params, (err, results) => {
    if (typeof callback === 'function') {
      const context = {
        lastID: results ? results.insertId : null,
        changes: results ? results.affectedRows : null
      };
      callback.call(context, err);
    }
  });
}

// 2. db.get(sql, params, callback)
function get(sql, params, callback) {
  if (typeof params === 'function') {
    callback = params;
    params = [];
  }
  pool.query(sql, params, (err, results) => {
    if (typeof callback === 'function') {
      const row = results && results.length > 0 ? results[0] : undefined;
      callback(err, row);
    }
  });
}

// 3. db.all(sql, params, callback)
function all(sql, params, callback) {
  if (typeof params === 'function') {
    callback = params;
    params = [];
  }
  pool.query(sql, params, (err, results) => {
    if (typeof callback === 'function') {
      callback(err, results || []);
    }
  });
}

const db = {
  serialize: (fn) => fn(), // จำลอง serialize ของ sqlite3 รันทันที
  run,
  get,
  all
};

// ── Password hashing (bcrypt) ──
function hashPassword(password) {
  const saltRounds = 10;
  const hash = bcrypt.hashSync(password, saltRounds);
  return { hash };
}

function verifyPassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}

// ฟังก์ชันเตรียมความพร้อมของฐานข้อมูล (สร้างตารางและข้อมูลเริ่มต้นใน MySQL)
function initialize() {
  console.log('Initializing MySQL Database Schema...');
  
  // 1. สร้างตาราง rooms (ห้องประชุม)
  db.run(`CREATE TABLE IF NOT EXISTS rooms (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    location VARCHAR(255) NOT NULL,
    capacity INT NOT NULL,
    description TEXT,
    facilities TEXT,
    active TINYINT NOT NULL DEFAULT 1
  )`, [], (err) => {
    if (err) return console.error('Error creating rooms table:', err.message);
    
    // 2. สร้างตาราง users (ผู้ใช้งาน)
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id VARCHAR(255) NOT NULL UNIQUE,
      full_name VARCHAR(255) NOT NULL,
      role VARCHAR(50) NOT NULL DEFAULT 'student',
      password_hash VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`, [], (err) => {
      if (err) return console.error('Error creating users table:', err.message);
      
      // 3. สร้างตาราง bookings (การจองห้อง)
      db.run(`CREATE TABLE IF NOT EXISTS bookings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        booker_id VARCHAR(255) NOT NULL,
        booker_type VARCHAR(50) NOT NULL DEFAULT 'student',
        room_id INT NOT NULL,
        start VARCHAR(50) NOT NULL,
        end VARCHAR(50) NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        note TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(room_id) REFERENCES rooms(id)
      )`, [], (err) => {
        if (err) return console.error('Error creating bookings table:', err.message);
        
        // ── สร้าง Admin account ตั้งต้น ──
        db.get('SELECT COUNT(*) AS count FROM users WHERE role = ?', ['admin'], (err, row) => {
          if (!err && row && row.count === 0) {
            const { hash } = hashPassword('admin123');
            db.run('INSERT INTO users (user_id, full_name, role, password_hash) VALUES (?, ?, ?, ?)',
              ['admin', 'ผู้ดูแลระบบ', 'admin', hash]);
          }
        });

        // ── ข้อมูลห้องประชุม ม.ทักษิณ วิทยาเขตพัทลุง ──
        db.get('SELECT COUNT(*) AS count FROM rooms', [], (err, row) => {
          if (!err && row && row.count === 0) {
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
            sampleRooms.forEach(room => {
              db.run('INSERT INTO rooms (name, location, capacity, description, facilities) VALUES (?, ?, ?, ?, ?)', room);
            });
          }
        });
      });
    });
  });
}

module.exports = {
  db,
  initialize,
  hashPassword,
  verifyPassword
};
