/* =========================================================================
 * app.js — ตัวระบบ: เข้าสู่ระบบ, เมนูตามบทบาท, หน้าจอทั้งหมด
 * ========================================================================= */

var App = (function () {

  var session = null;
  var route = { page: '', params: {} };
  var loginRole = 'evaluatee';
  var scoreDraft = null;   /* { assignmentId, evaluationId, scores, notes, ... } */

  /* ---------------------------------------------------------------------
   * helper
   * ------------------------------------------------------------------- */

  function $(id) { return document.getElementById(id); }

  function toast(msg, kind) {
    var t = document.createElement('div');
    t.className = 'toast' + (kind ? ' ' + kind : '');
    t.textContent = msg;
    $('toasts').appendChild(t);
    setTimeout(function () { t.remove(); }, 3200);
  }

  function modal(title, bodyHtml, footHtml) {
    var host = $('modal-host');
    host.innerHTML = '<div class="modal-back" id="modal-back">' +
      '<div class="modal"><div class="modal-head"><h2>' + esc(title) + '</h2>' +
      '<div class="spacer"></div><button class="icon-btn" onclick="App.closeModal()">×</button></div>' +
      '<div class="modal-body">' + bodyHtml + '</div>' +
      (footHtml ? '<div class="modal-foot">' + footHtml + '</div>' : '') +
      '</div></div>';
    $('modal-back').addEventListener('mousedown', function (e) {
      if (e.target.id === 'modal-back') closeModal();
    });
  }

  function closeModal() { $('modal-host').innerHTML = ''; }

  function val(id) { var e = $(id); return e ? e.value.trim() : ''; }
  function numval(id) { var v = val(id); return v === '' ? '' : Number(v); }
  function checked(id) { var e = $(id); return e ? e.checked : false; }

  function confirmDo(msg, fn) {
    modal('ยืนยัน', '<p>' + esc(msg) + '</p>',
      '<button class="btn btn-danger" id="confirm-yes">ยืนยัน</button>' +
      '<button class="btn" onclick="App.closeModal()">ยกเลิก</button>');
    $('confirm-yes').onclick = function () { closeModal(); fn(); };
  }

  function go(page, params) {
    var q = '';
    if (params) {
      var parts = [];
      for (var k in params) if (params[k] !== undefined && params[k] !== null) {
        parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(params[k]));
      }
      if (parts.length) q = '?' + parts.join('&');
    }
    location.hash = '#/' + page + q;
  }

  function parseHash() {
    var h = location.hash.replace(/^#\/?/, '');
    var qi = h.indexOf('?');
    var page = qi >= 0 ? h.slice(0, qi) : h;
    var params = {};
    if (qi >= 0) {
      h.slice(qi + 1).split('&').forEach(function (pair) {
        var kv = pair.split('=');
        params[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || '');
      });
    }
    return { page: page || '', params: params };
  }

  /* ---------------------------------------------------------------------
   * เมนูตามบทบาท
   * ------------------------------------------------------------------- */

  var NAV = {
    admin: [
      { group: 'ภาพรวม' },
      { page: 'dashboard', label: 'แดชบอร์ด', title: 'แดชบอร์ด', sub: 'ภาพรวมการประเมินทั้งหน่วยงาน' },
      { group: 'ข้อมูลหลัก' },
      { page: 'people', label: 'ผู้รับการประเมิน', title: 'ผู้รับการประเมิน', sub: 'ทะเบียนบุคลากรและบัญชีเข้าใช้งาน' },
      { page: 'evaluators', label: 'คณะกรรมการประเมิน', title: 'คณะกรรมการประเมิน', sub: 'รายชื่อกรรมการและบัญชีเข้าใช้งาน' },
      { group: 'การประเมิน' },
      { page: 'assignments', label: 'รอบการประเมิน', title: 'รอบการประเมิน', sub: 'กำหนดแบบประเมินและคณะกรรมการให้แต่ละคน' },
      { page: 'results', label: 'ผลการประเมิน', title: 'ผลการประเมิน', sub: 'สรุปผลและพิมพ์แบบฟอร์มราชการ' },
      { group: 'ระบบ' },
      { page: 'settings', label: 'ตั้งค่าระบบ', title: 'ตั้งค่าระบบ', sub: 'ข้อมูลหน่วยงาน บัญชีผู้ดูแล และการเชื่อมต่อฐานข้อมูล' }
    ],
    evaluator: [
      { group: 'งานของฉัน' },
      { page: 'tasks', label: 'รายการที่ต้องประเมิน', title: 'รายการที่ต้องประเมิน', sub: 'ผู้รับการประเมินที่อยู่ในความรับผิดชอบของท่าน' },
      { page: 'results', label: 'ผลการประเมินที่บันทึกแล้ว', title: 'ผลการประเมิน', sub: 'ผลที่ท่านประเมินไว้ พร้อมพิมพ์แบบฟอร์ม' }
    ],
    evaluatee: [
      { group: 'ข้อมูลของฉัน' },
      { page: 'profile', label: 'ข้อมูลส่วนตัวและวันลา', title: 'ข้อมูลส่วนตัวและวันลา', sub: 'กรอกข้อมูลที่จะปรากฏบนแบบประเมิน' },
      { page: 'files', label: 'อัปโหลดเล่ม / ไฟล์นำเสนอ', title: 'เอกสารประกอบการประเมิน', sub: 'แนบเล่มรายงานและไฟล์นำเสนอให้คณะกรรมการ' },
      { page: 'myresult', label: 'ผลการประเมินของฉัน', title: 'ผลการประเมินของฉัน', sub: 'ดูผลและพิมพ์แบบประเมินของตนเอง' }
    ]
  };

  function renderNav() {
    var items = NAV[session.role] || [];
    var h = '';
    for (var i = 0; i < items.length; i++) {
      if (items[i].group) { h += '<div class="nav-group-label">' + esc(items[i].group) + '</div>'; continue; }
      var active = route.page === items[i].page ? ' active' : '';
      h += '<button class="nav-item' + active + '" data-page="' + items[i].page + '">' +
        esc(items[i].label) + '</button>';
    }
    $('nav').innerHTML = h;
    var btns = $('nav').querySelectorAll('.nav-item');
    for (var j = 0; j < btns.length; j++) {
      btns[j].onclick = function () {
        go(this.getAttribute('data-page'));
        $('sidebar').classList.remove('open');
      };
    }
  }

  function navMeta(page) {
    var items = NAV[session.role] || [];
    for (var i = 0; i < items.length; i++) if (items[i].page === page) return items[i];
    return null;
  }

  function defaultPage() {
    if (session.role === 'admin') return 'dashboard';
    if (session.role === 'evaluator') return 'tasks';
    return 'profile';
  }

  /* ---------------------------------------------------------------------
   * เข้าสู่ระบบ
   * ------------------------------------------------------------------- */

  function hideBoot() {
    var b = $('boot');
    if (b) b.remove();
  }

  function showLogin() {
    hideBoot();
    $('app').style.display = 'none';
    $('login-screen').style.display = 'flex';
    $('login-org').textContent = Store.getSettings().orgName;
    renderLoginForm();
    stampVersion();
  }

  /* ป้ายมุมล่าง บอกเวอร์ชันและจำนวนข้อมูลที่โหลดมาได้
     ใช้ตรวจว่าเบราว์เซอร์ติดแคชไฟล์เก่าหรือโหลดข้อมูลไม่ได้ */
  function stampVersion() {
    var card = document.querySelector('.login-card');
    if (!card) return;
    var el = $('login-version');
    if (!el) {
      el = document.createElement('div');
      el.id = 'login-version';
      el.style.cssText = 'margin-top:14px;padding-top:12px;border-top:1px solid #e6eaf0;' +
        'font-size:11.5px;color:#8b96a8;text-align:center;line-height:1.7';
      card.appendChild(el);
    }
    var st = Store.syncState();
    el.innerHTML = 'เวอร์ชัน ' + esc(APP_VERSION) +
      ' · ข้อมูล ' + Store.all('people').length + '/' + Store.all('evaluators').length +
      '<br>' + esc(st.message) + (st.error ? ' — ' + esc(st.error) : '');
  }

  function loginVisible() {
    var el = $('login-screen');
    return el && el.style.display !== 'none';
  }

  /* สร้างช่องกรอกตามบทบาทที่เลือก
   * ผู้รับการประเมิน / กรรมการ = เลือกชื่อจากรายการ แล้วใส่เฉพาะรหัสผ่าน
   * ผู้ดูแลระบบ = ชื่อผู้ใช้ + รหัสผ่าน */
  function renderLoginForm() {
    var host = $('login-fields');
    if (!host) return;
    var s = Store.getSettings();
    var keepId = $('login-who') ? $('login-who').value : '';
    var h = '';

    if (loginRole === 'admin') {
      h += '<div class="field"><label for="login-user">ชื่อผู้ใช้</label>' +
        '<input type="text" id="login-user" autocomplete="username" required></div>';
      h += '<div class="field"><label for="login-pass">รหัสผ่าน</label>' +
        '<input type="password" id="login-pass" autocomplete="current-password" required></div>';
      host.innerHTML = h;
      $('login-hint').innerHTML = 'บัญชีผู้ดูแลเริ่มต้น: <b>' + esc(s.adminUser) + '</b> / <b>' +
        esc(s.adminPass) + '</b> — เปลี่ยนได้ในหน้าตั้งค่าระบบ';
      return;
    }

    var options = loginRole === 'evaluator' ? evaluatorOptions() : peopleOptions();

    if (!options.count) {
      var st = Store.syncState();
      host.innerHTML = '<div class="notice notice-warn" style="margin:0">' +
        '<b>ยังโหลดรายชื่อไม่ได้</b><br>' +
        '<span class="small">' + esc(st.message) +
        (st.error ? '<br>รายละเอียด: ' + esc(st.error) : '') + '</span>' +
        '<div class="btn-row" style="margin-top:10px">' +
        '<button class="btn btn-sm btn-primary" type="button" id="login-retry">ลองโหลดรายชื่ออีกครั้ง</button>' +
        '</div></div>';
      $('login-hint').innerHTML = 'ถ้ายังไม่ขึ้น ให้กดรีเฟรชหน้าเว็บด้วย Ctrl+Shift+R ' +
        'หรือแจ้งผู้ดูแลระบบให้ตรวจการเชื่อมต่อ Google Sheets';
      $('login-retry').onclick = function () {
        this.disabled = true;
        this.textContent = 'กำลังโหลด…';
        Store.gsPull().then(function () { renderLoginForm(); });
      };
      return;
    }

    h += '<div class="field"><label for="login-filter">ค้นหาชื่อ</label>' +
      '<input type="text" id="login-filter" placeholder="พิมพ์บางส่วนของชื่อหรือนามสกุล" autocomplete="off"></div>';
    h += '<div class="field"><label for="login-who">' +
      (loginRole === 'evaluator' ? 'เลือกชื่อกรรมการ' : 'เลือกชื่อของท่าน') + '</label>' +
      '<select id="login-who" size="1" required>' + options.html + '</select>' +
      '<div class="hint" id="login-count">' + options.count + ' รายชื่อ</div></div>';
    h += '<div class="field"><label for="login-pass">รหัสผ่าน</label>' +
      '<input type="password" id="login-pass" autocomplete="current-password" required></div>';
    host.innerHTML = h;

    if (keepId) $('login-who').value = keepId;

    $('login-filter').oninput = function () {
      var q = this.value.trim().toLowerCase();
      var opts = loginRole === 'evaluator' ? evaluatorOptions(q) : peopleOptions(q);
      var sel = $('login-who');
      sel.innerHTML = opts.html;
      $('login-count').textContent = opts.count + ' รายชื่อ';
      if (opts.count === 1) sel.selectedIndex = 0;
    };

    $('login-hint').innerHTML = 'หากไม่พบชื่อของท่าน หรือลืมรหัสผ่าน โปรดติดต่อผู้ดูแลระบบ';
  }

  function optionMatch(text, q) {
    return !q || text.toLowerCase().indexOf(q) >= 0;
  }

  function evaluatorOptions(q) {
    var rows = Store.all('evaluators');
    var html = '', count = 0;
    for (var i = 0; i < rows.length; i++) {
      var label = rows[i].name + (rows[i].title ? ' — ' + rows[i].title : '');
      if (!optionMatch(label, q)) continue;
      html += '<option value="' + esc(rows[i].id) + '">' + esc(label) + '</option>';
      count++;
    }
    return { html: html, count: count };
  }

  function peopleOptions(q) {
    var rows = Store.all('people');
    var html = '', count = 0;
    /* จัดกลุ่มตามตำแหน่ง เรียงตามลำดับใน POSITIONS */
    for (var i = 0; i < POSITIONS.length; i++) {
      var pos = POSITIONS[i];
      var group = rows.filter(function (p) { return p.positionKey === pos.key; });
      group.sort(function (a, b) {
        return (a.firstName || '').localeCompare(b.firstName || '', 'th');
      });
      var inner = '';
      for (var j = 0; j < group.length; j++) {
        var nm = Store.personFullName(group[j]);
        if (!optionMatch(nm, q)) continue;
        inner += '<option value="' + esc(group[j].id) + '">' + esc(nm) + '</option>';
        count++;
      }
      if (inner) html += '<optgroup label="' + esc(pos.label) + '">' + inner + '</optgroup>';
    }
    return { html: html, count: count };
  }

  function bindLogin() {
    var tabs = $('role-tabs').querySelectorAll('.role-tab');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].onclick = function () {
        for (var j = 0; j < tabs.length; j++) tabs[j].classList.remove('active');
        this.classList.add('active');
        loginRole = this.getAttribute('data-role');
        $('login-err').textContent = '';
        renderLoginForm();
      };
    }
    $('login-form').onsubmit = function (e) {
      e.preventDefault();
      var pass = $('login-pass') ? $('login-pass').value : '';
      var s;
      if (loginRole === 'admin') {
        s = Store.login('admin', val('login-user'), pass);
      } else {
        var who = $('login-who') ? $('login-who').value : '';
        if (!who) { $('login-err').textContent = 'กรุณาเลือกชื่อ'; return; }
        s = Store.loginById(loginRole, who, pass);
      }
      if (!s) {
        $('login-err').textContent = loginRole === 'admin'
          ? 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' : 'รหัสผ่านไม่ถูกต้อง';
        return;
      }
      session = s;
      Store.saveSession(s);
      if ($('login-pass')) $('login-pass').value = '';
      $('login-err').textContent = '';
      startApp();
    };
  }

  function logout() {
    Store.clearSession();
    session = null;
    location.hash = '';
    showLogin();
  }

  function startApp() {
    hideBoot();
    $('login-screen').style.display = 'none';
    $('app').style.display = 'flex';
    var s = Store.getSettings();
    $('brand-org').textContent = s.orgName;
    $('me-name').textContent = session.name;
    $('me-role').textContent = session.role === 'admin' ? 'ผู้ดูแลระบบ'
      : session.role === 'evaluator' ? 'กรรมการประเมิน' : 'ผู้รับการประเมิน';
    updateSyncBadge();
    if (!location.hash || !parseHash().page) location.hash = '#/' + defaultPage();
    render();
  }

  function updateSyncBadge() {
    var st = Store.syncState();
    var el = $('sync-state');
    if (!el) return;
    el.className = 'sync' + (st.mode === 'cloud' && !st.error ? ' cloud' : '');
    el.title = st.error || '';
    el.querySelector('.txt').textContent = st.pending > 0
      ? 'กำลังบันทึกขึ้น Google Sheets… (' + st.pending + ')'
      : (st.error ? st.message + ' ⚠' : st.message);
  }

  /* ---------------------------------------------------------------------
   * ตัวจัดเส้นทาง
   * ------------------------------------------------------------------- */

  function render() {
    if (!session) { showLogin(); return; }
    route = parseHash();
    if (!route.page) route.page = defaultPage();

    var allowed = (NAV[session.role] || []).some(function (i) { return i.page === route.page; });
    if (!allowed && route.page !== 'score' && route.page !== 'print') {
      route.page = defaultPage();
    }

    renderNav();
    var meta = navMeta(route.page);
    $('page-title').textContent = meta ? meta.title : titleFor(route.page);
    $('page-sub').textContent = meta ? meta.sub : '';
    $('page-actions').innerHTML = '';

    var host = $('page');
    host.innerHTML = '';
    var fn = PAGES[route.page];
    if (fn) fn(host, route.params);
    else host.innerHTML = '<div class="empty">ไม่พบหน้าที่ต้องการ</div>';
    window.scrollTo(0, 0);
  }

  function titleFor(page) {
    if (page === 'score') return 'บันทึกผลการประเมิน';
    if (page === 'print') return 'พิมพ์แบบประเมิน';
    return '—';
  }

  /* ---------------------------------------------------------------------
   * ข้อมูลช่วยเหลือร่วม
   * ------------------------------------------------------------------- */

  function personById(id) { return Store.byId('people', id); }
  function evaluatorById(id) { return Store.byId('evaluators', id); }

  function assignmentsFor(role) {
    var all = Store.all('assignments');
    if (role === 'evaluator') {
      return all.filter(function (a) {
        return (a.evaluatorIds || []).indexOf(session.id) >= 0;
      });
    }
    if (role === 'evaluatee') {
      return all.filter(function (a) { return a.personId === session.id; });
    }
    return all;
  }

  function evaluationOf(assignmentId, evaluatorId) {
    var rows = Store.where('evaluations', function (e) {
      return e.assignmentId === assignmentId && e.evaluatorId === evaluatorId;
    });
    return rows.length ? rows[0] : null;
  }

  function evaluationsOf(assignmentId) {
    return Store.where('evaluations', function (e) { return e.assignmentId === assignmentId; });
  }

  function leaveOf(personId, year) {
    return Store.byId('leaveRecords', 'lv_' + personId + '_' + year);
  }

  function assignmentLabel(a) {
    var f = FORMS[a.formKey];
    var r = roundRange(a.round, a.year);
    return (f ? f.shortName : a.formKey) + ' · ' + r.label + ' ปีงบ ' + a.year;
  }

  /* คำนวณผลรวมของ assignment (เฉลี่ยจากกรรมการที่ส่งแล้ว) */
  function assignmentResult(a) {
    var form = FORMS[a.formKey];
    var evs = evaluationsOf(a.id).filter(function (e) { return e.submitted; });
    if (!form || !evs.length) return null;
    var sum = 0, allPass = true, results = [];
    for (var i = 0; i < evs.length; i++) {
      var r = evaluateForm(form, evs[i].scores || {});
      results.push(r);
      sum += r.percent;
      if (form.passPercent != null && r.percent < form.passPercent) allPass = false;
    }
    var avg = sum / evs.length;
    return {
      avgPercent: avg,
      avgTotal: form.totalMax * avg / 100,
      grade: gradeOf(form.gradeScale, avg),
      count: evs.length,
      expected: (a.evaluatorIds || []).length,
      allPass: allPass,
      passed: form.passPercent == null ? null : (form.perEvaluatorPass ? allPass : avg >= form.passPercent),
      results: results
    };
  }

  /* ---------------------------------------------------------------------
   * หน้า: แดชบอร์ด (ผู้ดูแล)
   * ------------------------------------------------------------------- */

  var PAGES = {};

  PAGES.dashboard = function (host) {
    var people = Store.all('people');
    var assigns = Store.all('assignments');
    var done = 0, pending = 0, sumPct = 0, scored = 0;

    assigns.forEach(function (a) {
      var r = assignmentResult(a);
      var expected = (a.evaluatorIds || []).length;
      if (r && r.count >= expected && expected > 0) done++; else pending++;
      if (r) { sumPct += r.avgPercent; scored++; }
    });

    var h = '<div class="kpi">' +
      kpiBox('ผู้รับการประเมินทั้งหมด', people.length, 'คน') +
      kpiBox('รอบการประเมินที่เปิด', assigns.length, 'รายการ') +
      kpiBox('ประเมินครบแล้ว', done, 'รายการ') +
      kpiBox('คะแนนเฉลี่ยรวม', scored ? n2(sumPct / scored) : '—', scored ? 'ร้อยละ' : 'ยังไม่มีข้อมูล') +
      '</div>';

    /* แยกตามตำแหน่ง */
    h += '<div class="card"><div class="card-head"><h2>จำนวนบุคลากรแยกตามตำแหน่ง</h2></div>' +
      '<div class="card-body tight"><div class="table-wrap"><table class="data"><thead><tr>' +
      '<th>ตำแหน่ง</th><th class="num">จำนวน</th><th>แบบประเมินที่ใช้</th></tr></thead><tbody>';
    POSITIONS.forEach(function (p) {
      var n = people.filter(function (x) { return x.positionKey === p.key; }).length;
      var forms = p.formKeys.map(function (k) { return FORMS[k] ? FORMS[k].shortName : k; }).join(' · ');
      h += '<tr><td>' + esc(p.label) + '</td><td class="num">' + n + '</td>' +
        '<td><span class="tag tag-mute">' + esc(forms) + '</span></td></tr>';
    });
    h += '</tbody></table></div></div></div>';

    /* รายการล่าสุด */
    h += '<div class="card"><div class="card-head"><h2>ความคืบหน้าการประเมิน</h2>' +
      '<div class="spacer"></div><button class="btn btn-sm" onclick="App.go(\'assignments\')">จัดการรอบการประเมิน</button></div>' +
      '<div class="card-body tight">';
    if (!assigns.length) {
      h += '<div class="empty">ยังไม่มีรอบการประเมิน — เริ่มที่เมนู “รอบการประเมิน”</div>';
    } else {
      h += '<div class="table-wrap"><table class="data"><thead><tr>' +
        '<th>ผู้รับการประเมิน</th><th>แบบประเมิน</th><th class="num">กรรมการ</th>' +
        '<th class="num">คะแนนเฉลี่ย</th><th>ผล</th></tr></thead><tbody>';
      assigns.slice().reverse().slice(0, 12).forEach(function (a) {
        var p = personById(a.personId);
        var r = assignmentResult(a);
        var expected = (a.evaluatorIds || []).length;
        h += '<tr><td>' + personCell(p) + '</td>' +
          '<td>' + esc(assignmentLabel(a)) + '</td>' +
          '<td class="num">' + (r ? r.count : 0) + ' / ' + expected + '</td>' +
          '<td class="num">' + (r ? n2(r.avgPercent) : '—') + '</td>' +
          '<td>' + resultTag(a, r) + '</td></tr>';
      });
      h += '</tbody></table></div>';
    }
    h += '</div></div>';
    host.innerHTML = h;
  };

  function kpiBox(label, value, foot) {
    return '<div class="box"><div class="label">' + esc(label) + '</div>' +
      '<div class="value">' + esc(String(value)) + '</div>' +
      '<div class="foot">' + esc(foot) + '</div></div>';
  }

  function personCell(p) {
    if (!p) return '<span class="tag tag-danger">ไม่พบข้อมูล</span>';
    var initials = (p.firstName || '?').slice(0, 1) + (p.lastName || '').slice(0, 1);
    return '<div class="person-line"><div class="avatar">' + esc(initials) + '</div>' +
      '<div><div class="nm">' + esc(Store.personFullName(p)) + '</div>' +
      '<div class="po">' + esc(Store.positionLabel(p)) + '</div></div></div>';
  }

  function resultTag(a, r) {
    var expected = (a.evaluatorIds || []).length;
    if (!r) return '<span class="tag tag-mute">ยังไม่ประเมิน</span>';
    if (r.count < expected) return '<span class="tag tag-warn">ประเมินแล้ว ' + r.count + ' จาก ' + expected + '</span>';
    var form = FORMS[a.formKey];
    if (form && form.passPercent != null) {
      return r.passed ? '<span class="tag tag-ok">' + esc(r.grade) + '</span>'
        : '<span class="tag tag-danger">' + esc(r.grade) + '</span>';
    }
    return '<span class="tag tag-ok">' + esc(r.grade) + '</span>';
  }

  /* ---------------------------------------------------------------------
   * หน้า: ผู้รับการประเมิน (ผู้ดูแล)
   * ------------------------------------------------------------------- */

  PAGES.people = function (host) {
    var h = '<div class="toolbar">' +
      '<input type="text" id="people-q" placeholder="ค้นหาชื่อ / ตำแหน่ง">' +
      '<select id="people-pos"><option value="">ทุกตำแหน่ง</option>' +
      POSITIONS.map(function (p) { return '<option value="' + p.key + '">' + esc(p.label) + '</option>'; }).join('') +
      '</select>' +
      '<div style="flex:1"></div>' +
      '<button class="btn btn-primary" onclick="App.editPerson()">+ เพิ่มผู้รับการประเมิน</button>' +
      '</div>';
    h += '<div class="card"><div class="card-body tight"><div class="table-wrap" id="people-table"></div></div></div>';
    host.innerHTML = h;
    $('people-q').oninput = drawPeople;
    $('people-pos').onchange = drawPeople;
    drawPeople();
  };

  function drawPeople() {
    var q = val('people-q').toLowerCase();
    var pos = val('people-pos');
    var rows = Store.all('people').filter(function (p) {
      if (pos && p.positionKey !== pos) return false;
      if (!q) return true;
      return (Store.personFullName(p) + ' ' + Store.positionLabel(p) + ' ' + (p.username || ''))
        .toLowerCase().indexOf(q) >= 0;
    });
    if (!rows.length) {
      $('people-table').innerHTML = '<div class="empty">ยังไม่มีข้อมูล — กด “เพิ่มผู้รับการประเมิน”</div>';
      return;
    }
    var h = '<table class="data"><thead><tr><th>ชื่อ–สกุล</th><th>ตำแหน่ง</th>' +
      '<th>บัญชีเข้าใช้</th><th class="num">รอบประเมิน</th><th class="num">จัดการ</th></tr></thead><tbody>';
    rows.forEach(function (p) {
      var nAssign = Store.where('assignments', function (a) { return a.personId === p.id; }).length;
      h += '<tr><td>' + personCell(p) + '</td>' +
        '<td>' + esc(Store.positionLabel(p)) + '</td>' +
        '<td>' + (p.username ? '<span class="tag tag-info">' + esc(p.username) + '</span>' : '<span class="tag tag-mute">ยังไม่ได้ตั้ง</span>') + '</td>' +
        '<td class="num">' + nAssign + '</td>' +
        '<td class="num"><button class="btn btn-sm" onclick="App.editPerson(\'' + p.id + '\')">แก้ไข</button> ' +
        '<button class="btn btn-sm btn-danger" onclick="App.deletePerson(\'' + p.id + '\')">ลบ</button></td></tr>';
    });
    $('people-table').innerHTML = h + '</tbody></table>';
  }

  function editPerson(id) {
    var p = id ? Store.clone(personById(id)) : {
      prefix: 'นาย', firstName: '', lastName: '', positionKey: 'teacher_no_rank',
      workplaces: {}, duties: ''
    };
    var wp = p.workplaces || {};
    var b = '<div class="grid grid-3">' +
      field('ps-prefix', 'คำนำหน้า', selectHtml('ps-prefix', ['นาย', 'นาง', 'นางสาว'], p.prefix)) +
      field('ps-first', 'ชื่อ', '<input type="text" id="ps-first" value="' + esc(p.firstName) + '">') +
      field('ps-last', 'นามสกุล', '<input type="text" id="ps-last" value="' + esc(p.lastName) + '">') +
      '</div>';
    b += '<div class="grid grid-2">' +
      field('ps-pos', 'ตำแหน่ง', '<select id="ps-pos">' + POSITIONS.map(function (x) {
        return '<option value="' + x.key + '"' + (x.key === p.positionKey ? ' selected' : '') + '>' + esc(x.label) + '</option>';
      }).join('') + '</select>') +
      field('ps-postitle', 'ชื่อตำแหน่งที่จะพิมพ์บนเอกสาร (ถ้าต่างจากด้านซ้าย)', '<input type="text" id="ps-postitle" value="' + esc(p.positionTitle || '') + '">') +
      '</div>';
    b += '<div class="grid grid-3">' +
      field('ps-salary', 'เงินเดือน / ค่าตอบแทน (บาท)', '<input type="number" id="ps-salary" value="' + esc(p.salary || '') + '">') +
      field('ps-rank', 'อันดับ คศ.', '<input type="text" id="ps-rank" value="' + esc(p.salaryRank || '') + '">') +
      field('ps-group', 'กลุ่มงาน / กลุ่มสาระฯ', '<input type="text" id="ps-group" value="' + esc(p.workGroup || '') + '">') +
      '</div>';
    b += '<div class="grid grid-3">' +
      field('ps-level', 'สอนระดับชั้น', '<input type="text" id="ps-level" value="' + esc(p.teachLevel || '') + '">') +
      field('ps-subject', 'วิชาที่สอน', '<input type="text" id="ps-subject" value="' + esc(p.subject || '') + '">') +
      field('ps-hours', 'ชั่วโมงสอน/สัปดาห์', '<input type="number" id="ps-hours" value="' + esc(p.teachHours || '') + '">') +
      '</div>';
    b += '<div class="grid grid-2">' +
      field('ps-cstart', 'วันเริ่มต้นสัญญาจ้าง', '<input type="date" id="ps-cstart" value="' + esc(p.contractStart || '') + '">') +
      field('ps-cend', 'วันสิ้นสุดสัญญาจ้าง', '<input type="date" id="ps-cend" value="' + esc(p.contractEnd || '') + '">') +
      '</div>';

    b += '<div class="field"><label>สถานที่ปฏิบัติงาน (ใช้กับแบบครูอัตราจ้าง / จ้างเหมาบริการ)</label>' +
      '<label class="chk"><input type="checkbox" id="wp-center"' + (wp.center ? ' checked' : '') + '> ในศูนย์การศึกษาพิเศษ</label>' +
      '<div class="grid grid-2" style="margin-top:6px">' +
      '<label class="chk"><input type="checkbox" id="wp-hospital"' + (wp.hospital ? ' checked' : '') + '> โรงพยาบาล</label>' +
      '<input type="text" id="wp-hospitalName" placeholder="ชื่อโรงพยาบาล" value="' + esc(wp.hospitalName || '') + '">' +
      '<label class="chk"><input type="checkbox" id="wp-unit"' + (wp.unit ? ' checked' : '') + '> หน่วยบริการ</label>' +
      '<input type="text" id="wp-unitName" placeholder="ชื่อหน่วยบริการ" value="' + esc(wp.unitName || '') + '">' +
      '<label class="chk"><input type="checkbox" id="wp-home"' + (wp.home ? ' checked' : '') + '> โครงการปรับบ้านเป็นห้องเรียนฯ</label>' +
      '<input type="text" id="wp-homeDistrict" placeholder="อำเภอ" value="' + esc(wp.homeDistrict || '') + '">' +
      '<label class="chk"><input type="checkbox" id="wp-school"' + (wp.school ? ' checked' : '') + '> โรงเรียน</label>' +
      '<input type="text" id="wp-schoolName" placeholder="ชื่อโรงเรียน" value="' + esc(wp.schoolName || '') + '">' +
      '</div>' +
      '<input type="text" id="wp-schoolDistrict" placeholder="อำเภอของโรงเรียน" value="' + esc(wp.schoolDistrict || '') + '" style="margin-top:6px">' +
      '</div>';

    b += field('ps-duties', 'รายละเอียดหน้าที่ความรับผิดชอบ',
      '<textarea id="ps-duties">' + esc(p.duties || '') + '</textarea>');

    b += '<div class="grid grid-2">' +
      field('ps-user', 'ชื่อผู้ใช้ (สำหรับเข้าระบบ)', '<input type="text" id="ps-user" value="' + esc(p.username || '') + '">') +
      field('ps-pass', 'รหัสผ่าน' + (id ? ' (เว้นว่างไว้ = ไม่เปลี่ยน)' : ''), '<input type="text" id="ps-pass" value="">') +
      '</div>';

    modal(id ? 'แก้ไขข้อมูลผู้รับการประเมิน' : 'เพิ่มผู้รับการประเมิน', b,
      '<button class="btn btn-primary" id="ps-save">บันทึก</button>' +
      '<button class="btn" onclick="App.closeModal()">ยกเลิก</button>');

    $('ps-save').onclick = function () {
      if (!val('ps-first')) { toast('กรุณากรอกชื่อ', 'err'); return; }
      p.prefix = val('ps-prefix');
      p.firstName = val('ps-first');
      p.lastName = val('ps-last');
      p.positionKey = val('ps-pos');
      p.positionTitle = val('ps-postitle');
      p.salary = numval('ps-salary');
      p.salaryRank = val('ps-rank');
      p.workGroup = val('ps-group');
      p.teachLevel = val('ps-level');
      p.subject = val('ps-subject');
      p.teachHours = numval('ps-hours');
      p.contractStart = val('ps-cstart');
      p.contractEnd = val('ps-cend');
      p.duties = val('ps-duties');
      p.workplaces = {
        center: checked('wp-center'),
        hospital: checked('wp-hospital'), hospitalName: val('wp-hospitalName'),
        unit: checked('wp-unit'), unitName: val('wp-unitName'),
        home: checked('wp-home'), homeDistrict: val('wp-homeDistrict'),
        school: checked('wp-school'), schoolName: val('wp-schoolName'), schoolDistrict: val('wp-schoolDistrict')
      };
      p.username = val('ps-user');
      var pw = val('ps-pass');
      if (pw) Store.setPassword(p, pw);
      Store.upsert('people', p);
      closeModal();
      toast('บันทึกข้อมูลแล้ว', 'ok');
      drawPeople();
    };
  }

  function deletePerson(id) {
    var p = personById(id);
    confirmDo('ลบ "' + Store.personFullName(p) + '" พร้อมรอบการประเมินและผลคะแนนทั้งหมดของบุคคลนี้?', function () {
      Store.where('assignments', function (a) { return a.personId === id; }).forEach(function (a) {
        evaluationsOf(a.id).forEach(function (e) { Store.remove('evaluations', e.id); });
        Store.remove('assignments', a.id);
      });
      Store.remove('people', id);
      toast('ลบแล้ว', 'ok');
      drawPeople();
    });
  }

  function field(id, label, control, hint) {
    return '<div class="field"><label for="' + id + '">' + esc(label) + '</label>' + control +
      (hint ? '<div class="hint">' + esc(hint) + '</div>' : '') + '</div>';
  }

  function selectHtml(id, options, current) {
    return '<select id="' + id + '">' + options.map(function (o) {
      return '<option' + (o === current ? ' selected' : '') + '>' + esc(o) + '</option>';
    }).join('') + '</select>';
  }

  /* ---------------------------------------------------------------------
   * หน้า: คณะกรรมการ (ผู้ดูแล)
   * ------------------------------------------------------------------- */

  PAGES.evaluators = function (host) {
    var h = '<div class="toolbar"><div style="flex:1"></div>' +
      '<button class="btn btn-primary" onclick="App.editEvaluator()">+ เพิ่มกรรมการ</button></div>';
    h += '<div class="card"><div class="card-body tight"><div class="table-wrap" id="ev-table"></div></div></div>';
    host.innerHTML = h;
    drawEvaluators();
  };

  function drawEvaluators() {
    var rows = Store.all('evaluators');
    if (!rows.length) {
      $('ev-table').innerHTML = '<div class="empty">ยังไม่มีกรรมการ — กด “เพิ่มกรรมการ”</div>';
      return;
    }
    var h = '<table class="data"><thead><tr><th>ชื่อ–สกุล</th><th>ตำแหน่ง</th>' +
      '<th>บัญชีเข้าใช้</th><th class="num">งานที่รับผิดชอบ</th><th class="num">จัดการ</th></tr></thead><tbody>';
    rows.forEach(function (e) {
      var n = Store.where('assignments', function (a) {
        return (a.evaluatorIds || []).indexOf(e.id) >= 0;
      }).length;
      h += '<tr><td><b>' + esc(e.name) + '</b>' + (e.isChair ? ' <span class="tag tag-info">ประธาน</span>' : '') + '</td>' +
        '<td>' + esc(e.title || '—') + '</td>' +
        '<td>' + (e.username ? '<span class="tag tag-info">' + esc(e.username) + '</span>' : '<span class="tag tag-mute">ยังไม่ได้ตั้ง</span>') + '</td>' +
        '<td class="num">' + n + '</td>' +
        '<td class="num"><button class="btn btn-sm" onclick="App.editEvaluator(\'' + e.id + '\')">แก้ไข</button> ' +
        '<button class="btn btn-sm btn-danger" onclick="App.deleteEvaluator(\'' + e.id + '\')">ลบ</button></td></tr>';
    });
    $('ev-table').innerHTML = h + '</tbody></table>';
  }

  function editEvaluator(id) {
    var e = id ? Store.clone(evaluatorById(id)) : { name: '', title: '', username: '', isChair: false };
    var b = field('ev-name', 'ชื่อ–สกุล', '<input type="text" id="ev-name" value="' + esc(e.name) + '">') +
      field('ev-title', 'ตำแหน่ง', '<input type="text" id="ev-title" value="' + esc(e.title || '') + '">') +
      '<div class="grid grid-2">' +
      field('ev-user', 'ชื่อผู้ใช้', '<input type="text" id="ev-user" value="' + esc(e.username || '') + '">') +
      field('ev-pass', 'รหัสผ่าน' + (id ? ' (เว้นว่างไว้ = ไม่เปลี่ยน)' : ''), '<input type="text" id="ev-pass" value="">') +
      '</div>' +
      '<label class="chk"><input type="checkbox" id="ev-chair"' + (e.isChair ? ' checked' : '') + '> เป็นประธานคณะกรรมการ</label>';
    modal(id ? 'แก้ไขกรรมการ' : 'เพิ่มกรรมการ', b,
      '<button class="btn btn-primary" id="ev-save">บันทึก</button>' +
      '<button class="btn" onclick="App.closeModal()">ยกเลิก</button>');
    $('ev-save').onclick = function () {
      if (!val('ev-name')) { toast('กรุณากรอกชื่อ', 'err'); return; }
      e.name = val('ev-name');
      e.title = val('ev-title');
      e.username = val('ev-user');
      e.isChair = checked('ev-chair');
      var pw = val('ev-pass');
      if (pw) Store.setPassword(e, pw);
      Store.upsert('evaluators', e);
      closeModal();
      toast('บันทึกแล้ว', 'ok');
      drawEvaluators();
    };
  }

  function deleteEvaluator(id) {
    confirmDo('ลบกรรมการคนนี้? ผลคะแนนที่บันทึกไว้จะถูกลบด้วย', function () {
      Store.where('evaluations', function (e) { return e.evaluatorId === id; })
        .forEach(function (e) { Store.remove('evaluations', e.id); });
      Store.all('assignments').forEach(function (a) {
        if ((a.evaluatorIds || []).indexOf(id) >= 0) {
          a.evaluatorIds = a.evaluatorIds.filter(function (x) { return x !== id; });
          Store.upsert('assignments', a);
        }
      });
      Store.remove('evaluators', id);
      toast('ลบแล้ว', 'ok');
      drawEvaluators();
    });
  }

  /* ---------------------------------------------------------------------
   * หน้า: รอบการประเมิน (ผู้ดูแล)
   * ------------------------------------------------------------------- */

  PAGES.assignments = function (host) {
    var h = '<div class="toolbar"><div style="flex:1"></div>' +
      '<button class="btn btn-primary" onclick="App.editAssignment()">+ สร้างรอบการประเมิน</button></div>';
    h += '<div class="card"><div class="card-body tight"><div class="table-wrap" id="as-table"></div></div></div>';
    host.innerHTML = h;
    drawAssignments();
  };

  function drawAssignments() {
    var rows = Store.all('assignments').slice().reverse();
    if (!rows.length) {
      $('as-table').innerHTML = '<div class="empty">ยังไม่มีรอบการประเมิน<br>' +
        '<span class="small">สร้างรอบ = เลือกผู้รับการประเมิน + แบบประเมิน + ปีงบประมาณ/รอบ + คณะกรรมการ</span></div>';
      return;
    }
    var h = '<table class="data"><thead><tr><th>ผู้รับการประเมิน</th><th>แบบประเมิน</th>' +
      '<th>รอบ</th><th>คณะกรรมการ</th><th class="num">ความคืบหน้า</th><th class="num">จัดการ</th></tr></thead><tbody>';
    rows.forEach(function (a) {
      var p = personById(a.personId);
      var f = FORMS[a.formKey];
      var r = assignmentResult(a);
      var expected = (a.evaluatorIds || []).length;
      var names = (a.evaluatorIds || []).map(function (id) {
        var e = evaluatorById(id); return e ? e.name : '—';
      }).join(', ');
      h += '<tr><td>' + personCell(p) + '</td>' +
        '<td>' + esc(f ? f.shortName : a.formKey) + '</td>' +
        '<td>' + esc(roundRange(a.round, a.year).label + ' / ' + a.year) + '</td>' +
        '<td><span class="small">' + esc(names || '—') + '</span></td>' +
        '<td class="num">' + (r ? r.count : 0) + ' / ' + expected + '</td>' +
        '<td class="num">' +
        '<button class="btn btn-sm" onclick="App.go(\'print\',{a:\'' + a.id + '\'})">พิมพ์</button> ' +
        '<button class="btn btn-sm" onclick="App.editAssignment(\'' + a.id + '\')">แก้ไข</button> ' +
        '<button class="btn btn-sm btn-danger" onclick="App.deleteAssignment(\'' + a.id + '\')">ลบ</button>' +
        '</td></tr>';
    });
    $('as-table').innerHTML = h + '</tbody></table>';
  }

  function editAssignment(id) {
    var a = id ? Store.clone(Store.byId('assignments', id)) : {
      personId: '', formKey: '', year: Number(Store.getSettings().budgetYear) || 2568,
      round: 'r1', evaluatorIds: []
    };
    var people = Store.all('people');
    if (!people.length) { toast('ยังไม่มีผู้รับการประเมิน — เพิ่มข้อมูลบุคลากรก่อน', 'err'); return; }

    var b = field('as-person', 'ผู้รับการประเมิน',
      '<select id="as-person">' + people.map(function (p) {
        return '<option value="' + p.id + '"' + (p.id === a.personId ? ' selected' : '') + '>' +
          esc(Store.personFullName(p) + ' — ' + Store.positionLabel(p)) + '</option>';
      }).join('') + '</select>');
    b += field('as-form', 'แบบประเมินที่ใช้', '<select id="as-form"></select>',
      'ตัวเลือกจะเปลี่ยนตามตำแหน่งของผู้รับการประเมิน');
    b += '<div class="grid grid-2">' +
      field('as-year', 'ปีงบประมาณ (พ.ศ.)', '<input type="number" id="as-year" value="' + esc(a.year) + '">') +
      field('as-round', 'รอบการประเมิน', '<select id="as-round">' + ROUNDS.map(function (r) {
        return '<option value="' + r.key + '"' + (r.key === a.round ? ' selected' : '') + '>' + esc(r.label) + '</option>';
      }).join('') + '</select>') +
      '</div>';
    b += '<div class="field"><label>คณะกรรมการประเมิน (เลือกได้หลายคน)</label><div id="as-evs"></div></div>';

    modal(id ? 'แก้ไขรอบการประเมิน' : 'สร้างรอบการประเมิน', b,
      '<button class="btn btn-primary" id="as-save">บันทึก</button>' +
      '<button class="btn" onclick="App.closeModal()">ยกเลิก</button>');

    function refreshForms() {
      var p = personById(val('as-person'));
      var list = p ? formsForPosition(p.positionKey) : [];
      $('as-form').innerHTML = list.length
        ? list.map(function (f) {
            return '<option value="' + f.key + '"' + (f.key === a.formKey ? ' selected' : '') + '>' +
              esc(f.shortName) + ' (เต็ม ' + f.totalMax + ' คะแนน)</option>';
          }).join('')
        : '<option value="">— ไม่มีแบบประเมินสำหรับตำแหน่งนี้ —</option>';
    }

    function refreshEvs() {
      var evs = Store.all('evaluators');
      $('as-evs').innerHTML = evs.length
        ? evs.map(function (e) {
            var on = (a.evaluatorIds || []).indexOf(e.id) >= 0;
            return '<label class="chk" style="display:flex;padding:4px 0">' +
              '<input type="checkbox" class="as-ev" value="' + e.id + '"' + (on ? ' checked' : '') + '> ' +
              esc(e.name) + (e.title ? ' <span class="po small">— ' + esc(e.title) + '</span>' : '') + '</label>';
          }).join('')
        : '<div class="notice notice-warn">ยังไม่มีรายชื่อกรรมการ กรุณาเพิ่มที่เมนู “คณะกรรมการประเมิน” ก่อน</div>';
    }

    refreshForms(); refreshEvs();
    $('as-person').onchange = refreshForms;

    $('as-save').onclick = function () {
      var picked = [];
      var boxes = document.querySelectorAll('.as-ev');
      for (var i = 0; i < boxes.length; i++) if (boxes[i].checked) picked.push(boxes[i].value);
      if (!val('as-form')) { toast('กรุณาเลือกแบบประเมิน', 'err'); return; }
      if (!picked.length) { toast('กรุณาเลือกกรรมการอย่างน้อย 1 คน', 'err'); return; }
      a.personId = val('as-person');
      a.formKey = val('as-form');
      a.year = Number(val('as-year')) || 2568;
      a.round = val('as-round');
      a.evaluatorIds = picked;
      /* เก็บชื่อไว้ด้วยเพื่อให้อ่านชีตใน Google Sheets รู้เรื่องโดยไม่ต้องไล่ id */
      a.personName = Store.personFullName(personById(a.personId));
      a.formName = FORMS[a.formKey] ? FORMS[a.formKey].shortName : a.formKey;
      Store.upsert('assignments', a);
      closeModal();
      toast('บันทึกรอบการประเมินแล้ว', 'ok');
      drawAssignments();
    };
  }

  function deleteAssignment(id) {
    confirmDo('ลบรอบการประเมินนี้พร้อมคะแนนของกรรมการทุกคน?', function () {
      evaluationsOf(id).forEach(function (e) { Store.remove('evaluations', e.id); });
      Store.remove('assignments', id);
      toast('ลบแล้ว', 'ok');
      drawAssignments();
    });
  }

  /* ---------------------------------------------------------------------
   * หน้า: รายการที่ต้องประเมิน (กรรมการ)
   * ------------------------------------------------------------------- */

  PAGES.tasks = function (host) {
    var rows = assignmentsFor('evaluator');
    if (!rows.length) {
      host.innerHTML = '<div class="card"><div class="empty">ยังไม่มีรายการที่ต้องประเมิน<br>' +
        '<span class="small">ผู้ดูแลระบบจะเป็นผู้กำหนดผู้รับการประเมินให้ท่าน</span></div></div>';
      return;
    }
    var h = '<div class="card"><div class="card-body tight"><div class="table-wrap">' +
      '<table class="data"><thead><tr><th>ผู้รับการประเมิน</th><th>แบบประเมิน</th><th>รอบ</th>' +
      '<th>เอกสารแนบ</th><th>สถานะ</th><th class="num">ดำเนินการ</th></tr></thead><tbody>';
    rows.forEach(function (a) {
      var p = personById(a.personId);
      var f = FORMS[a.formKey];
      var ev = evaluationOf(a.id, session.id);
      var files = Store.where('attachments', function (x) { return x.personId === a.personId; });
      var status = !ev ? '<span class="tag tag-mute">ยังไม่เริ่ม</span>'
        : ev.submitted ? '<span class="tag tag-ok">ส่งผลแล้ว</span>'
        : '<span class="tag tag-warn">บันทึกร่างไว้</span>';
      h += '<tr><td>' + personCell(p) + '</td>' +
        '<td>' + esc(f ? f.shortName : a.formKey) + '</td>' +
        '<td>' + esc(roundRange(a.round, a.year).label + ' / ' + a.year) + '</td>' +
        '<td>' + (files.length
          ? '<button class="btn btn-sm" onclick="App.viewFiles(\'' + a.personId + '\')">' + files.length + ' ไฟล์</button>'
          : '<span class="tag tag-mute">ไม่มี</span>') + '</td>' +
        '<td>' + status + '</td>' +
        '<td class="num"><button class="btn btn-sm btn-primary" onclick="App.go(\'score\',{a:\'' + a.id + '\'})">' +
        (ev && ev.submitted ? 'แก้ไขผล' : 'ให้คะแนน') + '</button>' +
        (ev && ev.submitted ? ' <button class="btn btn-sm" onclick="App.go(\'print\',{a:\'' + a.id + '\',ev:\'' + session.id + '\'})">พิมพ์</button>' : '') +
        '</td></tr>';
    });
    host.innerHTML = h + '</tbody></table></div></div></div>';
  };

  /* ---------------------------------------------------------------------
   * หน้า: ให้คะแนน
   * ------------------------------------------------------------------- */

  PAGES.score = function (host, params) {
    var a = Store.byId('assignments', params.a);
    if (!a) { host.innerHTML = '<div class="empty">ไม่พบรอบการประเมิน</div>'; return; }
    var form = FORMS[a.formKey];
    var p = personById(a.personId);
    if (!form || !p) { host.innerHTML = '<div class="empty">ข้อมูลไม่ครบถ้วน</div>'; return; }

    var evaluatorId = session.role === 'evaluator' ? session.id : (params.ev || (a.evaluatorIds || [])[0]);
    if (session.role === 'evaluator' && (a.evaluatorIds || []).indexOf(session.id) < 0) {
      host.innerHTML = '<div class="empty">ท่านไม่ได้รับมอบหมายให้ประเมินรายการนี้</div>';
      return;
    }

    var ev = evaluationOf(a.id, evaluatorId) || {
      assignmentId: a.id, evaluatorId: evaluatorId, scores: {}, notes: {},
      workloadPass: true, submitted: false
    };
    scoreDraft = Store.clone(ev);
    scoreDraft.scores = scoreDraft.scores || {};
    scoreDraft.notes = scoreDraft.notes || {};

    $('page-title').textContent = 'ให้คะแนน — ' + Store.personFullName(p);
    $('page-sub').textContent = form.shortName + ' · ' + roundRange(a.round, a.year).label + ' ปีงบประมาณ ' + a.year;

    var h = '';

    /* ผู้ดูแลระบบกรอกแทนกรรมการได้ — ต้องเห็นชัดว่ากำลังกรอกในนามใคร */
    if (session.role === 'admin') {
      var meEv = evaluatorById(evaluatorId);
      h += '<div class="notice notice-warn">' +
        '<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">' +
        '<div><b>โหมดผู้ดูแลระบบ</b> — กำลังกรอกในนามของกรรมการ: <b>' +
        esc(meEv ? meEv.name : '—') + '</b></div>' +
        '<div style="flex:1"></div>' +
        '<select id="score-as" style="width:auto;min-width:220px">' +
        (a.evaluatorIds || []).map(function (id) {
          var e = evaluatorById(id);
          var done = evaluationOf(a.id, id);
          return '<option value="' + id + '"' + (id === evaluatorId ? ' selected' : '') + '>' +
            esc(e ? e.name : id) + (done ? (done.submitted ? ' — ส่งผลแล้ว' : ' — ร่าง') : ' — ยังไม่กรอก') +
            '</option>';
        }).join('') + '</select>' +
        '<button class="btn btn-sm" onclick="App.go(\'results\')">กลับไปหน้าผลการประเมิน</button>' +
        '</div>' +
        '<div class="small" style="margin-top:6px">การสลับกรรมการจะทิ้งคะแนนที่ยังไม่ได้บันทึกในหน้านี้</div>' +
        '</div>';
    }

    h += '<div class="notice notice-info">' +
      '<b>' + esc(form.title) + '</b> — ' + esc(form.positionLine) +
      (form.passNote ? '<br>' + esc(form.passNote) : '') + '</div>';

    /* ภาระงาน (เฉพาะ PA) */
    if (form.hasWorkload) {
      h += '<div class="card"><div class="card-body">' +
        '<div class="field"><label>๑) ภาระงาน</label>' +
        '<label class="chk"><input type="radio" name="workload" value="1"' +
        (scoreDraft.workloadPass !== false ? ' checked' : '') + '> เป็นไปตามที่ ก.ค.ศ. กำหนด</label> &nbsp;&nbsp;' +
        '<label class="chk"><input type="radio" name="workload" value="0"' +
        (scoreDraft.workloadPass === false ? ' checked' : '') + '> ไม่เป็นไปตามที่ ก.ค.ศ. กำหนด</label>' +
        '</div></div></div>';
    }

    /* ตารางให้คะแนนแต่ละ section */
    for (var i = 0; i < form.sections.length; i++) {
      h += renderScoreSection(form.sections[i], scoreDraft.scores);
    }

    /* ข้อสังเกต */
    h += '<div class="card"><div class="card-head"><h2>ข้อสังเกตของกรรมการ</h2>' +
      '<div class="sub">จะปรากฏในหน้าสรุปข้อสังเกตของแบบฟอร์ม</div></div><div class="card-body">' +
      field('nt-strength', 'จุดเด่น', '<textarea id="nt-strength">' + esc(scoreDraft.notes.strength || '') + '</textarea>') +
      field('nt-improve', 'จุดที่ควรพัฒนา', '<textarea id="nt-improve">' + esc(scoreDraft.notes.improve || '') + '</textarea>') +
      field('nt-comment', 'ข้อคิดเห็นเพิ่มเติม', '<textarea id="nt-comment">' + esc(scoreDraft.notes.comment || '') + '</textarea>');

    if (form.hasContractDecision) {
      h += field('nt-contract', 'ความเห็นเรื่องสัญญาจ้าง',
        '<select id="nt-contract"><option value="">— ใช้ผลตามเกณฑ์คะแนนอัตโนมัติ —</option>' +
        form.contractRules.map(function (r) {
          return '<option value="' + esc(r.label) + '"' +
            (scoreDraft.contractDecision === r.label ? ' selected' : '') + '>' + esc(r.label) + '</option>';
        }).join('') + '</select>');
    }
    h += '</div></div>';

    h += '<div class="score-bar" id="score-bar"></div>';

    /* ผูก event กับกล่องที่สร้างใหม่ทุกครั้ง — ถ้าผูกกับ #page ซึ่งอยู่ถาวร
       listener จะสะสมทุกครั้งที่เปิดหน้านี้ */
    host.innerHTML = '<div id="score-root"></div>';
    var root = $('score-root');
    root.innerHTML = h;

    root.addEventListener('change', function (e) {
      var t = e.target;
      if (t.name === 'workload') { scoreDraft.workloadPass = t.value === '1'; return; }
      if (t.hasAttribute && t.hasAttribute('data-skey')) {
        scoreDraft.scores[t.getAttribute('data-skey')] = t.value;
        updateScoreUI(form);
      }
    });
    root.addEventListener('input', function (e) {
      var t = e.target;
      if (t.hasAttribute && t.hasAttribute('data-skey') && t.type === 'number') {
        var max = Number(t.getAttribute('max'));
        if (t.value !== '' && Number(t.value) > max) t.value = max;
        if (t.value !== '' && Number(t.value) < 0) t.value = 0;
        scoreDraft.scores[t.getAttribute('data-skey')] = t.value;
        updateScoreUI(form);
      }
    });

    if ($('score-as')) {
      $('score-as').onchange = function () { go('score', { a: a.id, ev: this.value }); };
    }

    updateScoreUI(form);
  };

  function renderScoreSection(section, scores) {
    var levels = section.input === 'level5' ? 5 : 4;
    var h = '<div class="score-section" data-section="' + section.id + '"><header>' +
      (section.no ? '<div class="no">' + esc(section.no) + '</div>' : '') +
      '<h3>' + esc(section.title) + ' (เต็ม ' + section.maxScore + ' คะแนน)</h3>' +
      (section.subtitle ? '<div class="meta">' + esc(section.subtitle) + '</div>' : '') +
      (section.note ? '<div class="meta">' + esc(section.note) + '</div>' : '') +
      (section.formula ? '<div class="formula">' + esc(section.formula) + '</div>' : '') +
      '</header>';

    h += '<table class="score"><thead><tr><th class="item" colspan="2">รายการประเมิน</th>' +
      '<th>' + (section.input === 'points' ? 'คะแนนที่ให้' : 'ระดับ ๑–' + levels) + '</th>' +
      '<th>คะแนน</th></tr></thead><tbody>';

    if (section.groups) {
      for (var g = 0; g < section.groups.length; g++) {
        var grp = section.groups[g];
        h += '<tr class="group-row"><td colspan="4">' + esc(grp.title) +
          ' <span class="tag tag-mute">น้ำหนัก ' + grp.weight + '</span></td></tr>';
        for (var gi = 0; gi < grp.items.length; gi++) {
          h += scoreRow(section, grp.items[gi], scoreKey(section.id, gi, grp.id), scores, levels);
        }
      }
    } else {
      var titles = section.groupsBy || null;
      var last = -1;
      for (var i = 0; i < section.items.length; i++) {
        if (titles) {
          var idx = groupIdx(section.items[i].no, titles.length);
          if (idx !== last && titles[idx]) {
            h += '<tr class="group-row"><td colspan="4">' + esc(titles[idx]) + '</td></tr>';
            last = idx;
          }
        }
        h += scoreRow(section, section.items[i], scoreKey(section.id, i), scores, levels);
      }
    }
    h += '</tbody></table>';
    h += '<div class="section-total">คะแนนรวมส่วนนี้: <b data-total="' + section.id + '">0</b>' +
      ' / ' + section.maxScore + ' คะแนน' +
      '<span class="lbl" data-raw="' + section.id + '"></span></div>';
    return h + '</div>';
  }

  function groupIdx(no, count) {
    var thaiDigits = '๐๑๒๓๔๕๖๗๘๙';
    var first = String(no || '').replace(/[^0-9๐-๙]/g, '').charAt(0);
    var i = thaiDigits.indexOf(first);
    var n = i >= 0 ? i : parseInt(first, 10);
    if (isNaN(n) || n < 1) return 0;
    return Math.min(n - 1, count - 1);
  }

  function scoreRow(section, item, key, scores, levels) {
    var cur = scores[key];
    var h = '<tr><td class="no">' + esc(item.no || '') + '</td>' +
      '<td class="item">' + esc(item.text) +
      (section.scaled ? ' <span class="tag tag-mute">เต็ม ' + item.max + '</span>' : '') +
      (section.weighted && item.weight ? ' <span class="tag tag-mute">น้ำหนัก ' + item.weight + '</span>' : '') +
      (item.detail ? '<div class="detail">◆ ' + esc(item.detail) + '</div>' : '') + '</td>';

    if (section.input === 'points') {
      h += '<td class="pts"><input type="number" class="pts-input" min="0" max="' + item.max +
        '" step="0.5" data-skey="' + key + '" value="' + (cur === undefined ? '' : esc(cur)) + '">' +
        '<span class="pts-max">/ ' + item.max + '</span></td>';
    } else {
      h += '<td class="opts"><span class="lv">';
      for (var L = 1; L <= levels; L++) {
        h += '<label><input type="radio" name="' + key + '" value="' + L + '" data-skey="' + key + '"' +
          (String(cur) === String(L) ? ' checked' : '') + '><span>' + L + '</span></label>';
      }
      h += '</span></td>';
    }
    h += '<td class="got" data-got="' + key + '">' +
      (cur === undefined || cur === '' ? '—' : n2(itemPoints(section, item, cur))) + '</td></tr>';
    return h;
  }

  function updateScoreUI(form) {
    var res = evaluateForm(form, scoreDraft.scores);

    /* คะแนนรายข้อ */
    for (var i = 0; i < form.sections.length; i++) {
      var s = form.sections[i];
      if (s.groups) {
        for (var g = 0; g < s.groups.length; g++) {
          for (var gi = 0; gi < s.groups[g].items.length; gi++) {
            paintCell(s, s.groups[g].items[gi], scoreKey(s.id, gi, s.groups[g].id));
          }
        }
      } else {
        for (var j = 0; j < s.items.length; j++) paintCell(s, s.items[j], scoreKey(s.id, j));
      }
      var tot = document.querySelector('[data-total="' + s.id + '"]');
      if (tot) tot.textContent = n2(res.sections[s.id]);
      var rawEl = document.querySelector('[data-raw="' + s.id + '"]');
      if (rawEl) rawEl.textContent = '(คะแนนดิบ ' + n2(res.raw[s.id]) + ')';
    }

    var answered = formAnsweredCount(form, scoreDraft.scores);
    var total = formItemCount(form);
    var pct = total ? (answered / total) * 100 : 0;

    $('score-bar').innerHTML =
      '<div><div class="lbl">คะแนนรวม (เต็ม ' + form.totalMax + ')</div>' +
      '<div class="big">' + n2(res.total) + '</div></div>' +
      '<div><div class="lbl">คิดเป็นร้อยละ</div><div class="big">' + n2(res.percent) + '</div></div>' +
      '<div><div class="lbl">ผลการประเมิน</div><div style="font-weight:700;font-size:16px">' + esc(res.grade) + '</div></div>' +
      '<div class="spacer"></div>' +
      '<div style="min-width:200px"><div class="lbl">กรอกแล้ว ' + answered + ' จาก ' + total + ' ข้อ</div>' +
      '<div class="progress"><i style="width:' + pct + '%"></i></div></div>' +
      '<button class="btn" onclick="App.saveScore(false)">บันทึกร่าง</button>' +
      '<button class="btn btn-ok" onclick="App.saveScore(true)">ส่งผลการประเมิน</button>';
  }

  function paintCell(section, item, key) {
    var cell = document.querySelector('[data-got="' + key + '"]');
    if (!cell) return;
    var v = scoreDraft.scores[key];
    cell.textContent = (v === undefined || v === '') ? '—' : n2(itemPoints(section, item, v));
  }

  function saveScore(submit) {
    var a = Store.byId('assignments', route.params.a);
    var form = FORMS[a.formKey];
    scoreDraft.notes = {
      strength: val('nt-strength'),
      improve: val('nt-improve'),
      comment: val('nt-comment')
    };
    if ($('nt-contract')) scoreDraft.contractDecision = val('nt-contract');

    if (submit) {
      var answered = formAnsweredCount(form, scoreDraft.scores);
      var total = formItemCount(form);
      if (answered < total) {
        toast('ยังกรอกไม่ครบ (' + answered + ' จาก ' + total + ' ข้อ) — บันทึกเป็นร่างไว้ก่อนได้', 'err');
        return;
      }
      scoreDraft.submitted = true;
      scoreDraft.submittedAt = Store.nowISO();
    }
    /* เก็บผลที่คำนวณแล้วลงชีตด้วย เพื่อให้ทำรายงานใน Google Sheets ได้โดยตรง */
    var calc = evaluateForm(form, scoreDraft.scores);
    scoreDraft.total = Math.round(calc.total * 100) / 100;
    scoreDraft.percent = Math.round(calc.percent * 100) / 100;
    scoreDraft.grade = calc.grade;
    scoreDraft.personName = Store.personFullName(personById(a.personId));
    var me = evaluatorById(scoreDraft.evaluatorId);
    scoreDraft.evaluatorName = me ? me.name : '';
    Store.upsert('evaluations', scoreDraft);
    toast(submit ? 'ส่งผลการประเมินเรียบร้อย' : 'บันทึกร่างแล้ว', 'ok');
    if (submit) go(session.role === 'evaluator' ? 'tasks' : 'results');
  }

  /* ---------------------------------------------------------------------
   * หน้า: ผลการประเมิน
   * ------------------------------------------------------------------- */

  PAGES.results = function (host) {
    var rows = session.role === 'admin' ? Store.all('assignments') : assignmentsFor('evaluator');
    if (!rows.length) {
      host.innerHTML = '<div class="card"><div class="empty">ยังไม่มีผลการประเมิน</div></div>';
      return;
    }
    var h = '<div class="card"><div class="card-body tight"><div class="table-wrap">' +
      '<table class="data"><thead><tr><th>ผู้รับการประเมิน</th><th>แบบประเมิน</th><th>รอบ</th>' +
      '<th class="num">กรรมการ</th><th class="num">คะแนนเฉลี่ย</th><th class="num">ร้อยละ</th>' +
      '<th>ผล</th><th class="num">พิมพ์</th></tr></thead><tbody>';
    rows.slice().reverse().forEach(function (a) {
      var p = personById(a.personId);
      var f = FORMS[a.formKey];
      var r = assignmentResult(a);
      h += '<tr><td>' + personCell(p) + '</td>' +
        '<td>' + esc(f ? f.shortName : a.formKey) + '</td>' +
        '<td>' + esc(roundRange(a.round, a.year).label + ' / ' + a.year) + '</td>' +
        '<td class="num">' + (r ? r.count : 0) + ' / ' + (a.evaluatorIds || []).length + '</td>' +
        '<td class="num">' + (r ? n2(r.avgTotal) : '—') + '</td>' +
        '<td class="num">' + (r ? n2(r.avgPercent) : '—') + '</td>' +
        '<td>' + resultTag(a, r) + '</td>' +
        '<td class="num">' +
        '<button class="btn btn-sm" onclick="App.go(\'print\',{a:\'' + a.id + '\'})">พิมพ์</button>' +
        (session.role === 'admin'
          ? ' <button class="btn btn-sm" onclick="App.manageEvaluations(\'' + a.id + '\')">จัดการผล</button>'
          : '') +
        '</td></tr>';
    });
    host.innerHTML = h + '</tbody></table></div></div></div>';
  };

  /* ---------------------------------------------------------------------
   * ผู้ดูแลระบบ: แก้ไข / ลบผลการประเมินรายกรรมการ
   * ใช้ตอนทดลองใช้ระบบ หรือแก้ให้กรณีกรรมการกรอกผิด
   * ------------------------------------------------------------------- */

  function manageEvaluations(assignmentId) {
    var a = Store.byId('assignments', assignmentId);
    if (!a) return;
    var form = FORMS[a.formKey];
    var p = personById(a.personId);

    var b = '<div class="notice notice-info">' +
      '<b>' + esc(Store.personFullName(p)) + '</b> — ' + esc(form ? form.shortName : a.formKey) +
      ' · ' + esc(roundRange(a.round, a.year).label + ' ปีงบประมาณ ' + a.year) + '</div>';

    b += '<div class="table-wrap"><table class="data"><thead><tr>' +
      '<th>กรรมการผู้ประเมิน</th><th>สถานะ</th><th class="num">คะแนน</th>' +
      '<th class="num">ร้อยละ</th><th class="num">จัดการ</th></tr></thead><tbody>';

    (a.evaluatorIds || []).forEach(function (eid) {
      var ev = evaluatorById(eid);
      var rec = evaluationOf(assignmentId, eid);
      var res = rec ? evaluateForm(form, rec.scores || {}) : null;
      var status = !rec ? '<span class="tag tag-mute">ยังไม่เริ่ม</span>'
        : rec.submitted ? '<span class="tag tag-ok">ส่งผลแล้ว</span>'
        : '<span class="tag tag-warn">บันทึกร่างไว้</span>';
      b += '<tr><td><b>' + esc(ev ? ev.name : '—') + '</b>' +
        '<div class="po small">' + esc(ev ? (ev.title || '') : '') + '</div></td>' +
        '<td>' + status + '</td>' +
        '<td class="num">' + (res ? n2(res.total) : '—') + '</td>' +
        '<td class="num">' + (res ? n2(res.percent) : '—') + '</td>' +
        '<td class="num">' +
        '<button class="btn btn-sm" onclick="App.editEvaluation(\'' + assignmentId + '\',\'' + eid + '\')">' +
        (rec ? 'แก้ไขคะแนน' : 'กรอกคะแนน') + '</button>' +
        (rec ? ' <button class="btn btn-sm btn-danger" onclick="App.deleteEvaluation(\'' + rec.id + '\',\'' + assignmentId + '\')">ลบผล</button>' : '') +
        '</td></tr>';
    });
    b += '</tbody></table></div>';
    b += '<div class="notice notice-warn" style="margin-top:14px">' +
      'การแก้ไขจะบันทึกในนามของกรรมการท่านนั้น และมีผลต่อคะแนนเฉลี่ยทันที ' +
      'ควรใช้เฉพาะตอนทดลองระบบหรือแก้ไขให้ตามที่กรรมการแจ้ง</div>';

    modal('จัดการผลการประเมิน', b, '<button class="btn" onclick="App.closeModal()">ปิด</button>');
  }

  function editEvaluation(assignmentId, evaluatorId) {
    closeModal();
    go('score', { a: assignmentId, ev: evaluatorId });
  }

  /* ล้างผลคะแนนทั้งหมด — ใช้หลังทดลองใช้ระบบ ก่อนเริ่มประเมินจริง
   * ลบเฉพาะคะแนน ไม่แตะรายชื่อบุคลากร กรรมการ หรือรอบการประเมิน */
  function clearAllEvaluations() {
    var rows = Store.all('evaluations');
    if (!rows.length) { toast('ยังไม่มีผลการประเมินให้ลบ', 'err'); return; }
    confirmDo('ลบผลการประเมินทั้งหมด ' + rows.length + ' รายการ? ' +
      'รายชื่อบุคลากร คณะกรรมการ และรอบการประเมินจะยังอยู่ครบ — ใช้เมื่อทดลองระบบเสร็จแล้ว',
      function () {
        rows.forEach(function (r) { Store.remove('evaluations', r.id); });
        toast('ล้างผลการประเมินแล้ว ' + rows.length + ' รายการ', 'ok');
        render();
      });
  }

  function deleteEvaluation(evaluationId, assignmentId) {
    var rec = Store.byId('evaluations', evaluationId);
    var ev = rec ? evaluatorById(rec.evaluatorId) : null;
    confirmDo('ลบผลการประเมินของ "' + (ev ? ev.name : '—') + '" ทั้งหมด? คะแนนที่กรอกไว้จะหายไป',
      function () {
        Store.remove('evaluations', evaluationId);
        toast('ลบผลการประเมินแล้ว', 'ok');
        manageEvaluations(assignmentId);
      });
  }

  /* ---------------------------------------------------------------------
   * หน้า: พิมพ์
   * ------------------------------------------------------------------- */

  PAGES.print = function (host, params) {
    var a = Store.byId('assignments', params.a);
    if (!a) { host.innerHTML = '<div class="empty">ไม่พบรอบการประเมิน</div>'; return; }
    var form = FORMS[a.formKey];
    var p = personById(a.personId);
    if (!form || !p) { host.innerHTML = '<div class="empty">ข้อมูลไม่ครบถ้วน</div>'; return; }

    if (session.role === 'evaluatee' && a.personId !== session.id) {
      host.innerHTML = '<div class="empty">ไม่มีสิทธิ์เข้าถึงเอกสารนี้</div>'; return;
    }
    if (session.role === 'evaluator' && (a.evaluatorIds || []).indexOf(session.id) < 0) {
      host.innerHTML = '<div class="empty">ไม่มีสิทธิ์เข้าถึงเอกสารนี้</div>'; return;
    }

    var mode = params.mode || 'full';
    var onlyEv = params.ev || (session.role === 'evaluator' ? session.id : '');

    $('page-title').textContent = 'พิมพ์แบบประเมิน — ' + Store.personFullName(p);
    $('page-sub').textContent = form.shortName;

    var h = '<div class="print-toolbar">' +
      '<button class="btn btn-primary" onclick="window.print()">🖨️ พิมพ์ / บันทึกเป็น PDF</button>' +
      '<select id="pr-mode">' +
      '<option value="full"' + (mode === 'full' ? ' selected' : '') + '>แบบเต็ม (ของกรรมการทุกคน + ใบสรุป)</option>' +
      '<option value="summary"' + (mode === 'summary' ? ' selected' : '') + '>เฉพาะใบสรุปผลของคณะกรรมการ</option>' +
      '<option value="blank"' + (mode === 'blank' ? ' selected' : '') + '>แบบฟอร์มเปล่า (ยังไม่ลงคะแนน)</option>' +
      '</select>' +
      '<select id="pr-ev"><option value="">กรรมการทุกคน</option>' +
      (a.evaluatorIds || []).map(function (id) {
        var e = evaluatorById(id);
        return '<option value="' + id + '"' + (onlyEv === id ? ' selected' : '') + '>' +
          esc(e ? e.name : id) + '</option>';
      }).join('') + '</select>' +
      '<div style="flex:1"></div>' +
      '<span class="sub">แนะนำ: ในกล่องพิมพ์ให้เลือก “ปลายทาง = บันทึกเป็น PDF”, ขนาด A4, ระยะขอบ = ไม่มี/None</span>' +
      '</div>';
    h += '<div class="preview-stage" id="pr-stage"></div>';
    host.innerHTML = h;

    function draw() {
      var m = val('pr-mode');
      var pick = val('pr-ev');
      var evs = [];
      if (m !== 'blank') {
        (a.evaluatorIds || []).forEach(function (id) {
          if (pick && id !== pick) return;
          var e = evaluationOf(a.id, id);
          if (!e) return;
          evs.push({
            evaluator: evaluatorById(id),
            scores: e.scores || {},
            notes: e.notes || {},
            workloadPass: e.workloadPass,
            contractDecision: e.contractDecision,
            submittedAt: e.submittedAt,
            result: evaluateForm(form, e.scores || {})
          });
        });
      }
      var ctx = {
        form: form, person: p, settings: Store.getSettings(),
        assignment: a, leave: (leaveOf(a.personId, a.year) || {}),
        evals: evs, mode: m
      };
      $('pr-stage').innerHTML = Print.build(ctx);
      if (m !== 'blank' && !evs.length) {
        $('pr-stage').innerHTML = '<div class="empty" style="background:#fff;border-radius:8px">' +
          'ยังไม่มีผลคะแนนสำหรับตัวเลือกนี้ — เลือก “แบบฟอร์มเปล่า” เพื่อพิมพ์ฟอร์มไว้กรอกมือ</div>';
      }
    }
    $('pr-mode').onchange = draw;
    $('pr-ev').onchange = draw;
    draw();
  };

  /* ---------------------------------------------------------------------
   * หน้าของผู้รับการประเมิน
   * ------------------------------------------------------------------- */

  PAGES.profile = function (host) {
    var p = personById(session.id);
    if (!p) { host.innerHTML = '<div class="empty">ไม่พบข้อมูลของท่าน</div>'; return; }
    var s = Store.getSettings();
    var year = Number(s.budgetYear) || 2568;
    var lv = leaveOf(p.id, year) || { id: 'lv_' + p.id + '_' + year, personId: p.id, year: year, r1: {}, r2: {} };

    var h = '<div class="card"><div class="card-head"><h2>ข้อมูลส่วนตัว</h2>' +
      '<div class="sub">ข้อมูลนี้จะถูกนำไปพิมพ์บนแบบประเมิน</div></div><div class="card-body">';
    h += '<div class="notice notice-info">ตำแหน่ง <b>' + esc(Store.positionLabel(p)) + '</b> — ' +
      'หากตำแหน่งไม่ถูกต้อง กรุณาแจ้งผู้ดูแลระบบ (ท่านแก้เองไม่ได้)</div>';
    h += '<div class="grid grid-3">' +
      field('pf-prefix', 'คำนำหน้า', selectHtml('pf-prefix', ['นาย', 'นาง', 'นางสาว'], p.prefix)) +
      field('pf-first', 'ชื่อ', '<input type="text" id="pf-first" value="' + esc(p.firstName) + '">') +
      field('pf-last', 'นามสกุล', '<input type="text" id="pf-last" value="' + esc(p.lastName) + '">') +
      '</div>';
    h += '<div class="grid grid-3">' +
      field('pf-salary', 'เงินเดือน / ค่าตอบแทน (บาท)', '<input type="number" id="pf-salary" value="' + esc(p.salary || '') + '">') +
      field('pf-rank', 'อันดับ คศ.', '<input type="text" id="pf-rank" value="' + esc(p.salaryRank || '') + '">') +
      field('pf-group', 'กลุ่มงาน / กลุ่มสาระฯ', '<input type="text" id="pf-group" value="' + esc(p.workGroup || '') + '">') +
      '</div>';
    h += '<div class="grid grid-3">' +
      field('pf-level', 'สอนระดับชั้น', '<input type="text" id="pf-level" value="' + esc(p.teachLevel || '') + '">') +
      field('pf-subject', 'วิชาที่สอน', '<input type="text" id="pf-subject" value="' + esc(p.subject || '') + '">') +
      field('pf-hours', 'ชั่วโมงสอน/สัปดาห์', '<input type="number" id="pf-hours" value="' + esc(p.teachHours || '') + '">') +
      '</div>';
    h += field('pf-duties', 'รายละเอียดหน้าที่ความรับผิดชอบ',
      '<textarea id="pf-duties">' + esc(p.duties || '') + '</textarea>');
    h += '<div class="btn-row"><button class="btn btn-primary" id="pf-save">บันทึกข้อมูลส่วนตัว</button></div>';
    h += '</div></div>';

    /* วันลา */
    h += '<div class="card"><div class="card-head"><h2>สถิติวันลาและการมาสาย</h2>' +
      '<div class="sub">ปีงบประมาณ ' + year + '</div></div><div class="card-body">';
    h += '<div class="table-wrap"><table class="data"><thead><tr><th>รายการ</th>' +
      '<th class="num" colspan="2">' + esc(roundRange('r1', year).label) + '</th>' +
      '<th class="num" colspan="2">' + esc(roundRange('r2', year).label) + '</th></tr>' +
      '<tr><th></th><th class="num">ครั้ง</th><th class="num">วัน</th>' +
      '<th class="num">ครั้ง</th><th class="num">วัน</th></tr></thead><tbody>';
    var kinds = [
      { k: 'late', label: 'มาสาย' }, { k: 'personal', label: 'ลากิจส่วนตัว' },
      { k: 'sick', label: 'ลาป่วย' }, { k: 'maternity', label: 'ลาคลอดบุตร' },
      { k: 'other', label: 'กรณีอื่น ๆ' }
    ];
    kinds.forEach(function (kd) {
      h += '<tr><td>' + esc(kd.label) + '</td>';
      ['r1', 'r2'].forEach(function (r) {
        ['times', 'days'].forEach(function (u) {
          var v = ((lv[r] || {})[kd.k] || {})[u];
          h += '<td class="num"><input type="number" min="0" style="width:74px;text-align:center" ' +
            'id="lv-' + r + '-' + kd.k + '-' + u + '" value="' + (v === undefined ? '' : esc(v)) + '"></td>';
        });
      });
      h += '</tr>';
    });
    h += '</tbody></table></div>';
    h += '<div class="btn-row" style="margin-top:12px"><button class="btn btn-primary" id="lv-save">บันทึกสถิติวันลา</button></div>';
    h += '</div></div>';

    host.innerHTML = h;

    $('pf-save').onclick = function () {
      var np = Store.clone(p);
      np.prefix = val('pf-prefix');
      np.firstName = val('pf-first');
      np.lastName = val('pf-last');
      np.salary = numval('pf-salary');
      np.salaryRank = val('pf-rank');
      np.workGroup = val('pf-group');
      np.teachLevel = val('pf-level');
      np.subject = val('pf-subject');
      np.teachHours = numval('pf-hours');
      np.duties = val('pf-duties');
      Store.upsert('people', np);
      session.name = Store.personFullName(np);
      Store.saveSession(session);
      $('me-name').textContent = session.name;
      toast('บันทึกข้อมูลแล้ว', 'ok');
    };

    $('lv-save').onclick = function () {
      var rec = { id: lv.id, personId: p.id, year: year, r1: {}, r2: {} };
      ['r1', 'r2'].forEach(function (r) {
        kinds.forEach(function (kd) {
          var t = val('lv-' + r + '-' + kd.k + '-times');
          var d = val('lv-' + r + '-' + kd.k + '-days');
          if (t !== '' || d !== '') {
            rec[r][kd.k] = { times: t === '' ? '' : Number(t), days: d === '' ? '' : Number(d) };
          }
        });
      });
      Store.upsert('leaveRecords', rec);
      toast('บันทึกสถิติวันลาแล้ว', 'ok');
    };
  };

  PAGES.files = function (host) {
    var pid = session.role === 'evaluatee' ? session.id : null;
    if (!pid) { host.innerHTML = '<div class="empty">—</div>'; return; }
    var h = '<div class="card"><div class="card-head"><h2>แนบเอกสารประกอบการประเมิน</h2>' +
      '<div class="sub">คณะกรรมการจะเห็นไฟล์เหล่านี้ตอนให้คะแนน</div></div><div class="card-body">';
    h += '<div class="grid grid-2">' +
      '<div><div class="field"><label>ประเภทเอกสาร</label>' +
      '<select id="fl-kind"><option value="booklet">เล่มรายงาน / เอกสารประกอบ</option>' +
      '<option value="presentation">ไฟล์นำเสนอ</option>' +
      '<option value="other">อื่น ๆ</option></select></div>' +
      '<div class="dropzone" id="fl-drop"></div>' +
      '<input type="file" id="fl-input" style="display:none">' +
      '</div>' +
      '<div><div class="field"><label>หรือแนบเป็นลิงก์ (Google Drive ฯลฯ)</label>' +
      '<input type="text" id="fl-link" placeholder="https://..."></div>' +
      '<div class="field"><label>ชื่อที่จะแสดง</label><input type="text" id="fl-linkname" placeholder="เช่น เล่มรายงาน PA ปี 2568"></div>' +
      '<button class="btn" id="fl-addlink">เพิ่มลิงก์</button></div>' +
      '</div>';
    h += '<div id="fl-list" style="margin-top:18px"></div>';
    h += '</div></div>';
    host.innerHTML = h;

    $('fl-drop').onclick = function () { $('fl-input').click(); };
    $('fl-drop').ondragover = function (e) { e.preventDefault(); };
    $('fl-drop').ondrop = function (e) {
      e.preventDefault();
      if (e.dataTransfer.files.length) uploadFile(pid, e.dataTransfer.files[0], val('fl-kind'));
    };
    $('fl-input').onchange = function () {
      if (this.files.length) uploadFile(pid, this.files[0], val('fl-kind'));
      this.value = '';
    };
    $('fl-addlink').onclick = function () {
      var url = val('fl-link');
      if (!url) { toast('กรุณาใส่ลิงก์', 'err'); return; }
      Store.upsert('attachments', {
        personId: pid, personName: Store.personFullName(personById(pid)),
        kind: val('fl-kind'), name: val('fl-linkname') || url,
        link: url, driveId: '', size: 0, uploadedAt: Store.nowISO()
      });
      $('fl-link').value = ''; $('fl-linkname').value = '';
      toast('เพิ่มลิงก์แล้ว', 'ok');
      drawFiles(pid);
    };
    resetDropzone();
    drawFiles(pid);
  };

  function uploadFile(personId, file, kind) {
    if (file.size > 20 * 1024 * 1024) { toast('ไฟล์ใหญ่เกิน 20 MB — แนะนำให้แนบเป็นลิงก์แทน', 'err'); return; }
    var p = personById(personId);
    var drop = $('fl-drop');
    if (drop) drop.textContent = 'กำลังอัปโหลด “' + file.name + '” …';
    Store.uploadAttachment(file, {
      personId: personId,
      personName: Store.personFullName(p),
      kind: kind
    }).then(function (rec) {
      Store.upsert('attachments', rec);
      toast(rec.link ? 'อัปโหลดขึ้น Google Drive แล้ว' : 'บันทึกไฟล์ในเครื่องนี้แล้ว', 'ok');
      resetDropzone();
      drawFiles(personId);
    })['catch'](function (e) {
      toast('อัปโหลดไม่สำเร็จ: ' + e.message, 'err');
      resetDropzone();
    });
  }

  function resetDropzone() {
    var drop = $('fl-drop');
    if (!drop) return;
    drop.innerHTML = 'คลิกเพื่อเลือกไฟล์ หรือลากไฟล์มาวางที่นี่<br>' +
      '<span class="small">' + (Store.gsConfigured()
        ? 'ไฟล์จะถูกอัปขึ้น Google Drive ให้กรรมการเปิดดูได้จากทุกเครื่อง'
        : 'ยังไม่ได้เชื่อม Google Drive — ไฟล์จะเก็บในเบราว์เซอร์เครื่องนี้เท่านั้น') +
      ' · ไม่เกิน 20 MB ต่อไฟล์</span>';
  }

  function drawFiles(personId) {
    var rows = Store.where('attachments', function (a) { return a.personId === personId; });
    var host = $('fl-list');
    if (!host) return;
    if (!rows.length) { host.innerHTML = '<div class="empty">ยังไม่มีเอกสารแนบ</div>'; return; }
    var kindLabel = { booklet: 'เล่มรายงาน', presentation: 'ไฟล์นำเสนอ', other: 'อื่น ๆ' };
    host.innerHTML = rows.map(function (a) {
      return '<div class="file-row"><div>' +
        '<div class="nm">' + esc(a.name) + '</div>' +
        '<div class="mt">' + esc(kindLabel[a.kind] || a.kind) + ' · ' +
        (a.link ? 'ลิงก์ภายนอก' : fmtSize(a.size)) + ' · ' + esc(formatThaiDate(a.uploadedAt)) + '</div></div>' +
        '<div class="spacer"></div>' +
        '<button class="btn btn-sm" onclick="App.openFile(\'' + a.id + '\')">เปิด</button>' +
        '<button class="btn btn-sm btn-danger" onclick="App.deleteFile(\'' + a.id + '\')">ลบ</button></div>';
    }).join('');
  }

  function fmtSize(b) {
    if (!b) return '—';
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
    return (b / 1048576).toFixed(1) + ' MB';
  }

  function openFile(id) {
    var a = Store.byId('attachments', id);
    if (!a) return;
    if (a.link) { window.open(a.link, '_blank', 'noopener'); return; }
    Store.readFileBlob(id).then(function (blob) {
      if (!blob) {
        toast('ไม่พบไฟล์ — ไฟล์นี้ถูกอัปโหลดไว้ก่อนเชื่อม Google Drive จึงอยู่เฉพาะบนเครื่องที่อัปโหลด', 'err');
        return;
      }
      var url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener');
      setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
    });
  }

  function deleteFile(id) {
    var a = Store.byId('attachments', id);
    confirmDo('ลบไฟล์นี้?' + (a && a.driveId ? ' (จะย้ายไฟล์ใน Google Drive ไปถังขยะด้วย)' : ''), function () {
      Store.removeAttachment(a);
      toast('ลบแล้ว', 'ok');
      drawFiles(a ? a.personId : session.id);
    });
  }

  function viewFiles(personId) {
    var rows = Store.where('attachments', function (a) { return a.personId === personId; });
    var kindLabel = { booklet: 'เล่มรายงาน', presentation: 'ไฟล์นำเสนอ', other: 'อื่น ๆ' };
    var b = rows.length ? rows.map(function (a) {
      return '<div class="file-row"><div><div class="nm">' + esc(a.name) + '</div>' +
        '<div class="mt">' + esc(kindLabel[a.kind] || a.kind) + ' · ' +
        (a.link ? 'ลิงก์ภายนอก' : fmtSize(a.size)) + '</div></div><div class="spacer"></div>' +
        '<button class="btn btn-sm" onclick="App.openFile(\'' + a.id + '\')">เปิด</button></div>';
    }).join('') : '<div class="empty">ไม่มีเอกสารแนบ</div>';
    modal('เอกสารประกอบการประเมิน', b, '<button class="btn" onclick="App.closeModal()">ปิด</button>');
  }

  PAGES.myresult = function (host) {
    var rows = assignmentsFor('evaluatee');
    if (!rows.length) {
      host.innerHTML = '<div class="card"><div class="empty">ยังไม่มีรอบการประเมินของท่าน</div></div>';
      return;
    }
    var h = '';
    rows.slice().reverse().forEach(function (a) {
      var f = FORMS[a.formKey];
      var r = assignmentResult(a);
      var expected = (a.evaluatorIds || []).length;
      h += '<div class="card"><div class="card-head"><h2>' + esc(f ? f.shortName : a.formKey) + '</h2>' +
        '<div class="sub">' + esc(roundRange(a.round, a.year).label + ' ปีงบประมาณ ' + a.year) + '</div>' +
        '<div class="spacer"></div>' + resultTag(a, r) + '</div><div class="card-body">';
      if (!r) {
        h += '<div class="notice notice-warn">คณะกรรมการยังไม่ได้ส่งผลการประเมิน (' + expected + ' คน)</div>';
      } else {
        h += '<div class="kpi" style="grid-template-columns:repeat(3,1fr)">' +
          kpiBox('คะแนนเฉลี่ย', n2(r.avgTotal), 'จาก ' + f.totalMax + ' คะแนน') +
          kpiBox('คิดเป็นร้อยละ', n2(r.avgPercent), 'ร้อยละ') +
          kpiBox('ผลการประเมิน', r.grade, 'กรรมการ ' + r.count + ' จาก ' + expected + ' คน') +
          '</div>';
        if (r.count < expected) {
          h += '<div class="notice notice-warn">ยังรอผลจากกรรมการอีก ' + (expected - r.count) + ' คน — คะแนนอาจเปลี่ยนแปลงได้</div>';
        }
      }
      h += '<div class="btn-row">' +
        '<button class="btn btn-primary" onclick="App.go(\'print\',{a:\'' + a.id + '\',mode:\'summary\'})">ดู / พิมพ์ใบสรุปผล</button>' +
        '<button class="btn" onclick="App.go(\'print\',{a:\'' + a.id + '\',mode:\'full\'})">พิมพ์แบบประเมินฉบับเต็ม</button>' +
        '</div>';
      h += '</div></div>';
    });
    host.innerHTML = h;
  };

  /* ---------------------------------------------------------------------
   * หน้า: ตั้งค่าระบบ
   * ------------------------------------------------------------------- */

  PAGES.settings = function (host) {
    var s = Store.getSettings();
    var h = '<div class="card"><div class="card-head"><h2>ข้อมูลหน่วยงาน</h2></div><div class="card-body">' +
      '<div class="grid grid-2">' +
      field('st-org', 'ชื่อสถานศึกษา / หน่วยงาน', '<input type="text" id="st-org" value="' + esc(s.orgName) + '">') +
      field('st-aff', 'สังกัด', '<input type="text" id="st-aff" value="' + esc(s.affiliation) + '">') +
      field('st-dname', 'ชื่อผู้อำนวยการ / ประธานกรรมการ', '<input type="text" id="st-dname" value="' + esc(s.directorName) + '">') +
      field('st-dtitle', 'ตำแหน่งผู้อำนวยการ', '<input type="text" id="st-dtitle" value="' + esc(s.directorTitle) + '">') +
      field('st-year', 'ปีงบประมาณปัจจุบัน (พ.ศ.)', '<input type="number" id="st-year" value="' + esc(s.budgetYear) + '">') +
      '</div>' +
      '<button class="btn btn-primary" id="st-save-org">บันทึก</button></div></div>';

    h += '<div class="card"><div class="card-head"><h2>บัญชีผู้ดูแลระบบ</h2></div><div class="card-body">' +
      '<div class="grid grid-2">' +
      field('st-au', 'ชื่อผู้ใช้', '<input type="text" id="st-au" value="' + esc(s.adminUser) + '">') +
      field('st-ap', 'รหัสผ่าน', '<input type="text" id="st-ap" value="' + esc(s.adminPass) + '">') +
      '</div>' +
      '<div class="notice notice-warn">ระบบนี้ออกแบบสำหรับใช้ภายในหน่วยงาน รหัสผ่านถูกเก็บแบบง่าย ' +
      'ไม่ควรใช้รหัสผ่านเดียวกับบัญชีสำคัญอื่น</div>' +
      '<button class="btn btn-primary" id="st-save-admin">บันทึก</button></div></div>';

    h += '<div class="card"><div class="card-head"><h2>ฐานข้อมูล Google Sheets</h2>' +
      '<div class="sub">เชื่อมต่อเพื่อให้ทุกเครื่องใช้ข้อมูลชุดเดียวกัน และเก็บไฟล์แนบใน Google Drive</div></div>' +
      '<div class="card-body">' +
      '<div class="notice notice-info">ถ้ายังไม่ตั้งค่า ระบบจะเก็บข้อมูลไว้ในเบราว์เซอร์เครื่องนี้เท่านั้น ' +
      'ใช้งานได้ปกติแต่เครื่องอื่นจะไม่เห็นข้อมูล<br>' +
      'วิธีติดตั้ง: เปิด <b>script.google.com</b> → New project → วางโค้ดจากไฟล์ ' +
      '<b>google_apps_script/Code.gs</b> → Deploy เป็น <b>Web app</b> ' +
      '(Execute as: <b>Me</b>, Who has access: <b>Anyone</b>) → คัดลอก URL ที่ลงท้ายด้วย <b>/exec</b> มาวางด้านล่าง</div>' +
      field('st-gsurl', 'Web app URL (ลงท้ายด้วย /exec)',
        '<input type="text" id="st-gsurl" value="' + esc(s.gsUrl || '') + '" placeholder="https://script.google.com/macros/s/.../exec">') +
      field('st-gskey', 'รหัสลับ API (ไม่บังคับ)',
        '<input type="text" id="st-gskey" value="' + esc(s.gsKey || '') + '">',
        'ถ้าตั้ง Script Property ชื่อ API_KEY ไว้ใน Apps Script ให้กรอกค่าเดียวกันที่นี่') +
      '<div class="btn-row">' +
      '<button class="btn btn-primary" id="st-gs-connect">บันทึกและทดสอบการเชื่อมต่อ</button>' +
      '<button class="btn" id="st-gs-pull">ดึงข้อมูลจาก Google Sheets</button>' +
      '<button class="btn" id="st-gs-push">ส่งข้อมูลในเครื่องขึ้น Google Sheets</button>' +
      '</div>' +
      '<div id="st-gsstatus" class="small" style="margin-top:10px"></div>' +
      '</div></div>';

    var nEval = Store.all('evaluations').length;
    h += '<div class="card"><div class="card-head"><h2>ข้อมูลทดลองใช้ระบบ</h2>' +
      '<div class="sub">ล้างคะแนนที่กรอกไว้ตอนทดลอง ก่อนเริ่มประเมินจริง</div></div><div class="card-body">' +
      '<div class="notice notice-info">ขณะนี้มีผลการประเมินที่บันทึกไว้ <b>' + nEval + '</b> รายการ<br>' +
      'การล้างจะลบเฉพาะ<b>คะแนนและข้อสังเกต</b> — รายชื่อบุคลากร คณะกรรมการ และรอบการประเมินทั้ง ' +
      Store.all('assignments').length + ' รายการยังอยู่ครบ</div>' +
      '<button class="btn btn-danger" onclick="App.clearAllEvaluations()"' + (nEval ? '' : ' disabled') + '>' +
      'ล้างผลการประเมินทั้งหมด</button>' +
      '</div></div>';

    h += '<div class="card"><div class="card-head"><h2>สำรอง / กู้คืนข้อมูล</h2></div><div class="card-body">' +
      '<div class="btn-row">' +
      '<button class="btn" id="st-export">ดาวน์โหลดไฟล์สำรอง (.json)</button>' +
      '<button class="btn" id="st-import-btn">นำเข้าไฟล์สำรอง</button>' +
      '<input type="file" id="st-import" accept=".json" style="display:none">' +
      '</div>' +
      '<div class="notice notice-warn" style="margin-top:12px">การนำเข้าจะเขียนทับข้อมูลปัจจุบันทั้งหมด ' +
      'ไฟล์แนบที่เก็บในเครื่องจะไม่รวมอยู่ในไฟล์สำรอง</div>' +
      '</div></div>';

    host.innerHTML = h;

    $('st-save-org').onclick = function () {
      Store.saveSettings({
        orgName: val('st-org'), affiliation: val('st-aff'),
        directorName: val('st-dname'), directorTitle: val('st-dtitle'),
        budgetYear: val('st-year')
      });
      $('brand-org').textContent = val('st-org');
      toast('บันทึกแล้ว', 'ok');
    };
    $('st-save-admin').onclick = function () {
      if (!val('st-au') || !val('st-ap')) { toast('กรอกให้ครบ', 'err'); return; }
      Store.saveSettings({ adminUser: val('st-au'), adminPass: val('st-ap') });
      toast('บันทึกบัญชีผู้ดูแลแล้ว', 'ok');
    };
    function gsStatus(html) { $('st-gsstatus').innerHTML = html; }

    $('st-gs-connect').onclick = function () {
      var url = val('st-gsurl');

      /* URL ที่ได้จากแถบที่อยู่หลังเบราว์เซอร์เด้งไปแล้ว ใช้ไม่ได้ —
         มันมีคีย์ชั่วคราวที่หมดอายุ ต้องใช้ /exec ต้นทางเท่านั้น */
      if (/googleusercontent\.com/.test(url)) {
        gsStatus('<span class="tag tag-danger">ใช้ URL นี้ไม่ได้</span> ' +
          'นี่คือที่อยู่ปลายทางหลังเบราว์เซอร์เด้งไปแล้ว (มีคีย์ชั่วคราวที่จะหมดอายุ)<br>' +
          'ให้กลับไปที่ Apps Script → <b>Deploy → Manage deployments</b> → คัดลอก <b>Web app URL</b> ' +
          'ที่ขึ้นต้นด้วย <code>https://script.google.com/macros/s/…</code> และลงท้ายด้วย <code>/exec</code>');
        return;
      }
      /* /dev คือลิงก์ทดสอบ ใช้ได้เฉพาะเจ้าของสคริปต์ที่ล็อกอินอยู่ —
         ถ้าปล่อยผ่านจะใช้ได้ในเครื่องผู้ติดตั้ง แต่กรรมการคนอื่นเปิดไม่ได้ */
      if (/\/dev\/?$/.test(url)) {
        gsStatus('<span class="tag tag-danger">ใช้ URL นี้ไม่ได้</span> ' +
          'นี่คือลิงก์ทดสอบ (/dev) ที่ใช้ได้เฉพาะบัญชีเจ้าของสคริปต์เท่านั้น เครื่องอื่นจะเปิดไม่ได้<br>' +
          'ต้องใช้ลิงก์ที่ลงท้ายด้วย <code>/exec</code> ซึ่งได้จาก ' +
          '<b>Deploy → New deployment</b> (หรือ <b>Manage deployments</b> ถ้าเคย Deploy แล้ว)');
        return;
      }
      /* คัดลอกมาไม่ครบทั้งบรรทัด เป็นสาเหตุที่พบบ่อยที่สุด */
      if (url && !/^https:\/\/script\.google\.com\/macros\/s\//.test(url)) {
        gsStatus('<span class="tag tag-danger">URL ไม่ครบ</span> ' +
          'ต้องขึ้นต้นด้วย <code>https://script.google.com/macros/s/</code><br>' +
          'ที่ใส่ไว้ตอนนี้ขึ้นต้นด้วย “<code>' + esc(url.slice(0, 30)) + '…</code>” ' +
          'ดูเหมือนคัดลอกมาไม่ครบทั้งบรรทัด — ลองลากคลุมให้สุดตั้งแต่ <code>https</code> ' +
          'หรือกดปุ่มคัดลอกในหน้า Manage deployments แทนการลากเมาส์');
        return;
      }
      if (url && !/\/exec\/?$/.test(url)) {
        gsStatus('<span class="tag tag-danger">URL ไม่ครบ</span> ' +
          'ต้องลงท้ายด้วย <code>/exec</code> — ตรวจว่าคัดลอกมาครบทั้งบรรทัด');
        return;
      }
      Store.saveSettings({ gsUrl: url, gsKey: val('st-gskey') });
      if (!url) { updateSyncBadge(); toast('ล้างการเชื่อมต่อแล้ว — กลับไปเก็บข้อมูลในเครื่อง', 'ok'); return; }
      gsStatus('กำลังเชื่อมต่อ…');
      Store.gsCall('setup').then(function (res) {
        var created = (res.created || []);
        gsStatus('<span class="tag tag-ok">เชื่อมต่อสำเร็จ</span> ' +
          (created.length ? 'สร้างชีตใหม่: ' + esc(created.join(', ')) : 'พบชีตครบแล้ว') +
          ' — กด “ส่งข้อมูลในเครื่องขึ้น Google Sheets” หากต้องการอัปโหลดข้อมูลที่มีอยู่');
        return Store.gsPull();
      }).then(function () {
        updateSyncBadge();
      })['catch'](function (e) {
        gsStatus('<span class="tag tag-danger">เชื่อมต่อไม่สำเร็จ</span> ' + esc(e.message));
        updateSyncBadge();
      });
    };

    $('st-gs-pull').onclick = function () {
      gsStatus('กำลังดึงข้อมูล…');
      Store.gsPull().then(function (ok) {
        updateSyncBadge();
        gsStatus(ok ? '<span class="tag tag-ok">ดึงข้อมูลเรียบร้อย</span>'
          : '<span class="tag tag-danger">ดึงข้อมูลไม่สำเร็จ</span> ' + esc(Store.syncState().error || ''));
        if (ok) toast('ดึงข้อมูลจาก Google Sheets แล้ว', 'ok');
      });
    };

    $('st-gs-push').onclick = function () {
      confirmDo('ส่งข้อมูลทั้งหมดในเครื่องนี้ขึ้น Google Sheets? ' +
        'แถวที่มี id ตรงกันบนชีตจะถูกเขียนทับด้วยข้อมูลในเครื่อง', function () {
        gsStatus('กำลังส่งข้อมูล… (อาจใช้เวลาสักครู่)');
        Store.gsPushAll().then(function (ok) {
          updateSyncBadge();
          gsStatus(ok ? '<span class="tag tag-ok">ส่งข้อมูลขึ้น Google Sheets แล้ว</span>'
            : '<span class="tag tag-danger">ส่งข้อมูลไม่สำเร็จ</span> ' + esc(Store.syncState().error || ''));
        });
      });
    };
    $('st-export').onclick = function () {
      var blob = new Blob([Store.exportJSON()], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'สำรองข้อมูลระบบประเมิน-' + new Date().toISOString().slice(0, 10) + '.json';
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
    };
    $('st-import-btn').onclick = function () { $('st-import').click(); };
    $('st-import').onchange = function () {
      var f = this.files[0];
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function () {
        confirmDo('นำเข้าข้อมูลและเขียนทับข้อมูลปัจจุบันทั้งหมด?', function () {
          try {
            Store.importJSON(reader.result);
            toast('นำเข้าเรียบร้อย', 'ok');
            render();
          } catch (e) { toast('ไฟล์ไม่ถูกต้อง: ' + e.message, 'err'); }
        });
      };
      reader.readAsText(f);
      this.value = '';
    };
  };

  /* ---------------------------------------------------------------------
   * เริ่มต้น
   * ------------------------------------------------------------------- */

  /* เทียบเวอร์ชันกับไฟล์บนเซิร์ฟเวอร์ ถ้าเบราว์เซอร์ยังใช้ไฟล์เก่าที่ค้างในแคช
   * จะพาไปที่ URL ใหม่ (เปลี่ยน query) ซึ่งบังคับให้โหลดใหม่ทั้งหมด
   * ผู้ใช้ไม่ต้องรู้จักการล้างแคชเอง */
  function checkForUpdate() {
    if (location.protocol !== 'http:' && location.protocol !== 'https:') return;
    if (typeof fetch !== 'function') return;
    fetch('version.json?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j || !j.version || j.version === APP_VERSION) return;
        var key = 'pa_reload_' + j.version;
        /* กันวนซ้ำ: ถ้าโหลดใหม่ไปแล้วรอบหนึ่งแต่ยังไม่ตรง ก็ปล่อยไว้ */
        try {
          if (sessionStorage.getItem(key)) return;
          sessionStorage.setItem(key, '1');
        } catch (e) { return; }
        location.replace(location.pathname + '?v=' + encodeURIComponent(j.version));
      })['catch'](function () { /* ไม่มีไฟล์ version.json ก็ไม่เป็นไร */ });
  }

  function init() {
    checkForUpdate();
    bindLogin();
    Store.onChange(updateSyncBadge);
    /* ถ้ารายชื่อเพิ่งมาถึงจาก Google Sheets ตอนที่หน้าเข้าระบบยังว่างอยู่ ให้วาดใหม่
       (ไม่วาดทับตอนที่มีรายการอยู่แล้ว เพราะจะลบรหัสผ่านที่พิมพ์ไว้) */
    Store.onChange(function () {
      if (loginVisible() && loginRole !== 'admin' && !$('login-who')) renderLoginForm();
    });
    Store.init().then(function () {
      Store.seedIfEmpty();
      session = Store.getSession();
      if (session) {
        /* ตรวจว่าบัญชียังมีอยู่จริง */
        if (session.role === 'evaluator' && !evaluatorById(session.id)) session = null;
        if (session.role === 'evaluatee' && !personById(session.id)) session = null;
      }
      if (session) startApp(); else showLogin();
      window.addEventListener('hashchange', render);
    });
  }

  return {
    init: init, go: go, logout: logout, closeModal: closeModal,
    editPerson: editPerson, deletePerson: deletePerson,
    editEvaluator: editEvaluator, deleteEvaluator: deleteEvaluator,
    editAssignment: editAssignment, deleteAssignment: deleteAssignment,
    saveScore: saveScore, openFile: openFile, deleteFile: deleteFile, viewFiles: viewFiles,
    manageEvaluations: manageEvaluations, editEvaluation: editEvaluation,
    deleteEvaluation: deleteEvaluation, clearAllEvaluations: clearAllEvaluations
  };
})();

document.addEventListener('DOMContentLoaded', App.init);
