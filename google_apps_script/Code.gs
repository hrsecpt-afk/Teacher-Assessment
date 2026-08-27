/* =========================================================================
 * ระบบประเมินผลการปฏิบัติงาน — ฝั่งเซิร์ฟเวอร์ (Google Apps Script)
 * ใช้ Google Sheets เป็นฐานข้อมูล และ Google Drive เก็บไฟล์แนบ
 *
 * วิธีติดตั้ง — ดูขั้นตอนละเอียดในไฟล์ README.md หัวข้อ "การเก็บข้อมูล"
 *   1) เปิด https://script.google.com → New project
 *   2) วางโค้ดทั้งไฟล์นี้ทับ Code.gs เดิม → บันทึก
 *   3) Deploy → New deployment → ประเภท "Web app"
 *        Execute as        : Me
 *        Who has access    : Anyone
 *   4) คัดลอก Web app URL (ลงท้ายด้วย /exec) ไปวางในหน้า "ตั้งค่าระบบ" ของแอป
 * ========================================================================= */

/* รหัสสเปรดชีตที่ใช้เป็นฐานข้อมูล
 *
 * ปล่อยว่างไว้แบบนี้ = ให้สคริปต์สร้างสเปรดชีตใหม่ในไดรฟ์ของบัญชีที่ติดตั้งเอง
 * (รันฟังก์ชัน createNewSpreadsheet หนึ่งครั้ง) — เป็นวิธีที่ง่ายและไม่ติดปัญหาสิทธิ์
 *
 * ถ้าต้องการใช้สเปรดชีตที่มีอยู่แล้ว ให้ใส่รหัสของชีตนั้นลงไปแทน เช่น
 *   var SHEET_ID = '1hQikYmpfvJBIB-1NOZXZ31co9mcD0enPqXOdZZCcVH4';
 * โดยบัญชีที่ Deploy สคริปต์ต้องมีสิทธิ์ "ผู้แก้ไข" ในชีตนั้น
 */
var SHEET_ID = '';

/* ชื่อสเปรดชีตที่จะสร้างใหม่ (ใช้เมื่อ SHEET_ID ว่าง) */
var NEW_SHEET_NAME = 'ฐานข้อมูลระบบประเมินผลการปฏิบัติงาน';

/* รหัสชีตที่ใช้จริง — ถ้าค่าคงที่ด้านบนว่าง จะไปอ่านจาก Script Property ชื่อ SHEET_ID
 * (createNewSpreadsheet เป็นตัวเขียนค่านั้นให้) */
function sheetId_() {
  var fixed = (SHEET_ID || '').trim();
  if (fixed) return fixed;
  var fromProp = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (fromProp) return fromProp;
  throw new Error('ยังไม่ได้กำหนดสเปรดชีต — กรุณารันฟังก์ชัน createNewSpreadsheet หนึ่งครั้ง ' +
    'หรือใส่รหัสชีตในตัวแปร SHEET_ID ที่บรรทัดบนสุดของไฟล์');
}

/* เหมือน sheetId_ แต่ไม่โยน error — ใช้ตอบคำสั่ง ping เพื่อให้เห็นสถานะได้เสมอ */
function sheetIdSafe_() {
  try { return sheetId_(); } catch (e) { return ''; }
}

/* ชื่อโฟลเดอร์ใน Google Drive สำหรับเก็บไฟล์แนบ (สร้างอัตโนมัติครั้งแรก) */
var DRIVE_FOLDER_NAME = 'ไฟล์แนบระบบประเมินผลการปฏิบัติงาน';

/* หมายเลขเวอร์ชันของโค้ดนี้ — เปิด Web app URL ในเบราว์เซอร์แล้วดูค่า "version"
 * เพื่อยืนยันว่า Deploy เวอร์ชันใหม่มีผลแล้วจริง (ต้องเพิ่มเลขทุกครั้งที่แก้โค้ด) */
var CODE_VERSION = 3;

/* รหัสลับสำหรับเรียก API — ตั้งค่าที่ Project Settings → Script Properties
 * ใส่ property ชื่อ API_KEY แล้วกรอกค่าเดียวกันในหน้าตั้งค่าระบบของแอป
 * ถ้าไม่ตั้ง ระบบจะไม่ตรวจสอบ (ใครมี URL ก็เข้าถึงข้อมูลได้) */
