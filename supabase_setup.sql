-- =====================================================
-- แก้ไข Policy ที่มีอยู่แล้ว (Run อันนี้แทนครับ)
-- =====================================================

-- ลบ Policy เก่าออกก่อน (ถ้ามี)
drop policy if exists "allow_all_teachers"    on teachers;
drop policy if exists "allow_all_evaluations" on evaluations;

-- สร้าง Policy ใหม่
create policy "allow_all_teachers"    on teachers    for all using (true) with check (true);
create policy "allow_all_evaluations" on evaluations for all using (true) with check (true);

-- ตรวจสอบผลลัพธ์
select 'teachers table OK'    as result where exists (select from information_schema.tables where table_name = 'teachers');
select 'evaluations table OK' as result where exists (select from information_schema.tables where table_name = 'evaluations');
