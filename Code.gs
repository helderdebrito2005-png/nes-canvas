// ═══════════════════════════════════════════════════════════════════════════════
// NES Canvas — Google Apps Script Backend
// Deploy as Web App → Execute as: Me → Who has access: Anyone
// ═══════════════════════════════════════════════════════════════════════════════

// ── Sheet helpers ────────────────────────────────────────────────────────────

function getOrCreateSheet(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    if (name === 'settings') {
      sh.appendRow(['key', 'value']);
    } else {
      sh.appendRow(['id', 'data']);
    }
  }
  return sh;
}

function generateId() {
  return Utilities.getUuid();
}

function readSheet(name) {
  var sh = getOrCreateSheet(name);
  var data = sh.getDataRange().getValues();
  if (data.length <= 1) return [];
  return data.slice(1).map(function(row) {
    if (!row[0]) return null;
    try {
      var obj = JSON.parse(row[1]);
      obj.id = String(row[0]);
      return obj;
    } catch(e) { return null; }
  }).filter(function(x) { return x !== null; });
}

function writeRow(name, data) {
  var sh = getOrCreateSheet(name);
  var id = data.id || generateId();
  var d = Object.assign({}, data);
  delete d.id;
  sh.appendRow([id, JSON.stringify(d)]);
  return id;
}

function writeRowWithId(name, id, data) {
  var sh = getOrCreateSheet(name);
  var d = Object.assign({}, data);
  delete d.id;
  sh.appendRow([id, JSON.stringify(d)]);
  return id;
}

function patchRow(name, id, patch) {
  var sh = getOrCreateSheet(name);
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) {
      var existing = {};
      try { existing = JSON.parse(data[i][1]); } catch(e) {}
      var updated = Object.assign(existing, patch);
      sh.getRange(i + 1, 2).setValue(JSON.stringify(updated));
      return;
    }
  }
}

function removeRow(name, id) {
  var sh = getOrCreateSheet(name);
  var data = sh.getDataRange().getValues();
  for (var i = data.length - 1; i >= 1; i--) {
    if (String(data[i][0]) === String(id)) {
      sh.deleteRow(i + 1);
      return;
    }
  }
}

// ── Settings ─────────────────────────────────────────────────────────────────

function getSetting(key) {
  var sh = getOrCreateSheet('settings');
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === key) {
      try { return JSON.parse(data[i][1]); } catch(e) { return data[i][1]; }
    }
  }
  return null;
}

function setSetting(key, value) {
  var sh = getOrCreateSheet('settings');
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === key) {
      sh.getRange(i + 1, 2).setValue(JSON.stringify(value));
      return;
    }
  }
  sh.appendRow([key, JSON.stringify(value)]);
}

// ── Seed initial data if sheets are empty ────────────────────────────────────