function apiKey_() {
  return PropertiesService.getScriptProperties().getProperty('API_KEY') || '';
}

/* =========================================================================
 * โครงสร้างชีต — แต่ละตารางเป็น 1 ชีต มีหัวคอลัมน์อ่านง่ายใน Google Sheets
 * ค่าที่เป็นโครงสร้างซับซ้อน (คะแนนรายข้อ, สถานที่ปฏิบัติงาน) เก็บเป็น JSON
 * ========================================================================= */

var SPECS = {

  people: {
    cols: ['id', 'prefix', 'firstName', 'lastName', 'positionKey', 'positionTitle',
      'salary', 'salaryRank', 'workGroup', 'teachLevel', 'subject', 'teachHours',
      'contractStart', 'contractEnd', 'duties', 'workplaces', 'username', 'passHash', 'updatedAt'],
    textCols: ['contractStart', 'contractEnd', 'salaryRank', 'passHash', 'username'],
    enc: function (r) { var o = pick_(r, this.cols); o.workplaces = json_(r.workplaces); return o; },
    dec: function (o) { var r = pick_(o, this.cols); r.workplaces = unjson_(o.workplaces, {}); return r; }
  },

  evaluators: {
    cols: ['id', 'name', 'title', 'username', 'passHash', 'isChair', 'updatedAt'],
    textCols: ['passHash', 'username'],
    enc: function (r) { return pick_(r, this.cols); },
    dec: function (o) { var r = pick_(o, this.cols); r.isChair = truthy_(o.isChair); return r; }
  },

  assignments: {
    cols: ['id', 'personId', 'personName', 'formKey', 'formName', 'year', 'round',
      'evaluatorIds', 'updatedAt'],
    enc: function (r) {
      var o = pick_(r, this.cols);
      o.evaluatorIds = (r.evaluatorIds || []).join(', ');
      return o;
    },
    dec: function (o) {
      var r = pick_(o, this.cols);
      r.evaluatorIds = String(o.evaluatorIds || '').split(',')
        .map(function (s) { return s.trim(); }).filter(function (s) { return s; });
      r.year = Number(o.year) || 0;
      return r;
    }
  },

  evaluations: {
    cols: ['id', 'assignmentId', 'personName', 'evaluatorId', 'evaluatorName',
      'submitted', 'submittedAt', 'total', 'percent', 'grade',
      'workloadPass', 'contractDecision', 'strength', 'improve', 'comment',
      'scores', 'updatedAt'],
    textCols: ['submittedAt'],
    enc: function (r) {
      var o = pick_(r, this.cols);
      var n = r.notes || {};
      o.strength = n.strength || '';
      o.improve = n.improve || '';
      o.comment = n.comment || '';
      o.scores = json_(r.scores);
      return o;
    },
    dec: function (o) {
      var r = pick_(o, this.cols);
      r.notes = { strength: o.strength || '', improve: o.improve || '', comment: o.comment || '' };
      delete r.strength; delete r.improve; delete r.comment;
      r.scores = unjson_(o.scores, {});
      r.submitted = truthy_(o.submitted);
      r.workloadPass = o.workloadPass === '' || o.workloadPass === undefined ? true : truthy_(o.workloadPass);
      return r;
    }
  },

  /* สถิติวันลาแตกเป็นคอลัมน์จริง เพื่อให้นำไปทำรายงานใน Sheets ได้ */
  leaveRecords: {
    cols: (function () {
      var c = ['id', 'personId', 'year'];
      ['r1', 'r2'].forEach(function (r) {
        ['late', 'personal', 'sick', 'maternity', 'other'].forEach(function (k) {
          c.push(r + '_' + k + '_times');
          c.push(r + '_' + k + '_days');
        });
      });
      c.push('updatedAt');
      return c;
    })(),
    enc: function (r) {
      var o = { id: r.id, personId: r.personId, year: r.year, updatedAt: r.updatedAt };
      ['r1', 'r2'].forEach(function (rd) {
        var seg = r[rd] || {};
        ['late', 'personal', 'sick', 'maternity', 'other'].forEach(function (k) {
          var v = seg[k] || {};
          o[rd + '_' + k + '_times'] = v.times === undefined ? '' : v.times;
          o[rd + '_' + k + '_days'] = v.days === undefined ? '' : v.days;
        });
      });
      return o;
    },
    dec: function (o) {
      var r = { id: o.id, personId: o.personId, year: Number(o.year) || 0, updatedAt: o.updatedAt, r1: {}, r2: {} };
      ['r1', 'r2'].forEach(function (rd) {
        ['late', 'personal', 'sick', 'maternity', 'other'].forEach(function (k) {
          var t = o[rd + '_' + k + '_times'], d = o[rd + '_' + k + '_days'];
          if (t !== '' && t !== undefined || d !== '' && d !== undefined) {
            r[rd][k] = { times: t === '' ? '' : Number(t), days: d === '' ? '' : Number(d) };
          }
        });
      });
      return r;
    }
  },

  attachments: {
    cols: ['id', 'personId', 'personName', 'kind', 'name', 'link', 'driveId',
      'size', 'mime', 'uploadedAt', 'updatedAt'],
    textCols: ['uploadedAt', 'link', 'driveId'],
    enc: function (r) { return pick_(r, this.cols); },
    dec: function (o) { return pick_(o, this.cols); }
  }
};

