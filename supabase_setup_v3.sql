-- ==========================================================================
-- สคริปต์ตั้งค่าฐานข้อมูล Supabase สำหรับอัปเดตระบบซิงค์ข้อมูลลารายบุคคล (เวอร์ชัน 3)
-- คัดลอกโค้ดทั้งหมดนี้ไปวางและกด Run ในหน้า SQL Editor ของ Supabase
-- ==========================================================================

-- เพิ่มคอลัมน์เก็บข้อมูลปีการศึกษา รอบประเมิน และสถิติวันลาในตาราง teachers
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS academic_year TEXT DEFAULT '2568';
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS evaluation_round TEXT DEFAULT 'ครั้งที่ 1';

ALTER TABLE teachers ADD COLUMN IF NOT EXISTS leave_sick_times INTEGER DEFAULT 0;
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS leave_sick_days INTEGER DEFAULT 0;

ALTER TABLE teachers ADD COLUMN IF NOT EXISTS leave_personal_times INTEGER DEFAULT 0;
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS leave_personal_days INTEGER DEFAULT 0;

ALTER TABLE teachers ADD COLUMN IF NOT EXISTS leave_late_times INTEGER DEFAULT 0;
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS leave_late_days INTEGER DEFAULT 0;

ALTER TABLE teachers ADD COLUMN IF NOT EXISTS leave_other_times INTEGER DEFAULT 0;
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS leave_other_days INTEGER DEFAULT 0;
