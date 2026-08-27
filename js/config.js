/* =========================================================================
 * config.js — ค่าคงที่ของหน่วยงาน ตำแหน่ง และเกณฑ์ระดับผลการประเมิน
 * ทุกไฟล์โหลดแบบ classic script (ไม่ใช่ ES module) เพื่อให้เปิดจาก file:// ได้
 * ========================================================================= */

/* ที่อยู่ Google Apps Script Web App ที่ระบบใช้เป็นฐานข้อมูล
 *
 * ฝังไว้ตรงนี้เพื่อให้ทุกเครื่องเปิดเว็บแล้วใช้งานได้ทันที ไม่ต้องตั้งค่าเอง
 * ผู้ดูแลระบบเปลี่ยนได้ที่หน้า "ตั้งค่าระบบ" (ค่าที่ตั้งเองจะทับค่านี้เฉพาะเครื่องนั้น)
 *
 * หมายเหตุด้านความปลอดภัย: ค่านี้อยู่ในไฟล์ที่เปิดดูได้จากเบราว์เซอร์
 * ผู้ที่ได้ลิงก์เว็บไปจึงเข้าถึงข้อมูลในสเปรดชีตได้ — เหมาะกับการใช้ภายในหน่วยงาน
 * ถ้าต้องเปลี่ยนเพราะ URL รั่ว ให้ Deploy Web app ใหม่แล้วแก้ค่าตรงนี้ */
var DEFAULT_GS_URL = 'https://script.google.com/macros/s/AKfycbwDWdE1pSoJEyRjAztnjWG5zqhan3U5IHsIPGofUUewM0Yt9PPh3OUqd7Yyb8uK0s6f/exec';
var DEFAULT_GS_KEY = '';

/* เวอร์ชันของหน้าเว็บ — แสดงมุมล่างของหน้าเข้าระบบ
 * ใช้ยืนยันว่าเบราว์เซอร์โหลดไฟล์ตัวใหม่แล้วจริง ไม่ได้ติดแคชตัวเก่า
 *
 * เมื่ออัปเดตระบบ ต้องแก้ 2 ที่ให้ตรงกัน
 *   1) ค่านี้
 *   2) ไฟล์ version.json ที่รากโปรเจกต์
 * ระบบจะเทียบสองค่านี้ แล้วบังคับให้เบราว์เซอร์โหลดใหม่เองถ้าไม่ตรงกัน */
var APP_VERSION = '2026-08-27 ข';

var ORG = {
  name: 'ศูนย์การศึกษาพิเศษ ประจำจังหวัดปทุมธานี',
  affiliation: 'สำนักบริหารงานการศึกษาพิเศษ',
  province: 'ปทุมธานี',
  directorName: 'นางสาวภัทรภร หมื่นมะเริง',
  directorTitle: 'ผู้อำนวยการศูนย์การศึกษาพิเศษ ประจำจังหวัดปทุมธานี',
  logo: 'logo.png'
};

/* ตำแหน่งทั้งหมดในระบบ → ผูกกับ "แบบประเมิน" ที่ใช้ได้ (formKeys)
 * ตำแหน่งครูบางระดับใช้ได้ 2 แบบ (PA และเลื่อนเงินเดือน) จึงเก็บเป็น array */
var POSITIONS = [
  {
    key: 'teacher_assistant',
    label: 'ครูผู้ช่วย',
    group: 'ข้าราชการครู',
    formKeys: ['salary_assistant']
  },
  {
    key: 'teacher_no_rank',
    label: 'ครู (ยังไม่มีวิทยฐานะ)',
    group: 'ข้าราชการครู',
    formKeys: ['pa2_no_rank', 'salary_teacher_no_rank']
  },
  {
    key: 'teacher_senior',
    label: 'ครู วิทยฐานะครูชำนาญการ',
    group: 'ข้าราชการครู',
    formKeys: ['pa2_senior', 'salary_teacher_senior']
  },
  {
    key: 'gov_employee',
    label: 'พนักงานราชการ',
    group: 'พนักงานราชการ',
    formKeys: ['gov_employee']
  },
  {
    key: 'contract_teacher',
    label: 'ครูอัตราจ้าง',
    group: 'ผู้ปฏิบัติงานให้ราชการ',
    formKeys: ['contract_teacher']
  },
  {
    key: 'admin_officer',
    label: 'ครูธุรการ',
    group: 'ผู้ปฏิบัติงานให้ราชการ',
    formKeys: ['admin_officer']
  },
  {
    key: 'service_contract',
    label: 'จ้างเหมาบริการ (พี่เลี้ยงเด็กพิการ/คนงาน/คนครัว/ภารโรง/ยาม)',
    group: 'ผู้ปฏิบัติงานให้ราชการ',
    formKeys: ['service_contract']
  }
];

function getPosition(key) {
  for (var i = 0; i < POSITIONS.length; i++) {
    if (POSITIONS[i].key === key) return POSITIONS[i];
  }
  return null;
}