var TABLE_NAMES = ['people', 'evaluators', 'assignments', 'evaluations', 'leaveRecords', 'attachments'];
var SETTINGS_SHEET = 'settings';

/* =========================================================================
 * ทางเข้า HTTP
 * ========================================================================= */

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || 'ping';
  if (action === 'ping') return ok_({ version: CODE_VERSION, sheet: sheetIdSafe_(), secured: !!apiKey_() });
  return handle_({ action: action, key: (e.parameter || {}).key });
}

function doPost(e) {
  var req;
  try {
    req = JSON.parse(e.postData.contents);
  } catch (err) {
    return err_('รูปแบบคำขอไม่ถูกต้อง');
  }
  return handle_(req);
}

function handle_(req) {
  try {
    var required = apiKey_();
    if (required && req.key !== required) return err_('รหัสลับ (API key) ไม่ถูกต้อง');

    switch (req.action) {
      case 'ping': return ok_({ version: CODE_VERSION, sheet: sheetIdSafe_(), secured: !!required });
      case 'setup': return ok_({ created: setupSheets_() });
      case 'pull': return ok_({ data: pullAll_() });
      case 'upsert': return ok_({ id: upsertRow_(req.table, req.row) });
      case 'upsertMany': return ok_({ count: upsertMany_(req.table, req.rows) });
      case 'remove': removeRow_(req.table, req.id); return ok_({});
      case 'saveSettings': saveSettings_(req.settings); return ok_({});
      case 'uploadFile': return ok_(uploadFile_(req));
      case 'deleteFile': return ok_(deleteFile_(req.driveId));
      default: return err_('ไม่รู้จักคำสั่ง: ' + req.action);
    }
  } catch (ex) {
    return err_(ex.message + (ex.stack ? ' | ' + String(ex.stack).split('\n')[1] : ''));
  }
}

function ok_(payload) {
  return jsonOut_(Object.assign({ ok: true }, payload || {}));
}