function seedIfEmpty() {
  var teachers = readSheet('teachers');
  if (teachers.length > 0) return;

  var tNancyId  = generateId();
  var tAmeliaId = generateId();
  var tEdgarId  = generateId();
  writeRowWithId('teachers', tNancyId,  { name: 'Nancy',  rate: 0,    active: true });
  writeRowWithId('teachers', tAmeliaId, { name: 'Amélia', rate: 2000, active: true });
  writeRowWithId('teachers', tEdgarId,  { name: 'Edgar',  rate: 2000, active: true });

  var planId = generateId();
  writeRowWithId('lessonPlans', planId, {
    name: 'DM Book 2 (Demo)',
    blocks: [
      { type: 'GR', startPage: 1, endPage: 20, expectedLessons: 6 },
      { type: 'WB', startPage: 21, endPage: 40, expectedLessons: 6 }
    ],
    active: true
  });

  var cls1Id = generateId();
  var cls2Id = generateId();
  writeRowWithId('classes', cls1Id, { name: 'DM2 • 08:00', room: 'Sala 1', teacherId: tAmeliaId, lessonPlanId: planId, active: true });
  writeRowWithId('classes', cls2Id, { name: 'DM2 • 10:00', room: 'Sala 2', teacherId: tEdgarId,  lessonPlanId: planId, active: true });

  var yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  var yesterdayStr = Utilities.formatDate(yesterday, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  writeRow('logs', {
    date: yesterdayStr, classId: cls1Id, className: 'DM2 • 08:00',
    teacherId: tAmeliaId, teacherName: 'Amélia', type: 'GR',
    startPage: '1', endPage: '4', lastWord: 'Apple',
    dictation: true, isCustomType: false, notes: 'Demo'
  });

  setSetting('adminPin', '200503');
  setSetting('tabletMode', false);
}

// ── Get all data ─────────────────────────────────────────────────────────────

function getAllData() {
  return {
    teachers:    readSheet('teachers'),
    classes:     readSheet('classes'),
    lessonPlans: readSheet('lessonPlans'),
    logs:        readSheet('logs'),
    accounts:    readSheet('users'),
    settings: {
      adminPin:   getSetting('adminPin')   || '200503',
      tabletMode: getSetting('tabletMode') || false
    }
  };
}

// ── Auth ─────────────────────────────────────────────────────────────────────

function doLogin(email, pwHash) {
  if (!email || !pwHash) return { ok: false, error: 'Dados em falta.' };
  email = email.toLowerCase().trim();
  var users = readSheet('users');
  var user = null;
  for (var i = 0; i < users.length; i++) {
    if (users[i].email === email) { user = users[i]; break; }
  }
  if (!user)          return { ok: false, error: 'Email não registado.' };
  if (!user.activated) return { ok: false, error: 'Conta não activada. Use "Criar Conta" para definir a sua senha.' };
  if (user.pwHash !== pwHash) return { ok: false, error: 'Senha incorreta.' };
  return { ok: true, accountId: user.id, teacherId: user.teacherId, role: user.role || 'teacher' };
}

function doSignup(email, pwHash) {
  if (!email || !pwHash) return { ok: false, error: 'Dados em falta.' };
  email = email.toLowerCase().trim();
  var users = readSheet('users');
  var user = null;
  for (var i = 0; i < users.length; i++) {
    if (users[i].email === email) { user = users[i]; break; }
  }
  if (!user) return { ok: false, error: 'Email não encontrado. Peça ao administrador para o registar primeiro.' };
  if (user.activated && user.pwHash) return { ok: false, error: 'Este email já tem conta. Use o separador Entrar.' };
  patchRow('users', user.id, { pwHash: pwHash, activated: true });
  return { ok: true, accountId: user.id, teacherId: user.teacherId, role: user.role || 'teacher' };
}

// ── Response helpers ──────────────────────────────────────────────────────────

function respond(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Entry point ───────────────────────────────────────────────────────────────

function doGet(e) {
  var p = (e && e.parameter) ? e.parameter : {};
  try {
    switch (p.action) {
      case 'all':
        seedIfEmpty();
        return respond({ ok: true, data: getAllData() });

      case 'login':
        return respond(doLogin(p.email, p.pwHash));

      case 'signup':
        return respond(doSignup(p.email, p.pwHash));

      case 'add':
        var addData = JSON.parse(p.data);
        var newId = writeRow(p.col, addData);
        return respond({ ok: true, id: newId });

      case 'update':
        patchRow(p.col, p.id, JSON.parse(p.data));
        return respond({ ok: true });

      case 'delete':
        removeRow(p.col, p.id);
        return respond({ ok: true });

      case 'setting':
        setSetting(p.key, JSON.parse(p.value));
        return respond({ ok: true });

      default:
        return respond({ ok: false, error: 'Acção desconhecida: ' + (p.action || '(nenhuma)') });
    }
  } catch(ex) {
    return respond({ ok: false, error: ex.message || String(ex) });
  }
}