/* ---------------------------------------------------------------------------
 * เกณฑ์ระดับผลการประเมิน (แต่ละแบบฟอร์มอ้างชุดใดชุดหนึ่ง)
 * min คือค่าร้อยละต่ำสุดของระดับนั้น เรียงจากสูงไปต่ำ
 * ------------------------------------------------------------------------- */
var GRADE_SCALES = {
  /* ก.ค.ศ. 5 ระดับ — ใช้กับแบบเลื่อนเงินเดือนของข้าราชการครู
   * หมายเหตุ: ต้นฉบับ .docx ที่ได้รับมาพิมพ์ช่วงคะแนนคลาดเคลื่อน (ช่วงทับซ้อน/ขาดหาย)
   * จึงใช้ช่วงมาตรฐานของ ก.ค.ศ. และเปิดให้แก้ได้ในหน้าตั้งค่า */
  kcs: {
    label: 'เกณฑ์ ก.ค.ศ. (เลื่อนเงินเดือน)',
    levels: [
      { min: 90, label: 'ดีเด่น' },
      { min: 80, label: 'ดีมาก' },
      { min: 70, label: 'ดี' },
      { min: 60, label: 'พอใช้' },
      { min: 0, label: 'ต้องปรับปรุง' }
    ]
  },
  /* แบบประเมินผลการปฏิบัติงาน ครูอัตราจ้าง / ครูธุรการ */
  contract: {
    label: 'เกณฑ์ครูอัตราจ้าง / ครูธุรการ',
    levels: [
      { min: 85, label: 'ดีเด่น' },
      { min: 80, label: 'ดีมาก' },
      { min: 75, label: 'ดี' },
      { min: 70, label: 'พอใช้' },
      { min: 0, label: 'ปรับปรุง' }
    ]
  },
  /* แบบประเมินจ้างเหมาบริการ (พี่เลี้ยงเด็กพิการ/ภารโรง ฯลฯ) */
  service: {
    label: 'เกณฑ์จ้างเหมาบริการ',
    levels: [
      { min: 90, label: 'ดีเด่น' },
      { min: 80, label: 'ดีมาก' },
      { min: 70, label: 'ดี' },
      { min: 61, label: 'พอใช้' },
      { min: 0, label: 'ปรับปรุง' }
    ]
  },
  /* แบบประเมินพนักงานราชการ */
  gov: {
    label: 'เกณฑ์พนักงานราชการ',
    levels: [
      { min: 95, label: 'ดีเด่น' },
      { min: 85, label: 'ดีมาก' },
      { min: 75, label: 'ดี' },
      { min: 65, label: 'พอใช้' },
      { min: 0, label: 'ต้องปรับปรุง' }
    ]
  },
  /* PA2/ส — เกณฑ์ผ่าน ไม่ใช่ระดับคุณภาพ 5 ขั้น */
  pa: {
    label: 'เกณฑ์ PA (ผ่าน/ไม่ผ่าน)',
    levels: [
      { min: 70, label: 'ผ่านเกณฑ์การประเมิน' },
      { min: 0, label: 'ไม่ผ่านเกณฑ์การประเมิน' }
    ]
  }
};

function gradeOf(scaleKey, percent) {
  var scale = GRADE_SCALES[scaleKey] || GRADE_SCALES.kcs;
  for (var i = 0; i < scale.levels.length; i++) {
    if (percent >= scale.levels[i].min) return scale.levels[i].label;
  }
  return scale.levels[scale.levels.length - 1].label;
}

/* รอบการประเมิน — ครั้งที่ 1 (1 ต.ค. ปีก่อน – 31 มี.ค.) / ครั้งที่ 2 (1 เม.ย. – 30 ก.ย.) */
var ROUNDS = [
  { key: 'r1', label: 'ครั้งที่ 1', startMonth: 10, startDay: 1, endMonth: 3, endDay: 31, startYearOffset: -1 },
  { key: 'r2', label: 'ครั้งที่ 2', startMonth: 4, startDay: 1, endMonth: 9, endDay: 30, startYearOffset: 0 }
];

var THAI_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];

/* คืนช่วงวันที่ของรอบประเมินเป็นข้อความไทย เช่น
 * { startText: '1 ตุลาคม 2568', endText: '31 มีนาคม 2569' } */
function roundRange(roundKey, budgetYearBE) {
  var r = ROUNDS[0];
  for (var i = 0; i < ROUNDS.length; i++) if (ROUNDS[i].key === roundKey) r = ROUNDS[i];
  var y = parseInt(budgetYearBE, 10) || 2568;
  var startYear = y + r.startYearOffset;
  var endYear = r.key === 'r1' ? startYear + 1 : startYear;
  return {
    label: r.label,
    startText: r.startDay + ' ' + THAI_MONTHS[r.startMonth - 1] + ' ' + startYear,
    endText: r.endDay + ' ' + THAI_MONTHS[r.endMonth - 1] + ' ' + endYear,
    startParts: { day: r.startDay, month: THAI_MONTHS[r.startMonth - 1], year: startYear },
    endParts: { day: r.endDay, month: THAI_MONTHS[r.endMonth - 1], year: endYear }
  };
}