function err_(message) {
  return jsonOut_({ ok: false, error: message });
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* =========================================================================
 * ตัวช่วยเล็ก ๆ
 * ========================================================================= */

/* คัดเฉพาะคีย์ที่อยู่ในรายการคอลัมน์ */
function pick_(src, cols) {
  var o = {};
  for (var i = 0; i < cols.length; i++) {
    var k = cols[i];
    if (src[k] !== undefined) o[k] = src[k];
  }
  return o;
}

function json_(v) {
  if (v === undefined || v === null) return '';
  try { return JSON.stringify(v); } catch (e) { return ''; }
}

function unjson_(v, fallback) {
  if (v === undefined || v === null || v === '') return fallback;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch (e) { return fallback; }
}

function truthy_(v) {
  if (typeof v === 'boolean') return v;
  var s = String(v).trim().toLowerCase();
  return s === 'true' || s === 'yes' || s === '1' || s === 'ใช่';
}

/* =========================================================================
 * ชีต
 * ========================================================================= */

function book_() {
  var id = sheetId_();
  try {
    return SpreadsheetApp.openById(id);
  } catch (e) {
    throw new Error('เปิดสเปรดชีตไม่ได้ (' + id + ') — ตรวจว่ารหัสชีตถูกต้อง ' +
      'และบัญชี Google ที่ Deploy สคริปต์นี้มีสิทธิ์แก้ไขชีตดังกล่าว ' +
      'หากแชร์ข้ามองค์กรไม่ได้ ให้ตั้ง SHEET_ID = \'\' แล้วรัน createNewSpreadsheet');
  }
}

/* สร้างชีตและหัวคอลัมน์ที่ยังไม่มี — เรียกอัตโนมัติทุกครั้งที่เข้าถึงชีต */
function sheet_(name) {
  var ss = book_();
  var sh = ss.getSheetByName(name);
  var spec = SPECS[name];
  var cols = spec ? spec.cols : ['key', 'value'];

  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, cols.length).setValues([cols])
      .setFontWeight('bold').setBackground('#e8effa');
    sh.setFrozenRows(1);
    /* บังคับคอลัมน์ที่ต้องเป็นข้อความล้วน ไม่ให้ Sheets แปลงเป็นวันที่/ตัวเลข */
    var textCols = (spec && spec.textCols) || [];
    textCols.forEach(function (c) {
      var i = cols.indexOf(c);
      if (i >= 0) sh.getRange(2, i + 1, sh.getMaxRows() - 1, 1).setNumberFormat('@');
    });
    sh.autoResizeColumns(1, Math.min(cols.length, 12));
  }
  return sh;
}

function setupSheets_() {
  var created = [];
  TABLE_NAMES.concat([SETTINGS_SHEET]).forEach(function (n) {
    var before = book_().getSheetByName(n);
    sheet_(n);
    if (!before) created.push(n);
  });
  return created;
}

/* อ่านทั้งชีตเป็น array ของ object ตามหัวคอลัมน์ */
function readSheet_(name) {
  var sh = sheet_(name);
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  var head = values[0];
  var out = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    if (!row[0] && row.join('') === '') continue;
    var o = {};
    for (var c = 0; c < head.length; c++) {
      if (!head[c]) continue;
      o[head[c]] = normalize_(row[c]);
    }
    out.push(o);
  }
  return out;
}

/* ค่าจากชีตอาจเป็น Date object — แปลงกลับเป็นข้อความให้ฝั่งเว็บใช้ได้ */
function normalize_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ss'Z'");
  return v;
}

function pullAll_() {
  var data = {};
  TABLE_NAMES.forEach(function (t) {
    var spec = SPECS[t];
    data[t] = readSheet_(t).map(function (o) { return spec.dec(o); });
  });
  data.settings = readSettings_();
  return data;
}

/* หาแถวของ id (คอลัมน์แรกคือ id เสมอ) */
function findRow_(sh, id) {
  var ids = sh.getRange(1, 1, Math.max(sh.getLastRow(), 1), 1).getValues();
  for (var i = 1; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return i + 1;
  }
  return 0;
}

function upsertRow_(table, rec) {
  var spec = SPECS[table];
  if (!spec) throw new Error('ไม่รู้จักตาราง: ' + table);
  if (!rec || !rec.id) throw new Error('ข้อมูลไม่มี id');

  var sh = sheet_(table);
  var flat = spec.enc(rec);
  var values = spec.cols.map(function (c) {
    var v = flat[c];
    return (v === undefined || v === null) ? '' : v;
  });

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var row = findRow_(sh, rec.id);
    if (!row) row = sh.getLastRow() + 1;
    sh.getRange(row, 1, 1, spec.cols.length).setValues([values]);
  } finally {
    lock.releaseLock();
  }
  return rec.id;
}

function upsertMany_(table, rows) {
  (rows || []).forEach(function (r) { upsertRow_(table, r); });
  return (rows || []).length;
}

function removeRow_(table, id) {
  var sh = sheet_(table);
  var row = findRow_(sh, id);
  if (row > 1) sh.deleteRow(row);
}

/* ---------- settings (ชีต key / value) ---------- */

