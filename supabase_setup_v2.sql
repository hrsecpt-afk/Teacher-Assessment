-- ==========================================================================
-- สคริปต์ตั้งค่าฐานข้อมูล Supabase สำหรับระบบ 2 บทบาทและส่งไฟล์ประเมิน
-- คัดลอกโค้ดทั้งหมดนี้ไปวางและกด Run ในหน้า SQL Editor ของ Supabase
-- ==========================================================================

-- 1. เพิ่มคอลัมน์ pin ในตาราง teachers (ถ้ายังไม่มี)
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS pin TEXT DEFAULT '1234';

-- 2. สร้างตารางสำหรับเก็บข้อมูลไฟล์แนบของครู
CREATE TABLE IF NOT EXISTS teacher_files (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  teacher_id UUID REFERENCES teachers(id) ON DELETE CASCADE,
  file_type TEXT CHECK (file_type IN ('booklet', 'presentation', 'other')),
  file_name TEXT,
  file_url TEXT,
  file_size BIGINT,
  uploaded_at TIMESTAMPTZ DEFAULT now()
);

-- 3. เปิดใช้งาน Row Level Security (RLS) สำหรับตารางไฟล์แนบ
ALTER TABLE teacher_files ENABLE ROW LEVEL SECURITY;

-- 4. สร้าง Policy ให้ทุกคนสามารถจัดการไฟล์แนบได้ (แบบไม่มีสิทธิ์การใช้งานซับซ้อน)
DROP POLICY IF EXISTS "allow_all_teacher_files" ON teacher_files;
CREATE POLICY "allow_all_teacher_files" ON teacher_files FOR ALL USING (true) WITH CHECK (true);

-- 5. สร้าง Storage Bucket ชื่อ 'eval-files' สำหรับเก็บไฟล์เล่มประเมินและสไลด์นำเสนอ
INSERT INTO storage.buckets (id, name, public)
VALUES ('eval-files', 'eval-files', true)
ON CONFLICT (id) DO NOTHING;

-- 6. สร้าง Policy ให้ทุกคนอัปโหลด ดาวน์โหลด และลบไฟล์ใน bucket 'eval-files' ได้
DROP POLICY IF EXISTS "allow_all_eval_files" ON storage.objects;
CREATE POLICY "allow_all_eval_files" ON storage.objects FOR ALL USING (bucket_id = 'eval-files') WITH CHECK (bucket_id = 'eval-files');
