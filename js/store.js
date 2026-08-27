/* =========================================================================
 * store.js — ชั้นเก็บข้อมูล
 *   - ทำงานกับสำเนาในเครื่อง (localStorage) เสมอ จึงใช้งานต่อได้แม้เน็ตหลุด
 *   - ถ้าตั้งค่า Google Apps Script Web App ไว้ จะดึงข้อมูลจาก Google Sheets
 *     ตอนเปิดระบบ และส่งขึ้นทุกครั้งที่บันทึก
 *   - ไฟล์แนบ: ถ้าเชื่อม Google แล้วจะอัปขึ้น Google Drive, ถ้าไม่ก็เก็บใน IndexedDB
 * ========================================================================= */

var Store = (function () {
  var LS_KEY = 'pa_eval_db_v1';
  var SESSION_KEY = 'pa_eval_session_v1';

  var TABLES = ['people', 'evaluators', 'assignments', 'evaluations', 'leaveRecords', 'attachments'];

  var db = {
    settings: {
      orgName: ORG.name,
      affiliation: ORG.affiliation,
      directorName: ORG.directorName,
      directorTitle: ORG.directorTitle,
      budgetYear: '2568',
      adminUser: 'admin',
      adminPass: 'admin1234',
      gsUrl: DEFAULT_GS_URL,
      gsKey: DEFAULT_GS_KEY
    },
    people: [],
    evaluators: [],
    assignments: [],
    evaluations: [],
    leaveRecords: [],
    attachments: []
  };

  var syncState = { mode: 'local', message: 'เก็บข้อมูลในเครื่องนี้', error: null, pending: 0 };
  var listeners = [];

  /* ---------- utilities ---------- */

  function uid(prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function nowISO() { return new Date().toISOString(); }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function notify() {
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](); } catch (e) { console.error(e); }
    }
  }

  function onChange(fn) { listeners.push(fn); }

  /* ---------- สำเนาในเครื่อง ---------- */

  function loadLocal() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (!raw) return false;
      var parsed = JSON.parse(raw);
      db.settings = Object.assign({}, db.settings, parsed.settings || {});
      /* เครื่องที่เคยบันทึกค่าว่างไว้ ให้กลับไปใช้ค่าที่ฝังมากับระบบ
         จะได้ไม่ต้องมานั่งกรอก URL ใหม่ */
      if (!db.settings.gsUrl) db.settings.gsUrl = DEFAULT_GS_URL;
      for (var i = 0; i < TABLES.length; i++) db[TABLES[i]] = parsed[TABLES[i]] || [];
      return true;
    } catch (e) {
      console.error('โหลดข้อมูลในเครื่องไม่สำเร็จ', e);
      return false;
    }
  }

  function saveLocal() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(db));
      return true;
    } catch (e) {
      console.error('บันทึกลงเครื่องไม่สำเร็จ', e);
      syncState.error = 'พื้นที่จัดเก็บในเบราว์เซอร์เต็ม';
      return false;
    }
  }

  /* =======================================================================
   * Google Sheets ผ่าน Apps Script Web App
   *
   * ส่งเป็น POST ที่ Content-Type: text/plain เพื่อให้เป็น "simple request"
   * เบราว์เซอร์จะได้ไม่ยิง preflight (OPTIONS) ซึ่ง Apps Script ตอบไม่ได้
   * ===================================================================== */

  function gsConfigured() { return !!db.settings.gsUrl; }

  var queue = Promise.resolve();   /* ส่งทีละคำขอ กันเขียนชนกัน */

  function gsCall(action, payload) {
    if (!gsConfigured()) return Promise.reject(new Error('ยังไม่ได้ตั้งค่าที่อยู่ Web App'));
    var body = Object.assign({ action: action, key: db.settings.gsKey || '' }, payload || {});
    syncState.pending++;
    notify();
    return fetch(db.settings.gsUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
      redirect: 'follow'
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    }).then(function (text) {
      var j;
      try {
        j = JSON.parse(text);
      } catch (e) {
        /* มักเกิดจากยังไม่ได้ตั้ง Who has access = Anyone แล้วโดนเด้งไปหน้า login */
        throw new Error('เซิร์ฟเวอร์ไม่ได้ตอบเป็น JSON — ตรวจว่า Deploy แบบ "Anyone" แล้วหรือยัง');
      }
      if (!j.ok) throw new Error(j.error || 'เกิดข้อผิดพลาดที่เซิร์ฟเวอร์');
      return j;
    })['finally'](function () {
      syncState.pending--;
      notify();
    });
  }

  /* ต่อคิวคำขอเขียน แล้วกลืน error ไว้ (สำเนาในเครื่องบันทึกไปแล้ว) */
  function gsQueue(action, payload) {
    if (!gsConfigured()) return;
    queue = queue.then(function () {
      return gsCall(action, payload).then(function () {
        syncState.error = null;
      })['catch'](function (e) {
        syncState.error = e.message;
        syncState.message = 'บันทึกขึ้น Google Sheets ไม่สำเร็จ';
        notify();
      });
    });
  }

  function gsPull() {
    if (!gsConfigured()) return Promise.resolve(false);
    return gsCall('pull').then(function (res) {
      var data = res.data || {};
      for (var i = 0; i < TABLES.length; i++) {
        var t = TABLES[i];
        db[t] = mergeByUpdatedAt(db[t], data[t] || []);
      }
      if (data.settings) {
        var s = Object.assign({}, data.settings);
        /* ที่อยู่ Web App และรหัสลับเป็นค่าเฉพาะเครื่อง ไม่ดึงกลับมาทับ */
        delete s.gsUrl;
        delete s.gsKey;
        db.settings = Object.assign({}, db.settings, s);
      }
      saveLocal();
      syncState.mode = 'cloud';
      syncState.message = 'เชื่อมกับ Google Sheets แล้ว';
      syncState.error = null;
      notify();
      return true;
    })['catch'](function (e) {
      syncState.mode = 'local';
      syncState.error = e.message;
      syncState.message = 'เชื่อมต่อ Google ไม่สำเร็จ — ใช้ข้อมูลในเครื่อง';
      notify();
      return false;
    });
  }

  function mergeByUpdatedAt(localRows, remoteRows) {
    var map = {}, i;
    for (i = 0; i < localRows.length; i++) map[localRows[i].id] = localRows[i];
    for (i = 0; i < remoteRows.length; i++) {
      var r = remoteRows[i];
      if (!r || !r.id) continue;
      var l = map[r.id];
      if (!l) { map[r.id] = r; continue; }
      var lt = Date.parse(l.updatedAt || 0) || 0;
      var rt = Date.parse(r.updatedAt || 0) || 0;
      map[r.id] = rt >= lt ? r : l;
    }
    return Object.keys(map).map(function (k) { return map[k]; });
  }

  /* ส่งข้อมูลทั้งหมดในเครื่องขึ้น Google Sheets (ใช้ตอนเชื่อมต่อครั้งแรก) */
  function gsPushAll() {
    if (!gsConfigured()) return Promise.resolve(false);
    var chain = gsCall('setup');
    TABLES.forEach(function (t) {
      chain = chain.then(function () {
        if (!db[t].length) return null;
        return gsCall('upsertMany', { table: t, rows: db[t] });
      });
    });
    return chain.then(function () {
      return gsCall('saveSettings', { settings: exportableSettings() });
    }).then(function () {
      syncState.error = null;
      return true;
    })['catch'](function (e) {
      syncState.error = e.message;
      return false;
    });
  }

  function exportableSettings() {
    var s = clone(db.settings);
    delete s.gsUrl;
    delete s.gsKey;
    return s;
  }

  /* ---------- IndexedDB (สำรองไว้ตอนยังไม่เชื่อม Google) ---------- */

  var idb = null;

  function openIDB() {
    return new Promise(function (resolve) {
      if (!window.indexedDB) return resolve(null);
      /* บางเบราว์เซอร์ (โหมดส่วนตัว / มีแท็บเก่าค้าง) จะ "blocked" แล้วไม่ยิง event ใด ๆ
         ต้องมีเวลาจำกัด ไม่งั้นระบบค้างที่หน้าขาว */
      var done = false;
      var finish = function (v) { if (!done) { done = true; resolve(v); } };
      setTimeout(function () { finish(null); }, 4000);
      try {
        var req = indexedDB.open('pa_eval_files', 1);
        req.onupgradeneeded = function (e) {
          var d = e.target.result;
          if (!d.objectStoreNames.contains('files')) d.createObjectStore('files');
        };
        req.onsuccess = function (e) { idb = e.target.result; finish(idb); };
        req.onerror = function () { finish(null); };
        req.onblocked = function () { finish(null); };
      } catch (e) {
        finish(null);
      }
    });
  }

  function saveFileBlob(id, blob) {
    return new Promise(function (resolve, reject) {
      if (!idb) return reject(new Error('เบราว์เซอร์นี้เก็บไฟล์ไม่ได้ — กรุณาเชื่อมต่อ Google Drive หรือแนบเป็นลิงก์'));
      var tx = idb.transaction('files', 'readwrite');
      tx.objectStore('files').put(blob, id);
      tx.oncomplete = function () { resolve(true); };
      tx.onerror = function () { reject(tx.error); };
    });
  }

  function readFileBlob(id) {
    return new Promise(function (resolve) {
      if (!idb) return resolve(null);
      var tx = idb.transaction('files', 'readonly');
      var req = tx.objectStore('files').get(id);
      req.onsuccess = function () { resolve(req.result || null); };
      req.onerror = function () { resolve(null); };
    });
  }

  function deleteFileBlob(id) {
    return new Promise(function (resolve) {
      if (!idb) return resolve(false);
      var tx = idb.transaction('files', 'readwrite');
      tx.objectStore('files')['delete'](id);
      tx.oncomplete = function () { resolve(true); };
      tx.onerror = function () { resolve(false); };
    });
  }

  /* ---------- อัปโหลดไฟล์ ---------- */

  function fileToBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var s = String(reader.result);
        resolve(s.slice(s.indexOf(',') + 1));
      };
      reader.onerror = function () { reject(new Error('อ่านไฟล์ไม่สำเร็จ')); };
      reader.readAsDataURL(file);
    });
  }

  /* คืน record ของไฟล์แนบ (ยังไม่บันทึกลงตาราง) */
  function uploadAttachment(file, meta) {
    var id = uid('att');
    if (gsConfigured()) {
      return fileToBase64(file).then(function (b64) {
        return gsCall('uploadFile', {
          name: file.name, mime: file.type, dataBase64: b64,
          personName: meta.personName || '', kind: meta.kind || ''
        });
      }).then(function (res) {
        return {
          id: id, personId: meta.personId, personName: meta.personName || '',
          kind: meta.kind, name: res.name || file.name, link: res.link,
          driveId: res.driveId, size: res.size || file.size, mime: file.type,
          uploadedAt: nowISO()
        };
      });
    }
    return saveFileBlob(id, file).then(function () {
      return {
        id: id, personId: meta.personId, personName: meta.personName || '',
        kind: meta.kind, name: file.name, link: '', driveId: '',
        size: file.size, mime: file.type, uploadedAt: nowISO()
      };
    });
  }

  function removeAttachment(rec) {
    if (!rec) return;
    if (rec.driveId && gsConfigured()) gsQueue('deleteFile', { driveId: rec.driveId });
    else deleteFileBlob(rec.id);
    remove('attachments', rec.id);
  }

  /* ---------- CRUD ---------- */

  function all(table) { return db[table] || []; }

  function byId(table, id) {
    var rows = all(table);
    for (var i = 0; i < rows.length; i++) if (rows[i].id === id) return rows[i];
    return null;
  }

  function where(table, pred) { return all(table).filter(pred); }

  function upsert(table, record) {
    if (!record.id) record.id = uid(table.slice(0, 3));
    record.updatedAt = nowISO();
    var rows = db[table];
    var found = false;
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].id === record.id) { rows[i] = record; found = true; break; }
    }
    if (!found) rows.push(record);
    saveLocal();
    gsQueue('upsert', { table: table, row: record });
    notify();
    return record;
  }

  function remove(table, id) {
    db[table] = db[table].filter(function (r) { return r.id !== id; });
    saveLocal();
    gsQueue('remove', { table: table, id: id });
    notify();
  }

  function getSettings() { return db.settings; }

  function saveSettings(patch) {
    db.settings = Object.assign({}, db.settings, patch);
    saveLocal();
    if (patch.gsUrl === undefined && patch.gsKey === undefined) {
      gsQueue('saveSettings', { settings: exportableSettings() });
    }
    notify();
    return db.settings;
  }

  /* ---------- บัญชีผู้ใช้ ---------- */

  function simpleHash(str) {
    /* ไม่ใช่การเข้ารหัสเชิงความปลอดภัย — เพียงเพื่อไม่เก็บรหัสผ่านเป็นข้อความล้วน */
    var h = 5381;
    for (var i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
    return 'h' + h.toString(36) + '_' + str.length;
  }

  function setPassword(record, plain) {
    record.passHash = simpleHash(plain || '');
    return record;
  }

  function checkPassword(record, plain) {
    if (!record) return false;
    if (record.passHash) return String(record.passHash) === simpleHash(String(plain || ''));
    return String(record.password) === String(plain);
  }

  function login(role, username, password) {
    var u = (username || '').trim().toLowerCase();
    if (role === 'admin') {
      /* ค่าที่กลับมาจาก Google Sheets อาจเป็นตัวเลขถ้ารหัสผ่านเป็นตัวเลขล้วน
         จึงต้องแปลงเป็นข้อความก่อนเทียบเสมอ */
      if (u === String(db.settings.adminUser || '').toLowerCase() &&
          String(password) === String(db.settings.adminPass)) {
        return { role: 'admin', id: 'admin', name: 'ผู้ดูแลระบบ', title: db.settings.directorTitle };
      }
      return null;
    }
    if (role === 'evaluator') {
      var evs = all('evaluators');
      for (var i = 0; i < evs.length; i++) {
        if ((evs[i].username || '').toLowerCase() === u && checkPassword(evs[i], password)) {
          return { role: 'evaluator', id: evs[i].id, name: evs[i].name, title: evs[i].title };
        }
      }
      return null;
    }
    if (role === 'evaluatee') {
      var ps = all('people');
      for (var j = 0; j < ps.length; j++) {
        if ((ps[j].username || '').toLowerCase() === u && checkPassword(ps[j], password)) {
          return { role: 'evaluatee', id: ps[j].id, name: personFullName(ps[j]), title: positionLabel(ps[j]) };
        }
      }
      return null;
    }
    return null;
  }

  /* เข้าสู่ระบบด้วยการเลือกชื่อจากรายการ แล้วใส่เฉพาะรหัสผ่าน */
  function loginById(role, id, password) {
    if (role === 'evaluator') {
      var e = byId('evaluators', id);
      if (e && checkPassword(e, password)) {
        return { role: 'evaluator', id: e.id, name: e.name, title: e.title };
      }
      return null;
    }
    if (role === 'evaluatee') {
      var p = byId('people', id);
      if (p && checkPassword(p, password)) {
        return { role: 'evaluatee', id: p.id, name: personFullName(p), title: positionLabel(p) };
      }
      return null;
    }
    return null;
  }

  function saveSession(s) { try { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch (e) {} }
  function getSession() { try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch (e) { return null; } }
  function clearSession() { try { localStorage.removeItem(SESSION_KEY); } catch (e) {} }

  /* ---------- ตัวช่วยเกี่ยวกับบุคคล ---------- */

  function personFullName(p) {
    if (!p) return '';
    return ((p.prefix || '') + (p.firstName || '') + ' ' + (p.lastName || '')).trim();
  }

  function positionLabel(p) {
    if (!p) return '';
    var pos = getPosition(p.positionKey);
    return p.positionTitle || (pos ? pos.label : '');
  }

  /* ---------- เริ่มต้น ---------- */

  function init() {
    loadLocal();
    /* ทุกขั้นตอนต้องจบเสมอ ไม่ว่าจะสำเร็จหรือไม่ ระบบจะได้ไม่ค้างที่หน้าขาว
       ถ้าดึงข้อมูลไม่ได้ก็ใช้สำเนาในเครื่องไปก่อน */
    return openIDB()['catch'](function () { return null; })
      .then(function () {
        if (!gsConfigured()) return false;
        return Promise.race([
          gsPull(),
          new Promise(function (r) { setTimeout(function () { r('timeout'); }, 30000); })
        ]).then(function (res) {
          if (res === 'timeout') {
            syncState.mode = 'local';
            syncState.error = 'เชื่อมต่อนานเกินไป';
            syncState.message = 'เชื่อมต่อ Google ไม่สำเร็จ — ใช้ข้อมูลในเครื่อง';
          }
          return res;
        });
      })['catch'](function (e) {
        syncState.mode = 'local';
        syncState.error = e && e.message;
        syncState.message = 'เชื่อมต่อ Google ไม่สำเร็จ — ใช้ข้อมูลในเครื่อง';
        return false;
      }).then(function () { return db; });
  }

  function seedIfEmpty() {
    if (db.people.length || db.evaluators.length) return false;
    var chair = setPassword({
      id: uid('ev'), name: ORG.directorName, title: ORG.directorTitle,
      username: 'director', isChair: true
    }, 'director1234');
    upsert('evaluators', chair);
    return true;
  }

  return {
    init: init, seedIfEmpty: seedIfEmpty,
    all: all, byId: byId, where: where, upsert: upsert, remove: remove,
    getSettings: getSettings, saveSettings: saveSettings,
    login: login, loginById: loginById,
    saveSession: saveSession, getSession: getSession, clearSession: clearSession,
    setPassword: setPassword,
    personFullName: personFullName, positionLabel: positionLabel,
    uid: uid, nowISO: nowISO, clone: clone,
    onChange: onChange, notify: notify,
    syncState: function () { return syncState; },
    gsConfigured: gsConfigured, gsPull: gsPull, gsPushAll: gsPushAll, gsCall: gsCall,
    uploadAttachment: uploadAttachment, removeAttachment: removeAttachment,
    readFileBlob: readFileBlob,
    exportJSON: function () { return JSON.stringify(db, null, 2); },
    importJSON: function (text) {
      var parsed = JSON.parse(text);
      db.settings = Object.assign({}, db.settings, parsed.settings || {});
      for (var i = 0; i < TABLES.length; i++) db[TABLES[i]] = parsed[TABLES[i]] || [];
      saveLocal(); notify(); return true;
    }
  };
})();