function readSettings_() {
  var rows = readSheet_(SETTINGS_SHEET);
  var out = {};
  rows.forEach(function (r) {
    if (!r.key) return;
    var v = r.value;
    if (v === 'TRUE' || v === true) v = true;
    else if (v === 'FALSE' || v === false) v = false;
    out[r.key] = v;
  });
  return out;
}

function saveSettings_(settings) {
  var sh = sheet_(SETTINGS_SHEET);
  var keys = Object.keys(settings || {});
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    sh.clear();
    sh.getRange(1, 1, 1, 2).setValues([['key', 'value']])
      .setFontWeight('bold').setBackground('#e8effa');
    /* คอลัมน์ value เป็นข้อความล้วน ไม่งั้นค่าอย่างรหัสผ่าน "112233"
       จะถูก Sheets แปลงเป็นตัวเลข แล้วอ่านกลับมาไม่ตรงกับที่บันทึกไว้ */
    sh.getRange(2, 2, Math.max(sh.getMaxRows() - 1, 1), 1).setNumberFormat('@');
    if (keys.length) {
      sh.getRange(2, 1, keys.length, 2).setValues(keys.map(function (k) {
        var v = settings[k];
        return [k, (v === undefined || v === null) ? '' : String(v)];
      }));
    }
    sh.setFrozenRows(1);
  } finally {
    lock.releaseLock();
  }
}

/* =========================================================================
 * ไฟล์แนบใน Google Drive
 * ========================================================================= */

function folder_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('FOLDER_ID');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) { /* โฟลเดอร์ถูกลบ — สร้างใหม่ */ }
  }
  var it = DriveApp.getFoldersByName(DRIVE_FOLDER_NAME);
  var f = it.hasNext() ? it.next() : DriveApp.createFolder(DRIVE_FOLDER_NAME);
  props.setProperty('FOLDER_ID', f.getId());
  return f;
}

function uploadFile_(req) {
  if (!req.dataBase64) throw new Error('ไม่พบข้อมูลไฟล์');
  var bytes = Utilities.base64Decode(req.dataBase64);
  var blob = Utilities.newBlob(bytes, req.mime || 'application/octet-stream', req.name || 'file');

  /* แยกโฟลเดอร์ย่อยตามชื่อผู้รับการประเมิน เพื่อให้หาไฟล์ใน Drive ง่าย */
  var parent = folder_();
  var sub = parent;
  if (req.personName) {
    var it = parent.getFoldersByName(req.personName);
    sub = it.hasNext() ? it.next() : parent.createFolder(req.personName);
  }

  var file = sub.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return {
    driveId: file.getId(),
    link: 'https://drive.google.com/file/d/' + file.getId() + '/view',
    size: file.getSize(),
    name: file.getName()
  };
}

function deleteFile_(driveId) {
  if (!driveId) return {};
  try { DriveApp.getFileById(driveId).setTrashed(true); } catch (e) { /* ไฟล์อาจถูกลบไปแล้ว */ }
  return {};
}

/* =========================================================================
 * 2 ฟังก์ชันนี้ให้เลือกจากเมนู Run แล้วกดครั้งเดียวก่อน Deploy — ตามลำดับนี้
 *
 *   ขั้น 1  createNewSpreadsheet   สร้างสเปรดชีตฐานข้อมูลในไดรฟ์ของบัญชีนี้
 *   ขั้น 2  setupFirstTime         สร้างชีตย่อยทั้งหมด + โฟลเดอร์เก็บไฟล์แนบ
 *
 * ครั้งแรกจะเจอหน้าขออนุญาตสิทธิ์
 *   "Google hasn't verified this app" → Advanced → Go to (ชื่อโปรเจกต์) (unsafe) → Allow
 *   [เป็นสคริปต์ของเราเอง เข้าถึงเฉพาะไฟล์ในบัญชีตัวเองเท่านั้น]
 *
 * ผลลัพธ์ดูได้ที่แถบ Execution log ด้านล่างจอ
 * ========================================================================= */

/* ขั้น 1 — สร้างสเปรดชีตใหม่ แล้วจำรหัสไว้ใน Script Property ชื่อ SHEET_ID
 * ถ้าตั้งค่า SHEET_ID ที่บรรทัดบนสุดไว้แล้ว ฟังก์ชันนี้จะไม่ทำอะไร */
