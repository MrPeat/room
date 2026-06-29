# ระบบจองห้องประชุม Prototype

ระบบตัวอย่างสำหรับการส่งมอบโครงงาน โดยมีฟีเจอร์หลักดังนี้:

- จำลองระบบเข้าสู่ระบบสำหรับ `Student` และ `Admin`
- ระบบจัดการห้องประชุมแบบ CRUD สำหรับผู้ดูแล
- RESTful API สำหรับดึงข้อมูลห้องและสร้างการจอง
- หน้าค้นหาและกรองสถานะห้องว่างตามช่วงเวลา
- Dashboard แสดงรายการการจองสำหรับผู้ดูแล

## การใช้งาน

1. ติดตั้ง dependencies:

```powershell
npm install
```

2. เริ่มเซิร์ฟเวอร์:

```powershell
npm start
```

3. เปิดเว็บเบราว์เซอร์ที่:

```text
http://localhost:3000/login.html
```

## รีสตาร์ทเซิร์ฟเวอร์หลังแก้โค้ด backend

ถ้าคุณแก้ไฟล์ `server.js` หรือ `db.js` ให้รีสตาร์ทเซิร์ฟเวอร์ด้วยคำสั่ง:

```powershell
# หยุดกระบวนการ node (ถ้ามี) แล้วเริ่มใหม่
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
npm start
```

หรือแค่ปิด terminal ที่รัน `npm start` แล้วรัน `npm start` อีกครั้ง

## หน้าใหม่
- Student Dashboard: `http://localhost:3000/student.html`
- Admin: `http://localhost:3000/admin.html`

## Docker

สร้างและรันด้วย Docker Compose:

```powershell
docker compose up --build
```

เปิดเว็บเบราว์เซอร์ที่:

```text
http://localhost:3000/login.html
```

ข้อมูลฐานข้อมูลจะถูกเก็บไว้ใน volume ชื่อ `room-booking-prototype_app-data`

## บัญชีตัวอย่าง

- Admin: รหัสผ่าน `admin123`
- Student: กรอกรหัสนิสิตใดก็ได้

## API ตัวอย่าง

- `GET /api/rooms`
- `POST /api/bookings`
- `GET /api/admin/bookings`
- `GET /api/admin/rooms`
