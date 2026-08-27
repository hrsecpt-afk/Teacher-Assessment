/* =========================================================================
 * print.js — สร้าง HTML ของแบบฟอร์มราชการสำหรับพิมพ์ / Save as PDF
 *
 * Print.build(ctx) → string (ชุดของ <div class="sheet">)
 * ctx = {
 *   form, person, settings, assignment, leave,
 *   evals: [{ evaluator, scores, notes, workloadPass, contractDecision, result }],
 *   mode: 'full' | 'summary' | 'blank'
 * }
 * ========================================================================= */

function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[&<>"']/g, function (m) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
  });
}

function n2(x) {
  if (x === null || x === undefined || isNaN(x)) return '';
  var v = Math.round(x * 100) / 100;
  return v.toFixed(2).replace(/\.00$/, '');
}

var Print = (function () {

  /* ---------- ชิ้นส่วนที่ใช้ร่วมกัน ---------- */

  function fill(value, cls) {
    var v = (value === undefined || value === null || value === '') ? '' : esc(value);
    return '<span class="fill ' + (cls || '') + '">' + (v || '&nbsp;') + '</span>';
  }

  function box(on, label) {
    return '<span class="chkbox' + (on ? ' on' : '') + '"></span>' + (label ? esc(label) : '');
  }

  function blankLines(n) {
    var out = '<div class="note-lines">';
    for (var i = 0; i < n; i++) out += '<div class="ln"></div>';
    return out + '</div>';
  }

  function textOrLines(text, n) {
    if (text && String(text).trim()) {
      return '<div class="note-lines"><div class="filled">' + esc(text).replace(/\n/g, '<br>') + '</div></div>';
    }
    return blankLines(n);
  }

  function signBlock(name, title, dateText, roleLabel) {
    return '<div class="sign-block right">' +
      '(ลงชื่อ) ' + fill(name, 'wide') + ' ' + esc(roleLabel || 'กรรมการผู้ประเมิน') + '<br>' +
      '( ' + fill(name, 'wide') + ' )<br>' +
      'ตำแหน่ง ' + fill(title, 'wide') + '<br>' +
      'วันที่ ' + fill(dateText, 'grow') +
      '</div>';
  }

  function docHead(form, ctx, extraLine) {
    var s = ctx.settings || {};
    var h = '';
    if (form.code) h += '<div class="form-code">' + esc(form.code) + '</div>';
    h += '<div class="doc-head">';
    h += '<div class="t1">' + esc(form.title) + '</div>';
    if (form.positionLine) h += '<div class="t2">' + esc(form.positionLine) + '</div>';
    if (form.scope) h += '<div class="t3">' + esc(form.scope) + '</div>';
    if (extraLine) h += '<div class="t3">' + extraLine + '</div>';
    h += '</div>';
    return h;
  }

  function roundLine(ctx) {
    var r = roundRange(ctx.assignment.round, ctx.assignment.year);
    return 'รอบการประเมิน ' + esc(r.label) + ' ระหว่างวันที่ ' + fill(r.startParts.day) +
      ' เดือน ' + fill(r.startParts.month, 'grow') + ' พ.ศ. ' + fill(r.startParts.year) +
      ' ถึงวันที่ ' + fill(r.endParts.day) + ' เดือน ' + fill(r.endParts.month, 'grow') +
      ' พ.ศ. ' + fill(r.endParts.year);
  }

  function todayThai() {
    var d = new Date();
    return d.getDate() + ' ' + THAI_MONTHS[d.getMonth()] + ' ' + (d.getFullYear() + 543);
  }

  /* ตารางให้คะแนนแบบ "ระดับ 1–4" หรือ "1–5" (ทำเครื่องหมาย ✓ ในช่องระดับ) */
  function levelTable(section, scores, opt) {
    opt = opt || {};
    var levels = section.input === 'level5' ? 5 : 4;
    var headers = opt.levelHeaders || null;
    var showPoints = opt.showPoints !== false;

    var h = '<table class="form"><thead><tr>';
    h += '<th style="width:auto">รายการประเมิน</th>';
    for (var L = 1; L <= levels; L++) {
      h += '<th style="width:26px">' + (headers ? esc(headers[L - 1]) : L) + '</th>';
    }
    if (showPoints) h += '<th style="width:52px">คะแนน<br>ที่ได้</th>';
    if (opt.remarkCol) h += '<th style="width:110px">' + esc(opt.remarkCol) + '</th>';
    h += '</tr></thead><tbody>';

    var groupTitles = section.groupsBy || null;
    var lastGroup = -1;

    for (var i = 0; i < section.items.length; i++) {
      var it = section.items[i];
      if (groupTitles) {
        var gi = groupIndexOf(it.no, groupTitles.length);
        if (gi !== lastGroup && groupTitles[gi]) {
          h += '<tr class="group"><td colspan="' + (1 + levels + (showPoints ? 1 : 0) + (opt.remarkCol ? 1 : 0)) + '">' +
            esc(groupTitles[gi]) + '</td></tr>';
          lastGroup = gi;
        }
      }
      var v = scores[scoreKey(section.id, i)];
      var lvl = parseInt(v, 10);
      h += '<tr>';
      h += '<td>' + (it.no ? '<b>' + esc(it.no) + '</b> ' : '') + esc(it.text) +
        (it.max && section.scaled ? ' <b>(' + it.max + ' คะแนน)</b>' : '') +
        (it.weight && section.weighted ? ' <b>(น้ำหนัก ' + it.weight + ')</b>' : '') +
        (it.detail ? '<span class="idesc">◆ ' + esc(it.detail) + '</span>' : '') + '</td>';
      for (var L2 = 1; L2 <= levels; L2++) {
        h += '<td class="c">' + (lvl === L2 ? '<span class="mark">✓</span>' : '') + '</td>';
      }
      if (showPoints) {
        h += '<td class="num">' + (isNaN(lvl) ? '' : n2(itemPoints(section, it, lvl))) + '</td>';
      }
      if (opt.remarkCol) h += '<td></td>';
      h += '</tr>';
    }

    var raw = sectionRaw(section, scores);
    var span = 1 + levels;
    h += '<tr class="total"><td colspan="' + span + '" class="r">คะแนนรวม</td>';
    if (showPoints) h += '<td class="num">' + n2(raw) + '</td>';
    if (opt.remarkCol) h += '<td></td>';
    h += '</tr>';

    if (section.formula) {
      h += '<tr class="total"><td colspan="' + span + '" class="r">' + esc(section.formula) + '</td>';
      if (showPoints) h += '<td class="num">' + n2(section.convert(raw, section)) + '</td>';
      if (opt.remarkCol) h += '<td></td>';
      h += '</tr>';
    }
    h += '</tbody></table>';
    return h;
  }

  /* หาว่าเลขข้อ "1.3" อยู่ในกลุ่มที่เท่าไร */
  function groupIndexOf(no, count) {
    var first = String(no || '').replace(/[^0-9๐-๙]/g, '').charAt(0);
    var thaiDigits = '๐๑๒๓๔๕๖๗๘๙';
    var idx = thaiDigits.indexOf(first);
    var n = idx >= 0 ? idx : parseInt(first, 10);
    if (isNaN(n) || n < 1) return 0;
    return Math.min(n - 1, count - 1);
  }

  /* ตารางกรอกคะแนนตรง (ครูอัตราจ้าง/ธุรการ/จ้างเหมา) */
  function pointsTable(section, scores, opt) {
    opt = opt || {};
    var h = '<table class="form"><thead><tr>';
    h += '<th>รายการประเมิน</th><th style="width:56px">คะแนน<br>เต็ม</th>';
    if (opt.selfCol) h += '<th style="width:60px">คะแนน<br>ประเมินตนเอง</th>';
    h += '<th style="width:62px">คะแนน<br>ที่ได้</th>';
    h += '<th style="width:150px">ข้อเสนอแนะ / ความคิดเห็น</th>';
    h += '</tr></thead><tbody>';

    var groupTitles = section.groupsBy || null;
    var lastGroup = -1;
    var cols = 3 + (opt.selfCol ? 1 : 0) + 1;

    for (var i = 0; i < section.items.length; i++) {
      var it = section.items[i];
      if (groupTitles) {
        var gi = groupIndexOf(it.no, groupTitles.length);
        if (gi !== lastGroup && groupTitles[gi]) {
          h += '<tr class="group"><td colspan="' + cols + '">' + esc(groupTitles[gi]) + '</td></tr>';
          lastGroup = gi;
        }
      }
      var v = scores[scoreKey(section.id, i)];
      h += '<tr>';
      h += '<td>' + (it.no ? '<b>' + esc(it.no) + '</b> ' : '') + esc(it.text) + '</td>';
      h += '<td class="num">' + it.max + '</td>';
      if (opt.selfCol) h += '<td class="num"></td>';
      h += '<td class="num">' + (v === undefined || v === '' ? '' : n2(itemPoints(section, it, v))) + '</td>';
      h += '<td></td>';
      h += '</tr>';
    }
    var raw = sectionRaw(section, scores);
    h += '<tr class="total"><td class="r">รวมคะแนน</td><td class="num">' + section.maxScore + '</td>';
    if (opt.selfCol) h += '<td class="num"></td>';
    h += '<td class="num">' + n2(raw) + '</td><td></td></tr>';
    h += '</tbody></table>';
    return h;
  }

  /* ตารางวันลา (ตอนที่ 2 ของแบบผู้ปฏิบัติงานให้ราชการ) */
  function leaveTable(leave, ctx) {
    var r1 = roundRange('r1', ctx.assignment.year);
    var r2 = roundRange('r2', ctx.assignment.year);
    var rows = [
      { k: 'late', label: 'มาสาย' },
      { k: 'personal', label: 'ลากิจส่วนตัว' },
      { k: 'sick', label: 'ลาป่วย' },
      { k: 'maternity', label: 'ลาคลอดบุตร' },
      { k: 'other', label: 'กรณีอื่น ๆ' }
    ];
    var d = leave || {};
    function cell(round, key, unit) {
      var seg = (d[round] || {})[key];
      if (!seg) return '';
      var val = seg[unit];
      return (val === undefined || val === null || val === '' || val === 0) ? '' : val;
    }
    var h = '<table class="form"><thead>';
    h += '<tr><th rowspan="2" style="width:28px">ที่</th><th rowspan="2">รายการ</th>' +
      '<th colspan="2">' + esc(r1.startText + ' – ' + r1.endText) + '</th>' +
      '<th colspan="2">' + esc(r2.startText + ' – ' + r2.endText) + '</th></tr>';
    h += '<tr><th style="width:48px">ครั้ง</th><th style="width:48px">วัน</th>' +
      '<th style="width:48px">ครั้ง</th><th style="width:48px">วัน</th></tr>';
    h += '</thead><tbody>';
    var totals = { r1t: 0, r1d: 0, r2t: 0, r2d: 0 };
    for (var i = 0; i < rows.length; i++) {
      var a = cell('r1', rows[i].k, 'times'), b = cell('r1', rows[i].k, 'days');
      var c = cell('r2', rows[i].k, 'times'), e = cell('r2', rows[i].k, 'days');
      totals.r1t += (+a || 0); totals.r1d += (+b || 0);
      totals.r2t += (+c || 0); totals.r2d += (+e || 0);
      h += '<tr><td class="c">' + (i + 1) + '.</td><td>' + esc(rows[i].label) + '</td>' +
        '<td class="num">' + a + '</td><td class="num">' + b + '</td>' +
        '<td class="num">' + c + '</td><td class="num">' + e + '</td></tr>';
    }
    h += '<tr class="total"><td colspan="2" class="r">รวมทั้งสิ้น</td>' +
      '<td class="num">' + (totals.r1t || '') + '</td><td class="num">' + (totals.r1d || '') + '</td>' +
      '<td class="num">' + (totals.r2t || '') + '</td><td class="num">' + (totals.r2d || '') + '</td></tr>';
    h += '</tbody></table>';
    return h;
  }

  function gradeTable(scaleKey, percent) {
    var scale = GRADE_SCALES[scaleKey];
    var current = gradeOf(scaleKey, percent);
    var h = '<table class="form" style="width:auto;min-width:56%"><thead><tr>' +
      '<th>ระดับผลการประเมิน</th><th style="width:120px">ช่วงคะแนน (ร้อยละ)</th><th style="width:40px"></th></tr></thead><tbody>';
    for (var i = 0; i < scale.levels.length; i++) {
      var lv = scale.levels[i];
      var upper = i === 0 ? 100 : (scale.levels[i - 1].min - 0.01);
      var range = lv.min === 0 ? 'ต่ำกว่า ' + n2(upper + 0.01) : n2(lv.min) + ' – ' + n2(upper);
      h += '<tr><td>' + esc(lv.label) + '</td><td class="c">' + range + '</td>' +
        '<td class="c">' + (lv.label === current ? '<span class="mark">✓</span>' : '') + '</td></tr>';
    }
    return h + '</tbody></table>';
  }

  /* ---------- 1) แบบ PA2/ส ---------- */

  function buildPA2(ctx, ev) {
    var f = ctx.form, p = ctx.person, sc = ev.scores || {}, res = ev.result;
    var s1 = f.sections[0], s2 = f.sections[1];
    var out = '';

    /* --- หน้า 1–2: ตัวแบบประเมิน --- */
    out += '<div class="sheet">';
    out += docHead(f, ctx, 'ประจำปีงบประมาณ พ.ศ. ' + fill(ctx.assignment.year));
    out += '<div class="info-line">' + roundLine(ctx) + '</div>';
    out += '<hr class="rule">';

    out += '<div class="sec-title">ข้อมูลผู้รับการประเมิน</div>';
    out += '<div class="info-line">ชื่อ ' + fill(p.prefix + p.firstName, 'wide') +
      ' นามสกุล ' + fill(p.lastName, 'wide') + '</div>';
    out += '<div class="info-line">ตำแหน่ง ' + fill(Store.positionLabel(p), 'wide') + '</div>';
    out += '<div class="info-line">สถานศึกษา ' + fill(ctx.settings.orgName, 'wide') +
      ' สังกัด ' + fill(ctx.settings.affiliation, 'wide') + '</div>';
    out += '<div class="info-line">รับเงินเดือนในอันดับ คศ. ' + fill(p.salaryRank) +
      ' อัตราเงินเดือน ' + fill(p.salary ? Number(p.salary).toLocaleString('th-TH') : '', 'grow') + ' บาท</div>';

    out += '<div class="info-line mt8">ให้ทำเครื่องหมาย ✓ ในช่องที่ตรงกับผลการประเมิน หรือให้คะแนนตามระดับคุณภาพ</div>';

    out += '<div class="sec-title boxed">ส่วนที่ ๑ ข้อตกลงในการพัฒนางานตามมาตรฐานตำแหน่ง (๖๐ คะแนน)</div>';
    out += '<div class="info-line">๑) ภาระงาน &nbsp;&nbsp;' +
      box(ev.workloadPass !== false, 'เป็นไปตามที่ ก.ค.ศ. กำหนด') + '&nbsp;&nbsp;&nbsp;' +
      box(ev.workloadPass === false, 'ไม่เป็นไปตามที่ ก.ค.ศ. กำหนด') + '</div>';
    out += '<div class="info-line">๒) การปฏิบัติงานและผลการปฏิบัติงานตามมาตรฐานตำแหน่งครู</div>';
    out += '<div class="small">ระดับการปฏิบัติที่คาดหวัง: <b>' +
      esc(s1.subtitle.replace('๓ ด้าน ๑๕ ตัวชี้วัด — ระดับการปฏิบัติที่คาดหวัง: ', '')) + '</b></div>';

    out += levelTable(s1, sc, {
      levelHeaders: ['๑', '๒', '๓', '๔'],
      remarkCol: f.perEvaluatorPass ? 'หมายเหตุ' : 'หมายเหตุ'
    });

    if (f.passNote) out += '<div class="small">' + esc(f.passNote) + '</div>';

    out += '</div>'; /* end sheet 1 */

    out += '<div class="sheet">';
    out += '<div class="sec-title boxed">ส่วนที่ ๒ ข้อตกลงในการพัฒนางานที่เสนอเป็นประเด็นท้าทายในการพัฒนาผลลัพธ์การเรียนรู้ของผู้เรียน (๔๐ คะแนน)</div>';
    out += levelTable(s2, sc, { levelHeaders: ['๑', '๒', '๓', '๔'], remarkCol: 'หมายเหตุ' });

    out += '<div class="center bold mt14" style="font-size:14px">รวมผลการประเมินทั้ง ๒ ส่วน = ' +
      fill(n2(res.total), 'grow') + ' คะแนน</div>';
    if (f.passPercent != null) {
      out += '<div class="center mt8">ผลการประเมิน: <b>' + esc(res.grade) + '</b> ' +
        '(เกณฑ์ผ่านไม่ต่ำกว่าร้อยละ ' + f.passPercent + ')</div>';
    }
    out += signBlock(ev.evaluator ? ev.evaluator.name : '', ev.evaluator ? ev.evaluator.title : '',
      ev.submittedAt ? formatThaiDate(ev.submittedAt) : '', 'กรรมการผู้ประเมิน');
    out += '</div>';

    /* --- หน้า 3: สรุปข้อสังเกต --- */
    out += '<div class="sheet">';
    out += '<div class="doc-head"><div class="t1">สรุปข้อสังเกตเกี่ยวกับ จุดเด่น จุดที่ควรพัฒนา และข้อคิดเห็น</div></div>';
    out += '<div class="info-line">ราย (นาย/นาง/นางสาว) ' + fill(Store.personFullName(p), 'full') + '</div>';
    var nt = ev.notes || {};
    out += '<div class="sec-title">๑. จุดเด่น</div>' + textOrLines(nt.strength, 5);
    out += '<div class="sec-title">๒. จุดที่ควรพัฒนา</div>' + textOrLines(nt.improve, 5);
    out += '<div class="sec-title">๓. ข้อคิดเห็น</div>' + textOrLines(nt.comment, 5);
    out += signBlock(ev.evaluator ? ev.evaluator.name : '', ev.evaluator ? ev.evaluator.title : '',
      ev.submittedAt ? formatThaiDate(ev.submittedAt) : '', 'กรรมการผู้ประเมิน');
    out += '</div>';

    return out;
  }

  /* ---------- 2) แบบเลื่อนเงินเดือน (ข้าราชการครู) ---------- */

  function buildSalary(ctx, ev) {
    var f = ctx.form, p = ctx.person, sc = ev.scores || {}, res = ev.result;
    var out = '';
    var r = roundRange(ctx.assignment.round, ctx.assignment.year);
    var isR1 = ctx.assignment.round === 'r1';

    /* --- ส่วนที่ ๑ ข้อมูล + คำชี้แจง --- */
    out += '<div class="sheet">';
    out += docHead(f, ctx);
    out += '<div class="sec-title boxed">ส่วนที่ ๑ : ข้อมูลของผู้ขอรับการประเมิน</div>';
    out += '<div class="info-line"><b>รอบการประเมิน</b></div>';
    out += '<div class="info-line">' + box(isR1, 'ครั้งที่ ๑ ( ๑ ตุลาคม ' + (ctx.assignment.year - 1) + ' – ๓๑ มีนาคม ' + ctx.assignment.year + ' )') + '</div>';
    out += '<div class="info-line">' + box(!isR1, 'ครั้งที่ ๒ ( ๑ เมษายน ' + ctx.assignment.year + ' – ๓๐ กันยายน ' + ctx.assignment.year + ' )') + '</div>';
    out += '<div class="info-line mt8">ชื่อผู้รับการประเมิน ' + fill(Store.personFullName(p), 'full') + '</div>';
    out += '<div class="info-line">ตำแหน่ง ' + fill(Store.positionLabel(p), 'wide') +
      ' เงินเดือน ' + fill(p.salary ? Number(p.salary).toLocaleString('th-TH') : '', 'grow') + ' บาท</div>';
    out += '<div class="info-line">สถานศึกษา ' + fill(ctx.settings.orgName, 'wide') +
      ' สังกัด ' + fill(ctx.settings.affiliation, 'wide') + '</div>';
    out += '<div class="info-line">สอนระดับชั้น ' + fill(p.teachLevel, 'grow') +
      ' วิชา ' + fill(p.subject, 'wide') + '</div>';
    out += '<div class="info-line">ชั่วโมงการสอน ' + fill(p.teachHours) + ' ชั่วโมง/สัปดาห์</div>';

    var lv = (ctx.leave || {})[ctx.assignment.round] || {};
    var totalDays = ['sick', 'personal', 'other', 'maternity'].reduce(function (a, k) {
      return a + (+(lv[k] || {}).days || 0);
    }, 0);
    out += '<div class="info-line">จำนวนวันลาในรอบการประเมิน ' + fill(totalDays || '') + ' วัน ประกอบด้วย</div>';
    out += '<div class="info-line">๑) ลาป่วย จำนวน ' + fill((lv.sick || {}).times) + ' ครั้ง ' + fill((lv.sick || {}).days) + ' วัน' +
      ' &nbsp;&nbsp; ๒) ลากิจ จำนวน ' + fill((lv.personal || {}).times) + ' ครั้ง ' + fill((lv.personal || {}).days) + ' วัน</div>';
    out += '<div class="info-line">๓) ลาอื่น ๆ (โปรดระบุ) ' + fill(p.otherLeaveNote, 'wide') +
      ' จำนวน ' + fill((lv.other || {}).times) + ' ครั้ง ' + fill((lv.other || {}).days) + ' วัน</div>';
    out += '<div class="info-line mt8">ชื่อผู้ประเมิน ' + fill(ev.evaluator ? ev.evaluator.name : '', 'wide') +
      ' ตำแหน่ง ' + fill(ev.evaluator ? ev.evaluator.title : '', 'wide') + '</div>';

    out += '<div class="callout"><b>คำชี้แจง</b><br>' +
      'ส่วนที่ ๑ : ข้อมูลของผู้รับการประเมิน เพื่อระบุรายละเอียดต่าง ๆ ที่เกี่ยวข้องกับตัวผู้รับการประเมิน<br>' +
      'ส่วนที่ ๒ : สรุปผลการประเมิน ใช้เพื่อกรอกค่าคะแนนการประเมินในองค์ประกอบที่ ๑ การประเมินประสิทธิภาพและประสิทธิผลการปฏิบัติงานตามมาตรฐานตำแหน่ง องค์ประกอบที่ ๒ การประเมินการมีส่วนร่วมในการพัฒนาการศึกษา และองค์ประกอบที่ ๓ การประเมินการปฏิบัติตนในการรักษาวินัย คุณธรรม จริยธรรม และจรรยาบรรณวิชาชีพ<br>' +
      'ส่วนที่ ๓ : ผลการประเมิน ผู้รับการประเมินลงนามรับรองการประเมินตนเอง และผู้บังคับบัญชาประเมินและลงความเห็นของการประเมิน<br>' +
      'ส่วนที่ ๔ : การรับทราบผลการประเมิน ผู้บังคับบัญชาแจ้งผลการประเมินและผู้รับการประเมินลงนามรับทราบผลการประเมิน</div>';
    out += '</div>';

    /* --- ส่วนที่ ๒–๔ --- */
    var comp1 = sumSections(f, res, ['s1', 's1a', 's1b']);
    var comp2 = res.sections['s2'] || 0;
    var comp3 = res.sections['s3'] || 0;

    out += '<div class="sheet">';
    out += '<div class="sec-title boxed">ส่วนที่ ๒ : สรุปผลการประเมิน</div>';
    out += '<table class="form"><thead><tr>' +
      '<th>องค์ประกอบการประเมิน</th><th style="width:70px">คะแนนเต็ม</th>' +
      '<th style="width:88px">คะแนนประเมินตนเอง</th><th style="width:98px">คะแนนประเมินของผู้บังคับบัญชา</th>' +
      '</tr></thead><tbody>';
    out += '<tr><td>องค์ประกอบที่ ๑ การประเมินประสิทธิภาพและประสิทธิผลการปฏิบัติงานตามมาตรฐานตำแหน่ง</td>' +
      '<td class="num">๘๐</td><td class="num"></td><td class="num">' + n2(comp1) + '</td></tr>';
    out += '<tr><td>องค์ประกอบที่ ๒ การประเมินการมีส่วนร่วมในการพัฒนาการศึกษา</td>' +
      '<td class="num">๑๐</td><td class="num"></td><td class="num">' + n2(comp2) + '</td></tr>';
    out += '<tr><td>องค์ประกอบที่ ๓ การประเมินการปฏิบัติตนในการรักษาวินัย คุณธรรม จริยธรรม และจรรยาบรรณวิชาชีพ</td>' +
      '<td class="num">๑๐</td><td class="num"></td><td class="num">' + n2(comp3) + '</td></tr>';
    out += '<tr class="total"><td class="r">คะแนนรวม</td><td class="num">๑๐๐</td>' +
      '<td class="num"></td><td class="num">' + n2(res.total) + '</td></tr>';
    out += '</tbody></table>';

    out += '<div class="sec-title boxed">ส่วนที่ ๓ : ผลการประเมิน</div>';
    out += '<div class="info-line"><b>๓.๑ ผลการประเมินตนเอง</b> — ข้าพเจ้าขอรับรองว่าได้ประเมินตนเองตรงตามความเป็นจริง</div>';
    out += '<div class="sign-block right">(ลงชื่อ) ' + fill('', 'wide') + ' ผู้รับการประเมิน<br>( ' +
      fill(Store.personFullName(p), 'wide') + ' )<br>ตำแหน่ง ' + fill(Store.positionLabel(p), 'wide') +
      '<br>วันที่ ' + fill('', 'grow') + '</div>';

    out += '<div class="info-line mt14"><b>๓.๒ ผลการประเมิน และความเห็นของผู้บังคับบัญชา</b></div>';
    out += '<div class="info-line">๓.๒.๑ ผลการประเมิน มี ๕ ระดับ ดังนี้</div>';
    out += gradeTable(f.gradeScale, res.percent);
    out += '<div class="info-line">คะแนนที่ได้ <b>' + n2(res.total) + '</b> คะแนน คิดเป็นร้อยละ <b>' +
      n2(res.percent) + '</b> อยู่ในระดับ <b>' + esc(res.grade) + '</b></div>';
    out += '<div class="info-line mt8">๓.๒.๒ ความเห็นของผู้บังคับบัญชา</div>';
    out += textOrLines((ev.notes || {}).comment, 3);
    out += signBlock(ev.evaluator ? ev.evaluator.name : '', ev.evaluator ? ev.evaluator.title : '',
      ev.submittedAt ? formatThaiDate(ev.submittedAt) : '', 'ผู้บังคับบัญชา');
    out += '</div>';

    out += '<div class="sheet">';
    out += '<div class="sec-title boxed">ส่วนที่ ๔ : การรับทราบผลการประเมิน</div>';
    out += '<div class="info-line mt8"><b>ผู้รับการประเมิน</b></div>';
    out += '<div class="info-line">' + box(false, 'ได้รับทราบผลการประเมินและความเห็นของผู้บังคับบัญชาแล้ว') + '</div>';
    out += '<div class="sign-block right">ลงชื่อ ' + fill('', 'wide') + '<br>( ' + fill('', 'wide') +
      ' )<br>ตำแหน่ง ' + fill('', 'wide') + '<br>วันที่ ' + fill('', 'grow') + '</div>';
    out += '<div class="info-line mt14"><b>ผู้ประเมิน</b></div>';
    out += '<div class="info-line">' + box(false, 'ได้แจ้งผลการประเมินและผู้รับการประเมินได้ลงนามรับทราบแล้ว') + '</div>';
    out += '<div class="info-line">' + box(false, 'ได้แจ้งผลการประเมินเมื่อวันที่ ') + fill('', 'grow') +
      ' แล้ว แต่ผู้รับการประเมินไม่ลงนามรับทราบ</div>';
    out += '<div class="sign-grid"><div>ลงชื่อ ' + fill('', 'wide') + '<br>( ' + fill('', 'wide') +
      ' )<br>ตำแหน่ง ' + fill('', 'wide') + '<br>วันที่ ' + fill('', 'grow') + '</div>' +
      '<div>ลงชื่อ ' + fill('', 'wide') + ' พยาน<br>( ' + fill('', 'wide') +
      ' )<br>ตำแหน่ง ' + fill('', 'wide') + '<br>วันที่ ' + fill('', 'grow') + '</div></div>';
    out += '</div>';

    /* --- แบบประเมินองค์ประกอบที่ ๑ --- */
    out += '<div class="sheet">';
    out += '<div class="doc-head"><div class="t1">แบบประเมินองค์ประกอบที่ ๑</div>' +
      '<div class="t2">การประเมินประสิทธิภาพและประสิทธิผลการปฏิบัติงานตามมาตรฐานตำแหน่ง</div>' +
      '<div class="t3">' + esc(f.positionLine) + ' ' + esc(f.scope || '') + '</div></div>';
    out += evaluatorInfoLines(ctx, ev, p);

    for (var i = 0; i < f.sections.length; i++) {
      var s = f.sections[i];
      if (s.id !== 's1' && s.id !== 's1a' && s.id !== 's1b') continue;
      out += '<div class="sec-title">' + esc(s.no) + ' ' + esc(s.title) +
        ' (' + s.maxScore + ' คะแนน)</div>';
      if (s.note) out += '<div class="small">' + esc(s.note) + '</div>';
      out += levelTable(s, sc, { levelHeaders: ['๑', '๒', '๓', '๔'], remarkCol: 'ระดับคุณภาพ / เหตุผล' });
    }
    if (f.compositeNote) {
      out += '<table class="form"><thead><tr><th>สรุปคะแนนรวมองค์ประกอบที่ ๑</th>' +
        '<th style="width:70px">คะแนนเต็ม</th><th style="width:88px">คะแนนประเมินตนเอง</th>' +
        '<th style="width:98px">คะแนนประเมินของผู้บังคับบัญชา</th></tr></thead><tbody>' +
        '<tr><td>ตอนที่ ๑ ระดับความสำเร็จในการพัฒนางานตามมาตรฐานตำแหน่ง</td><td class="num">๖๐</td>' +
        '<td class="num"></td><td class="num">' + n2(res.sections['s1a']) + '</td></tr>' +
        '<tr><td>ตอนที่ ๒ ระดับความสำเร็จในการพัฒนางานที่เสนอเป็นประเด็นท้าทายในการพัฒนาผลลัพธ์การเรียนรู้ของผู้เรียน</td>' +
        '<td class="num">๒๐</td><td class="num"></td><td class="num">' + n2(res.sections['s1b']) + '</td></tr>' +
        '<tr class="total"><td class="r">คะแนนรวม</td><td class="num">๘๐</td><td class="num"></td>' +
        '<td class="num">' + n2(comp1) + '</td></tr></tbody></table>';
    }
    out += '</div>';

    /* --- องค์ประกอบที่ ๒ --- */
    var s2def = findSection(f, 's2');
    out += '<div class="sheet">';
    out += '<div class="doc-head"><div class="t1">แบบประเมินองค์ประกอบที่ ๒</div>' +
      '<div class="t2">การประเมินการมีส่วนร่วมในการพัฒนาการศึกษา</div>' +
      '<div class="t3">' + esc(f.positionLine) + ' ' + esc(f.scope || '') + '</div></div>';
    out += evaluatorInfoLines(ctx, ev, p);
    out += '<div class="callout"><b>คำชี้แจง</b> ' + esc(s2def.note) + '<br><b>' + esc(s2def.formula) + '</b></div>';
    out += levelTable(s2def, sc, { levelHeaders: ['๑', '๒', '๓', '๔', '๕'] });
    out += '</div>';

    /* --- องค์ประกอบที่ ๓ --- */
    var s3def = findSection(f, 's3');
    out += '<div class="sheet">';
    out += '<div class="doc-head"><div class="t1">แบบประเมินองค์ประกอบที่ ๓</div>' +
      '<div class="t2">การประเมินการปฏิบัติตนในการรักษาวินัย คุณธรรม จริยธรรม และจรรยาบรรณวิชาชีพ</div>' +
      '<div class="t3">' + esc(f.positionLine) + ' ' + esc(f.scope || '') + '</div></div>';
    out += evaluatorInfoLines(ctx, ev, p);
    out += '<div class="callout"><b>คำชี้แจง</b> ' + esc(s3def.note) + '<br><b>' + esc(s3def.formula) + '</b></div>';
    out += levelTable(s3def, sc, { levelHeaders: ['๑', '๒', '๓', '๔'] });
    out += signBlock(ev.evaluator ? ev.evaluator.name : '', ev.evaluator ? ev.evaluator.title : '',
      ev.submittedAt ? formatThaiDate(ev.submittedAt) : '', 'ผู้ประเมิน');
    out += '</div>';

    return out;
  }

  function evaluatorInfoLines(ctx, ev, p) {
    var isR1 = ctx.assignment.round === 'r1';
    var h = '';
    h += '<div class="info-line">ชื่อผู้รับการประเมิน ' + fill(Store.personFullName(p), 'wide') +
      ' ตำแหน่ง ' + fill(Store.positionLabel(p), 'grow') +
      ' สังกัด ' + fill(ctx.settings.orgName, 'wide') + '</div>';
    h += '<div class="info-line">ชื่อผู้ประเมิน ' + fill(ev.evaluator ? ev.evaluator.name : '', 'wide') +
      ' ตำแหน่ง ' + fill(ev.evaluator ? ev.evaluator.title : '', 'wide') + '</div>';
    h += '<div class="info-line">' + box(isR1, 'รอบการประเมิน ครั้งที่ ๑ ( ๑ ตุลาคม ' + (ctx.assignment.year - 1) + ' – ๓๑ มีนาคม ' + ctx.assignment.year + ' )') + '</div>';
    h += '<div class="info-line">' + box(!isR1, 'รอบการประเมิน ครั้งที่ ๒ ( ๑ เมษายน ' + ctx.assignment.year + ' – ๓๐ กันยายน ' + ctx.assignment.year + ' )') + '</div>';
    return h;
  }

  function findSection(form, id) {
    for (var i = 0; i < form.sections.length; i++) if (form.sections[i].id === id) return form.sections[i];
    return null;
  }

  function sumSections(form, res, ids) {
    var t = 0;
    for (var i = 0; i < ids.length; i++) if (res.sections[ids[i]] !== undefined) t += res.sections[ids[i]];
    return t;
  }

  /* ---------- 3) แบบผู้ปฏิบัติงานให้ราชการ (อัตราจ้าง / ธุรการ / จ้างเหมา) ---------- */

  function buildSimple(ctx, ev) {
    var f = ctx.form, p = ctx.person, sc = ev.scores || {}, res = ev.result;
    var out = '';

    out += '<div class="sheet">';
    out += docHead(f, ctx);
    out += '<div class="center">--------------------------------------------------------------------------------</div>';

    out += '<div class="sec-title">ตอนที่ 1 ข้อมูลผู้เข้ารับการประเมิน</div>';
    out += '<div class="info-line">ชื่อผู้รับการประเมิน ' + fill(Store.personFullName(p), 'wide') +
      ' ตำแหน่ง ' + fill(Store.positionLabel(p), 'wide') + '</div>';
    out += '<div class="info-line">วันเริ่มต้นสัญญาจ้าง ' + fill(thaiDateOrBlank(p.contractStart), 'grow') +
      ' วันสิ้นสุดสัญญาจ้าง ' + fill(thaiDateOrBlank(p.contractEnd), 'grow') + '</div>';
    out += '<div class="info-line">สังกัด ' + esc(ctx.settings.orgName) +
      ' อัตราค่าตอบแทน ' + fill(p.salary ? Number(p.salary).toLocaleString('th-TH') : '', 'grow') + ' บาท/เดือน</div>';

    if (f.hasWorkplace) {
      var wp = p.workplaces || {};
      out += '<div class="info-line">สถานที่ปฏิบัติงาน</div>';
      out += '<div class="info-line">&nbsp;&nbsp;' + box(!!wp.center, 'ในศูนย์การศึกษาพิเศษ') + '</div>';
      out += '<div class="info-line">&nbsp;&nbsp;' + box(!!wp.hospital, 'ที่โรงพยาบาล ') + fill(wp.hospitalName, 'wide') + '</div>';
      out += '<div class="info-line">&nbsp;&nbsp;' + box(!!wp.unit, 'ที่หน่วยบริการ ') + fill(wp.unitName, 'wide') + '</div>';
      out += '<div class="info-line">&nbsp;&nbsp;' + box(!!wp.home, 'โครงการปรับบ้านเป็นห้องเรียนเปลี่ยนพ่อแม่เป็นครู อำเภอ ') + fill(wp.homeDistrict, 'grow') + '</div>';
      out += '<div class="info-line">&nbsp;&nbsp;' + box(!!wp.school, 'ที่โรงเรียน ') + fill(wp.schoolName, 'wide') +
        ' อำเภอ ' + fill(wp.schoolDistrict, 'grow') + '</div>';
    }

    out += '<div class="sec-title">รายละเอียดหน้าที่ความรับผิดชอบ</div>';
    out += textOrLines(p.duties, 5);

    out += '<div class="sec-title">ตอนที่ 2 การปฏิบัติราชการและการลา</div>';
    out += leaveTable(ctx.leave, ctx);
    out += '</div>';

    /* --- ตารางประเมิน --- */
    out += '<div class="sheet">';
    out += '<div class="sec-title">' + esc(f.sections[0].no) + ' ' + esc(f.sections[0].title) + '</div>';
    if (f.passNote) out += '<div class="callout">' + esc(f.passNote) + '</div>';

    for (var i = 0; i < f.sections.length; i++) {
      var s = f.sections[i];
      if (i > 0) out += '<div class="sec-title">' + esc(s.no) + ' ' + esc(s.title) + '</div>';
      out += pointsTable(s, sc, { selfCol: f.key === 'service_contract' });
    }

    out += '<table class="form"><tbody>' +
      '<tr class="total"><td class="r">รวมคะแนนทั้งหมด</td><td class="num" style="width:80px">' + f.totalMax + '</td>' +
      '<td class="num" style="width:80px">' + n2(res.total) + '</td></tr>' +
      '<tr class="total"><td class="r">คิดเป็นร้อยละ</td><td class="num">100</td>' +
      '<td class="num">' + n2(res.percent) + '</td></tr></tbody></table>';

    out += '<div class="sec-title">ผลการประเมิน ผ่านระดับ <b>' + esc(res.grade) + '</b></div>';
    out += gradeTable(f.gradeScale, res.percent);

    if (f.hasContractDecision) {
      out += '<div class="sec-title">ความคิดเห็นของกรรมการ</div>';
      var dec = ev.contractDecision || res.contract;
      for (var c = 0; c < f.contractRules.length; c++) {
        var lbl = f.contractRules[c].label;
        out += '<div class="info-line">&nbsp;&nbsp;' + box(dec === lbl, lbl) +
          (lbl.indexOf('เลิกจ้าง') >= 0 ? ' เนื่องจาก ' + fill((ev.notes || {}).comment, 'wide') : '') + '</div>';
      }
    }

    out += signBlock(ev.evaluator ? ev.evaluator.name : '', ev.evaluator ? ev.evaluator.title : '',
      ev.submittedAt ? formatThaiDate(ev.submittedAt) : '', 'กรรมการประเมิน');
    out += '</div>';

    return out;
  }

  /* ---------- 4) แบบพนักงานราชการ ---------- */

  function buildGov(ctx, ev) {
    var f = ctx.form, p = ctx.person, sc = ev.scores || {}, res = ev.result;
    var g1 = f.sections[0], g2 = f.sections[1];
    var out = '';
    var isR1 = ctx.assignment.round === 'r1';
    var s1score = res.sections['g1'] || 0, s2score = res.sections['g2'] || 0;

    /* ชุดที่ 1 : ส่วนที่ 1–2 */
    out += '<div class="sheet">';
    out += '<div class="form-code">(ชุดที่ 1)</div>';
    out += '<div class="doc-head"><div class="t1">แบบสรุปผลการประเมินผลการปฏิบัติงานของพนักงานราชการ</div></div>';
    out += '<div class="sec-title boxed">ส่วนที่ 1 ข้อมูลของผู้รับการประเมิน</div>';
    out += '<div class="info-line"><b>รอบการประเมิน</b></div>';
    out += '<div class="info-line">' + box(isR1, 'ครั้งที่ 1 ระหว่างวันที่ 1 ตุลาคม ' + (ctx.assignment.year - 1) + ' ถึงวันที่ 31 มีนาคม ' + ctx.assignment.year) + '</div>';
    out += '<div class="info-line">' + box(!isR1, 'ครั้งที่ 2 ระหว่างวันที่ 1 เมษายน ' + ctx.assignment.year + ' ถึงวันที่ 30 กันยายน ' + ctx.assignment.year) + '</div>';
    out += '<div class="info-line mt8">ชื่อผู้รับการประเมิน ' + fill(Store.personFullName(p), 'wide') + '</div>';
    out += '<div class="info-line">วันเริ่มสัญญาจ้าง ' + fill(thaiDateOrBlank(p.contractStart), 'grow') +
      ' วันสิ้นสุดสัญญาจ้าง ' + fill(thaiDateOrBlank(p.contractEnd), 'grow') + '</div>';
    out += '<div class="info-line">ตำแหน่ง ' + fill(Store.positionLabel(p), 'grow') +
      ' กลุ่มงาน ' + fill(p.workGroup, 'wide') + '</div>';
    out += '<div class="info-line">สังกัด ' + fill(ctx.settings.orgName, 'full') + '</div>';
    out += '<div class="info-line">ชื่อผู้บังคับบัญชา/ผู้ประเมิน ' + fill(ev.evaluator ? ev.evaluator.name : '', 'wide') +
      ' ตำแหน่ง ' + fill(ev.evaluator ? ev.evaluator.title : '', 'wide') + '</div>';

    out += '<div class="sec-title boxed">ส่วนที่ 2 สรุปผลการประเมิน</div>';
    out += '<table class="form"><thead><tr>' +
      '<th>องค์ประกอบการประเมิน</th><th style="width:70px">คะแนน (ก)</th>' +
      '<th style="width:66px">น้ำหนัก (ข)</th><th style="width:76px">ค = (ก × ข)</th></tr></thead><tbody>';
    out += '<tr><td>ผลการประเมินผลสัมฤทธิ์ของงาน</td><td class="num">' + n2(s1score) +
      '</td><td class="num">80%</td><td class="num">' + n2(s1score * 0.8) + '</td></tr>';
    out += '<tr><td>ผลการประเมินพฤติกรรมการปฏิบัติงาน (สมรรถนะ)</td><td class="num">' + n2(s2score) +
      '</td><td class="num">20%</td><td class="num">' + n2(s2score * 0.2) + '</td></tr>';
    out += '<tr class="total"><td class="r">รวม</td><td class="num"></td><td class="num">100%</td>' +
      '<td class="num">' + n2(res.total) + '</td></tr></tbody></table>';

    out += '<div class="sec-title">ระดับผลการประเมิน</div>';
    out += gradeTable(f.gradeScale, res.percent);
    out += '<div class="info-line">สรุป: ได้คะแนน <b>' + n2(res.total) + '</b> อยู่ในระดับ <b>' + esc(res.grade) + '</b></div>';
    out += '</div>';

    /* ส่วนที่ 3–5 */
    out += '<div class="sheet">';
    out += '<div class="sec-title boxed">ส่วนที่ 3 ความคิดเห็นเพิ่มเติมของผู้ประเมิน</div>';
    out += textOrLines((ev.notes || {}).comment, 4);
    out += signBlock(ev.evaluator ? ev.evaluator.name : '', ev.evaluator ? ev.evaluator.title : '',
      ev.submittedAt ? formatThaiDate(ev.submittedAt) : '', 'ผู้ประเมิน');

    out += '<div class="sec-title boxed mt14">ส่วนที่ 4 แจ้งผลการประเมิน</div>';
    out += '<div class="info-line"><b>ผู้รับการประเมิน :</b> ' + box(false, 'ได้รับทราบผลการประเมินแล้ว') + '</div>';
    out += '<div class="sign-block right">ลงชื่อ ' + fill('', 'wide') + '<br>( ' + fill('', 'wide') +
      ' )<br>ตำแหน่ง ' + fill('', 'wide') + '<br>วันที่ ' + fill('', 'grow') + '</div>';
    out += '<div class="info-line mt14"><b>ผู้ประเมิน :</b> ' + box(false, 'ได้แจ้งผลการประเมินเมื่อวันที่ ') + fill('', 'grow') + '</div>';
    out += '<div class="sign-block right">ลงชื่อ ' + fill('', 'wide') + '<br>( ' + fill('', 'wide') +
      ' )<br>ตำแหน่ง ' + fill('', 'wide') + '<br>วันที่ ' + fill('', 'grow') + '</div>';
    out += '</div>';

    out += '<div class="sheet">';
    out += '<div class="sec-title boxed">ส่วนที่ 5 ความเห็นของผู้บังคับบัญชาเหนือขึ้นไป</div>';
    out += '<div class="info-line">' + box(false, 'เห็นด้วยกับผลการประเมิน') + '</div>';
    out += '<div class="info-line">' + box(false, 'มีความเห็นแตกต่าง ดังนี้') + '</div>';
    out += blankLines(3);
    out += '<div class="sign-block right">ลงชื่อ ' + fill('', 'wide') + '<br>( ' + fill('', 'wide') +
      ' )<br>ตำแหน่ง ' + fill('', 'wide') + '<br>วันที่ ' + fill('', 'grow') + '</div>';
    out += '<div class="sec-title mt14">ผู้บังคับบัญชาเหนือขึ้นไปอีกชั้นหนึ่ง (ถ้ามี)</div>';
    out += '<div class="info-line">' + box(false, 'เห็นด้วยกับผลการประเมิน') + '</div>';
    out += '<div class="info-line">' + box(false, 'มีความเห็นแตกต่าง ดังนี้') + '</div>';
    out += blankLines(3);
    out += '<div class="sign-block right">ลงชื่อ ' + fill('', 'wide') + '<br>( ' + fill('', 'wide') +
      ' )<br>ตำแหน่ง ' + fill('', 'wide') + '<br>วันที่ ' + fill('', 'grow') + '</div>';
    out += '</div>';

    /* ชุดที่ 2 : แบบประเมินผลสัมฤทธิ์ของงาน */
    out += '<div class="sheet">';
    out += '<div class="form-code">(ชุดที่ 2)</div>';
    out += '<div class="doc-head"><div class="t1">แบบประเมินผลสัมฤทธิ์ของงาน</div>' +
      '<div class="t3">' + esc(g1.formula) + '</div></div>';
    out += '<div class="info-line">ชื่อผู้รับการประเมิน ' + fill(Store.personFullName(p), 'wide') +
      ' ตำแหน่ง ' + fill(Store.positionLabel(p), 'grow') + ' กลุ่มงาน ' + fill(p.workGroup, 'grow') + '</div>';

    out += '<table class="form"><thead><tr><th rowspan="2">ตัวชี้วัดผลงาน</th>' +
      '<th colspan="5">คะแนนตามระดับค่าเป้าหมาย</th>' +
      '<th rowspan="2" style="width:52px">คะแนน<br>ประเมิน (ก)</th>' +
      '<th rowspan="2" style="width:52px">น้ำหนัก<br>ร้อยละ (ข)</th>' +
      '<th rowspan="2" style="width:58px">คะแนนรวม<br>(ค = ก × ข)</th></tr><tr>' +
      '<th style="width:24px">1</th><th style="width:24px">2</th><th style="width:24px">3</th>' +
      '<th style="width:24px">4</th><th style="width:24px">5</th></tr></thead><tbody>';
    for (var i = 0; i < g1.items.length; i++) {
      var it = g1.items[i];
      var lvl = parseInt(sc[scoreKey(g1.id, i)], 10);
      out += '<tr><td><b>' + esc(it.no) + '</b> ' + esc(it.text) + ' <b>(' + it.weight + ' คะแนน)</b></td>';
      for (var L = 1; L <= 5; L++) out += '<td class="c">' + (lvl === L ? '<span class="mark">✓</span>' : '') + '</td>';
      out += '<td class="num">' + (isNaN(lvl) ? '' : lvl) + '</td>';
      out += '<td class="num">' + it.weight + '</td>';
      out += '<td class="num">' + (isNaN(lvl) ? '' : lvl * it.weight) + '</td></tr>';
    }
    var g1raw = sectionRaw(g1, sc);
    out += '<tr class="total"><td class="r" colspan="6">รวม</td><td class="num"></td>' +
      '<td class="num">100%</td><td class="num">' + n2(g1raw) + '</td></tr>';
    out += '<tr class="total"><td class="r" colspan="8">รวมคะแนน (ค) แล้วหารด้วย 100 นำผลลัพธ์คูณด้วย 20 เพื่อแปลงเป็นคะแนนเต็ม 100</td>' +
      '<td class="num">' + n2(s1score) + '</td></tr>';
    out += '</tbody></table></div>';

    /* ชุดที่ 3 : สรุปสมรรถนะ */
    out += '<div class="sheet">';
    out += '<div class="form-code">(ชุดที่ 3)</div>';
    out += '<div class="doc-head"><div class="t1">แบบสรุปผลการประเมินพฤติกรรมการปฏิบัติงาน</div>' +
      '<div class="t2">(สมรรถนะหลัก 5 ด้าน + สมรรถนะประจำสายงาน 2 ด้าน)</div></div>';
    out += '<div class="info-line">ชื่อผู้รับการประเมิน ' + fill(Store.personFullName(p), 'wide') +
      ' ตำแหน่ง ' + fill(Store.positionLabel(p), 'grow') + '</div>';
    out += '<table class="form"><thead><tr><th>สมรรถนะ</th><th style="width:70px">น้ำหนัก<br>ร้อยละ (ข)</th>' +
      '<th style="width:80px">คะแนนประเมิน</th><th style="width:100px">หมายเหตุ</th></tr></thead><tbody>';
    for (var gi = 0; gi < g2.groups.length; gi++) {
      var grp = g2.groups[gi];
      var gsum = 0, gmax = 0;
      for (var j = 0; j < grp.items.length; j++) {
        gsum += itemPoints(g2, grp.items[j], sc[scoreKey(g2.id, j, grp.id)]);
        gmax += 5;
      }
      var gscore = gmax > 0 ? grp.weight * gsum / gmax : 0;
      out += '<tr><td>' + esc(grp.title) + '</td><td class="num">' + grp.weight + '</td>' +
        '<td class="num">' + n2(gscore) + '</td><td></td></tr>';
    }
    out += '<tr class="total"><td class="r">ผลรวม</td><td class="num">100%</td>' +
      '<td class="num">' + n2(s2score) + '</td><td></td></tr></tbody></table>';
    out += '</div>';

    /* ชุดที่ 4 : รายละเอียดสมรรถนะแต่ละด้าน */
    for (var k = 0; k < g2.groups.length; k++) {
      var g = g2.groups[k];
      out += '<div class="sheet">';
      out += '<div class="form-code">(ชุดที่ 4 — หน้าที่ ' + (k + 1) + ' จาก ' + g2.groups.length + ')</div>';
      out += '<div class="doc-head"><div class="t1">แบบประเมินพฤติกรรมการปฏิบัติงาน</div>' +
        '<div class="t3">ประเมินเป็นรายข้อย่อยตามระดับที่แสดงออกจริง แต่ละข้อย่อยมีคะแนนเต็ม 5 คะแนน</div></div>';
      out += '<div class="sec-title">' + esc(g.title) + ' &nbsp; น้ำหนักคะแนน ' + g.weight + ' คะแนน</div>';
      out += '<table class="form"><thead><tr><th rowspan="2">พฤติกรรมการปฏิบัติงาน</th>' +
        '<th colspan="5">ระดับที่แสดงออกจริง</th><th rowspan="2" style="width:56px">คะแนน<br>ประเมิน</th></tr>' +
        '<tr><th style="width:38px">1<br><span class="small">ต่ำกว่า<br>กำหนดมาก</span></th>' +
        '<th style="width:38px">2<br><span class="small">ต่ำกว่า<br>กำหนด</span></th>' +
        '<th style="width:38px">3<br><span class="small">ตาม<br>กำหนด</span></th>' +
        '<th style="width:38px">4<br><span class="small">เกินกว่า<br>กำหนด</span></th>' +
        '<th style="width:38px">5<br><span class="small">เกินกว่า<br>กำหนดมาก</span></th></tr></thead><tbody>';
      var sum = 0, max = 0;
      for (var m = 0; m < g.items.length; m++) {
        var gv = parseInt(sc[scoreKey(g2.id, m, g.id)], 10);
        sum += isNaN(gv) ? 0 : gv; max += 5;
        out += '<tr><td><b>' + esc(g.items[m].no) + '.</b> ' + esc(g.items[m].text) + '</td>';
        for (var L3 = 1; L3 <= 5; L3++) out += '<td class="c">' + (gv === L3 ? '<span class="mark">✓</span>' : '') + '</td>';
        out += '<td class="num">' + (isNaN(gv) ? '' : gv) + '</td></tr>';
      }
      out += '<tr class="total"><td class="r" colspan="6">รวม (เต็ม ' + max + ' คะแนน)</td>' +
        '<td class="num">' + sum + '</td></tr>';
      out += '<tr class="total"><td class="r" colspan="6">เทียบน้ำหนักคะแนน ' + g.weight +
        ' คะแนน = ' + g.weight + ' × ผลรวม ÷ ' + max + '</td>' +
        '<td class="num">' + n2(max > 0 ? g.weight * sum / max : 0) + '</td></tr>';
      out += '</tbody></table></div>';
    }

    return out;
  }

  /* ---------- แผ่นสรุปรวมคณะกรรมการ ---------- */

  function buildCommitteeSummary(ctx) {
    var f = ctx.form, p = ctx.person;
    var evs = ctx.evals;
    var out = '<div class="sheet">';
    out += '<div class="doc-head"><div class="t1">แบบสรุปผลการประเมินของคณะกรรมการ</div>' +
      '<div class="t2">' + esc(f.title) + '</div>' +
      '<div class="t3">' + esc(f.positionLine) + '</div>' +
      '<div class="t3">ประจำปีงบประมาณ พ.ศ. ' + esc(ctx.assignment.year) + '</div></div>';
    out += '<hr class="rule-thick">';
    out += '<div class="info-line">ชื่อผู้รับการประเมิน ' + fill(Store.personFullName(p), 'wide') +
      ' ตำแหน่ง ' + fill(Store.positionLabel(p), 'wide') + '</div>';
    out += '<div class="info-line">' + roundLine(ctx) + '</div>';

    out += '<table class="form"><thead><tr><th style="width:34px">ที่</th><th>กรรมการผู้ประเมิน</th>' +
      '<th style="width:88px">คะแนนที่ได้<br>(เต็ม ' + f.totalMax + ')</th>' +
      '<th style="width:70px">ร้อยละ</th><th style="width:110px">ผลการประเมิน</th></tr></thead><tbody>';
    var sum = 0, count = 0, allPass = true;
    for (var i = 0; i < evs.length; i++) {
      var e = evs[i];
      sum += e.result.percent; count++;
      if (f.passPercent != null && e.result.percent < f.passPercent) allPass = false;
      out += '<tr><td class="c">' + (i + 1) + '</td>' +
        '<td>' + esc(e.evaluator ? e.evaluator.name : '—') +
        '<span class="idesc">' + esc(e.evaluator ? e.evaluator.title : '') + '</span></td>' +
        '<td class="num">' + n2(e.result.total) + '</td>' +
        '<td class="num">' + n2(e.result.percent) + '</td>' +
        '<td class="c">' + esc(e.result.grade) + '</td></tr>';
    }
    var avg = count ? sum / count : 0;
    var avgTotal = f.totalMax * avg / 100;
    out += '<tr class="total"><td colspan="2" class="r">คะแนนเฉลี่ยของคณะกรรมการ</td>' +
      '<td class="num">' + n2(avgTotal) + '</td><td class="num">' + n2(avg) + '</td>' +
      '<td class="c">' + esc(gradeOf(f.gradeScale, avg)) + '</td></tr>';
    out += '</tbody></table>';

    if (f.perEvaluatorPass) {
      out += '<div class="callout"><b>' + esc(f.passNote) + '</b><br>' +
        'ผลการตรวจสอบ: <b>' + (allPass ? 'ผ่านเกณฑ์ทุกคน' : 'มีกรรมการบางคนให้คะแนนต่ำกว่าเกณฑ์') + '</b></div>';
    } else if (f.passPercent != null) {
      out += '<div class="callout">เกณฑ์ผ่านไม่ต่ำกว่าร้อยละ ' + f.passPercent +
        ' — ผลการประเมิน: <b>' + (avg >= f.passPercent ? 'ผ่านเกณฑ์การประเมิน' : 'ไม่ผ่านเกณฑ์การประเมิน') + '</b></div>';
    }

    /* ข้อสังเกตรวมของกรรมการทุกคน */
    var hasNotes = false;
    for (var j = 0; j < evs.length; j++) {
      var nt = evs[j].notes || {};
      if (nt.strength || nt.improve || nt.comment) { hasNotes = true; break; }
    }
    if (hasNotes) {
      out += '<div class="sec-title">ข้อสังเกตของคณะกรรมการ</div>';
      for (var k = 0; k < evs.length; k++) {
        var n = evs[k].notes || {};
        if (!n.strength && !n.improve && !n.comment) continue;
        out += '<div class="info-line"><b>' + esc(evs[k].evaluator ? evs[k].evaluator.name : 'กรรมการคนที่ ' + (k + 1)) + '</b></div>';
        if (n.strength) out += '<div class="small">• จุดเด่น: ' + esc(n.strength) + '</div>';
        if (n.improve) out += '<div class="small">• จุดที่ควรพัฒนา: ' + esc(n.improve) + '</div>';
        if (n.comment) out += '<div class="small">• ข้อคิดเห็น: ' + esc(n.comment) + '</div>';
      }
    }

    out += '<div class="sign-grid mt14">';
    for (var m = 0; m < evs.length; m++) {
      out += '<div>ลงชื่อ ' + fill('', 'grow') + '<br>( ' + fill(evs[m].evaluator ? evs[m].evaluator.name : '', 'grow') +
        ' )<br>กรรมการผู้ประเมิน</div>';
      if ((m + 1) % 3 === 0 && m + 1 < evs.length) out += '</div><div class="sign-grid">';
    }
    out += '</div>';

    out += '<div class="sign-block right mt14">ลงชื่อ ' + fill('', 'wide') + ' ประธานกรรมการ<br>( ' +
      fill(ctx.settings.directorName, 'wide') + ' )<br>ตำแหน่ง ' + fill(ctx.settings.directorTitle, 'wide') +
      '<br>วันที่ ' + fill(todayThai(), 'grow') + '</div>';
    out += '</div>';
    return out;
  }

  /* ---------- ทางเข้าเดียว ---------- */

  var BUILDERS = { pa2: buildPA2, salary: buildSalary, simple: buildSimple, gov: buildGov };

  function build(ctx) {
    var builder = BUILDERS[ctx.form.printer];
    if (!builder) return '<div class="sheet">ไม่พบรูปแบบการพิมพ์ของแบบประเมินนี้</div>';
    var out = '';
    var evs = ctx.evals && ctx.evals.length ? ctx.evals : [emptyEval(ctx)];

    if (ctx.mode === 'summary') return buildCommitteeSummary(ctx);

    for (var i = 0; i < evs.length; i++) {
      out += builder(ctx, evs[i]);
    }
    if (ctx.mode !== 'blank' && evs.length > 1) out += buildCommitteeSummary(ctx);
    return out;
  }

  function emptyEval(ctx) {
    return {
      evaluator: null, scores: {}, notes: {}, workloadPass: true,
      result: evaluateForm(ctx.form, {})
    };
  }

  return { build: build, buildCommitteeSummary: buildCommitteeSummary, gradeTable: gradeTable };
})();

/* ---------- วันที่ไทย ---------- */

function formatThaiDate(iso) {
  if (!iso) return '';
  var d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.getDate() + ' ' + THAI_MONTHS[d.getMonth()] + ' ' + (d.getFullYear() + 543);
}

function thaiDateOrBlank(dateStr) {
  if (!dateStr) return '';
  var d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.getDate() + ' ' + THAI_MONTHS[d.getMonth()] + ' ' + (d.getFullYear() + 543);
}