function createNewSpreadsheet() {
  if ((SHEET_ID || '').trim()) {
    Logger.log('ยังมีค่า SHEET_ID อยู่ที่บรรทัดบนสุด — ถ้าต้องการสร้างชีตใหม่ ให้แก้เป็น SHEET_ID = \'\' ก่อน');
    return;
  }
  var props = PropertiesService.getScriptProperties();
  var existing = props.getProperty('SHEET_ID');
  if (existing) {
    Logger.log('มีสเปรดชีตอยู่แล้ว: ' + SpreadsheetApp.openById(existing).getUrl());
    return;
  }
  var ss = SpreadsheetApp.create(NEW_SHEET_NAME);
  props.setProperty('SHEET_ID', ss.getId());
  Logger.log('สร้างสเปรดชีตใหม่แล้ว');
  Logger.log('  รหัสชีต : ' + ss.getId());
  Logger.log('  ลิงก์   : ' + ss.getUrl());
  Logger.log('ต่อไปให้รัน setupFirstTime เพื่อสร้างชีตย่อยทั้งหมด');
}

/* ตรวจสถานะ — รันเมื่อไรก็ได้ เพื่อดูว่าฐานข้อมูลใช้งานได้จริงหรือไม่
 * ทดลองเขียนแถวทดสอบลงชีตแล้วอ่านกลับ จากนั้นลบทิ้ง
 * ใช้ยืนยันได้แม้เปิดสเปรดชีตในเบราว์เซอร์ไม่ได้ (เช่นล็อกอินคนละบัญชี) */
function checkStatus() {
  Logger.log('บัญชีที่รันสคริปต์นี้: ' + Session.getEffectiveUser().getEmail());
  Logger.log('รหัสสเปรดชีต: ' + sheetIdSafe_());
  var ss = book_();
  Logger.log('ชื่อสเปรดชีต: ' + ss.getName());
  Logger.log('ลิงก์: ' + ss.getUrl());

  var names = [];
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) names.push(sheets[i].getName());
  Logger.log('แท็บที่มี (' + names.length + '): ' + names.join(', '));

  /* ทดสอบเขียน–อ่าน–ลบ */
  var testId = 'TEST_' + Date.now();
  upsertRow_('people', { id: testId, firstName: 'ทดสอบ', lastName: 'ระบบ', updatedAt: new Date().toISOString() });
  var found = readSheet_('people').filter(function (r) { return r.id === testId; });
  removeRow_('people', testId);
  var after = readSheet_('people').filter(function (r) { return r.id === testId; });

  Logger.log('ทดสอบเขียนข้อมูล: ' + (found.length ? 'สำเร็จ' : 'ล้มเหลว'));
  Logger.log('ทดสอบลบข้อมูล:   ' + (after.length ? 'ล้มเหลว' : 'สำเร็จ'));
  Logger.log('โฟลเดอร์ไฟล์แนบ: ' + folder_().getUrl());
  Logger.log('รหัสลับ API: ' + (apiKey_() ? 'ตั้งไว้แล้ว' : 'ยังไม่ได้ตั้ง'));
  Logger.log(found.length && !after.length ? '>>> ฐานข้อมูลพร้อมใช้งาน <<<' : '>>> มีปัญหา ดูข้อความด้านบน <<<');
  return 'ตรวจสอบเสร็จ';
}

/* ขั้น 2 — สร้างชีตย่อยทั้ง 7 ชีตพร้อมหัวคอลัมน์ และโฟลเดอร์เก็บไฟล์แนบ */
function setupFirstTime() {
  var created = setupSheets_();
  Logger.log('สเปรดชีต: ' + book_().getUrl());
  Logger.log('สร้างชีตแล้ว: ' + (created.length ? created.join(', ') : 'มีครบอยู่แล้ว'));
  Logger.log('โฟลเดอร์ไฟล์แนบ: ' + folder_().getUrl());
  Logger.log('รหัสลับ API: ' + (apiKey_() ? 'ตั้งไว้แล้ว' : 'ยังไม่ได้ตั้ง (ใครมี URL ก็เข้าถึงข้อมูลได้)'));
  return 'เรียบร้อย';
}
