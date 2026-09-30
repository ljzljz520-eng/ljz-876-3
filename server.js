/**
 * 医院三基考试管理系统 —— 后端服务（零依赖）
 * 启动: node server.js   默认端口 3000，可用 PORT=xxxx node server.js
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'data', 'db.json');
const PUBLIC = path.join(__dirname, 'public');

/* ---------------- 数据存取 ---------------- */
let db;
function loadDb() {
  db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}
let saveTimer = null;
function saveDb() {
  // 合并落盘（简单防抖，原子替换）
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const tmp = DB_PATH + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
    fs.renameSync(tmp, DB_PATH);
  }, 30);
}
function saveDbNow() {
  clearTimeout(saveTimer);
  const tmp = DB_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_PATH);
}
loadDb();

const sha = (s) => crypto.createHash('sha256').update('sanji::' + s).digest('hex');
const uid = (p) => p + '-' + crypto.randomBytes(5).toString('hex');
const nowIso = () => new Date().toISOString();
const norm = (s) => String(s == null ? '' : s).replace(/[\s，。、；;．.（）()]/g, '').toLowerCase();

const POST_LABEL = { nurse: '护士', doctor: '医生', technician: '技师' };
const TYPE_LABEL = { single: '单选题', multi: '多选题', judge: '判断题', blank: '填空题', short: '简答题', essay: '论述题' };
const OBJECTIVE_TYPES = ['single', 'multi', 'judge', 'blank'];
const ROLE_LABEL = { admin: '院级管理员', nursing: '护理部', teacher: '科室老师', examinee: '考生' };

const find = (arr, id) => arr.find((x) => x.id === id);
const getUser = (id) => find(db.users, id);

/* ---------------- 认证（内存会话） ---------------- */
const sessions = new Map(); // token -> {uid, loginAt}
function auth(req) {
  const token = req.headers['x-auth-token'];
  if (!token) return null;
  const s = sessions.get(token);
  if (!s) return null;
  const user = getUser(s.uid);
  return user || null;
}
const requireRole = (user, ...roles) => user && roles.includes(user.role);

/* ---------------- 业务核心 ---------------- */
// 考试应考名单（岗位 + 科室范围，且为考生）
function examRoster(exam) {
  return db.users.filter((u) => {
    if (u.role !== 'examinee') return false;
    if (!exam.posts.includes(u.post)) return false;
    if (exam.deptScope === 'all') return true;
    return exam.deptScope.includes(u.dept);
  });
}

// 考生视角状态
function attemptView(exam, user) {
  const att = db.attempts.find((a) => a.examId === exam.id && a.userId === user.id);
  if (att) return att;
  return { examId: exam.id, userId: user.id, status: 'not_started' };
}

function examLiveStatus(exam) {
  if (exam.status === 'draft') return 'draft';
  if (exam.status === 'closed') return 'closed';
  const t = Date.now();
  if (t < new Date(exam.startTime).getTime()) return 'scheduled';
  if (t > new Date(exam.endTime).getTime()) return 'ended';
  return 'ongoing';
}

// 客观题判分
function gradeObjective(q, given) {
  if (q.type === 'single' || q.type === 'judge')
    return norm(given) === norm(q.answer) ? q.score : 0;
  if (q.type === 'multi') {
    const g = norm((given || '').split('').sort().join(''));
    const a = norm(q.answer.split('').sort().join(''));
    return g === a ? q.score : 0;
  }
  if (q.type === 'blank') {
    const arr = Array.isArray(given) ? given : [];
    let get = 0;
    q.answer.forEach((x, i) => { if (norm(arr[i]) === norm(x)) get += q.score / q.answer.length; });
    return Math.round(get * 100) / 100;
  }
  return 0;
}

function examQuestions(exam, post) {
  return db.questions.filter((q) => q.status === 'active' && q.post === post);
}

// 重算作答汇总分
function recalcAttempt(att) {
  att.total = Math.round(att.items.reduce((s, i) => s + (i.awarded || 0), 0) * 100) / 100;
  att.objectiveTotal = Math.round(att.items.filter((i) => i.objective).reduce((s, i) => s + (i.awarded || 0), 0) * 100) / 100;
  att.status = att.items.every((i) => i.awarded !== null && i.awarded !== undefined) ? 'graded' : 'submitted';
  if (att.status === 'graded') {
    att.gradedAt = att.gradedAt || nowIso();
  }
}

// 结考：为缺考者补 absent 记录，同步补考名单
function closeExam(exam) {
  const roster = examRoster(exam);
  roster.forEach((u) => {
    let att = db.attempts.find((a) => a.examId === exam.id && a.userId === u.id);
    if (!att) {
      att = {
        id: uid('a'), userId: u.id, examId: exam.id, post: u.post,
        status: 'absent', startedAt: null, submittedAt: null, gradedBy: null, gradedAt: null,
        comment: '', items: [], objectiveTotal: 0, total: 0,
      };
      db.attempts.push(att);
    } else if (att.status === 'ongoing' || att.status === 'not_started') {
      att.status = 'absent';
    }
  });
  exam.status = 'closed';
  exam.closedAt = nowIso();
  syncMakeup(exam);
}

// 根据成绩/缺考同步补考名单（仅普通正考，且已有已发布的补考时不自动建卷，由护理部手动“一键生成”）
function syncMakeup(exam) {
  const pass = exam.passScore;
  examRoster(exam).forEach((u) => {
    const att = db.attempts.find((a) => a.examId === exam.id && a.userId === u.id);
    let need = false, reason = '';
    if (!att || att.status === 'absent') { need = true; reason = '缺考'; }
    else if (att.status === 'graded' && att.total < pass) { need = true; reason = `不合格（${att.total}分）`; }
    else if (att.status === 'submitted') { need = true; reason = '主观题批阅中'; }
    if (!need) return;
    const exist = db.makeupRoster.find((m) => m.sourceExamId === exam.id && m.userId === u.id);
    if (!exist) {
      db.makeupRoster.push({
        id: uid('m'), examId: null, sourceExamId: exam.id, userId: u.id,
        reason, notified: false, createdAt: nowIso(),
      });
    } else {
      exist.reason = reason;
    }
  });
}

// 培训档案
function personArchive(userId) {
  const user = getUser(userId);
  const list = db.attempts
    .filter((a) => a.userId === userId && a.status !== 'absent' && a.submittedAt)
    .map((a) => {
      const exam = find(db.exams, a.examId);
      return {
        attemptId: a.id, examId: a.examId, title: exam?.title || '(已删除考试)',
        post: a.post, total: a.total, status: a.status,
        passScore: exam?.passScore, passed: a.status === 'graded' && a.total >= (exam?.passScore ?? 60),
        credits: a.status === 'graded' && a.total >= (exam?.passScore ?? 60) ? exam?.credits || 0 : 0,
        submittedAt: a.submittedAt, gradedAt: a.gradedAt,
      };
    })
    .sort((x, y) => new Date(y.submittedAt) - new Date(x.submittedAt));
  const absents = db.attempts
    .filter((a) => a.userId === userId && a.status === 'absent')
    .map((a) => ({ examId: a.examId, title: find(db.exams, a.examId)?.title || '', status: 'absent' }));
  const graded = list.filter((x) => x.status === 'graded');
  return {
    userId, name: user.name, dept: user.dept, post: user.post,
    totalExams: graded.length,
    avgScore: graded.length ? Math.round((graded.reduce((s, x) => s + x.total, 0) / graded.length) * 10) / 10 : null,
    passRate: graded.length ? Math.round((graded.filter((x) => x.passed).length / graded.length) * 1000) / 10 : null,
    totalCredits: list.reduce((s, x) => s + x.credits, 0),
    records: list, absents,
  };
}

// 薄弱知识点聚合：att 范围给定
function weakPoints(attemptsFilter, limit = 20) {
  const map = new Map(); // kp -> {kp, post, total, wrong, objectiveCount, scoreGot, scoreMax}
  for (const a of db.attempts.filter(attemptsFilter)) {
    if (a.status === 'absent') continue;
    for (const it of (a.items || [])) {
      if (!it.kp) continue;
      const key = it.kp + '@@' + a.post;
      if (!map.has(key)) map.set(key, { kp: it.kp, post: a.post, people: new Set(), wrongPeople: new Set(), total: 0, wrong: 0 });
      const m = map.get(key);
      m.total++;
      m.people.add(a.userId);
      const lost = (it.awarded || 0) < (it.max || 0) * 0.6;
      const wrong = it.objective ? !(it.awarded >= it.max) : lost;
      if (wrong) { m.wrong++; m.wrongPeople.add(a.userId); }
    }
  }
  const rows = [...map.values()].map((m) => ({
    kp: m.kp, post: m.post, postLabel: POST_LABEL[m.post],
    answers: m.total, wrongAnswers: m.wrong,
    wrongRate: m.total ? Math.round((m.wrong / m.total) * 1000) / 10 : 0,
    people: m.people.size, weakPeople: m.wrongPeople.size,
  })).sort((a, b) => b.wrongRate - a.wrongRate || b.wrongAnswers - a.wrongAnswers);
  return rows.slice(0, limit);
}

function examSummary(exam) {
  const roster = examRoster(exam);
  const atts = db.attempts.filter((a) => a.examId === exam.id);
  const graded = atts.filter((a) => a.status === 'graded');
  const pending = atts.filter((a) => a.status === 'submitted');
  const absent = roster.filter((u) => {
    const a = atts.find((x) => x.userId === u.id);
    return !a || a.status === 'absent';
  });
  const submitted = atts.filter((a) => a.status === 'graded' || a.status === 'submitted');
  const scores = graded.map((a) => a.total);
  const byPost = {};
  for (const p of exam.posts) {
    const gs = graded.filter((a) => a.post === p).map((a) => a.total);
    byPost[p] = {
      label: POST_LABEL[p],
      roster: roster.filter((u) => u.post === p).length,
      submitted: submitted.filter((a) => a.post === p).length,
      graded: gs.length,
      absent: absent.filter((u) => u.post === p).length,
      avg: gs.length ? Math.round((gs.reduce((s, v) => s + v, 0) / gs.length) * 10) / 10 : null,
      pass: gs.filter((v) => v >= exam.passScore).length,
    };
  }
  return {
    examId: exam.id, title: exam.title, status: exam.status, liveStatus: examLiveStatus(exam),
    passScore: exam.passScore,
    rosterCount: roster.length,
    submittedCount: submitted.length,
    gradedCount: graded.length,
    pendingCount: pending.length,
    absentCount: absent.length,
    absentUsers: absent.map((u) => ({ id: u.id, name: u.name, dept: u.dept, post: u.post })),
    avgScore: scores.length ? Math.round((scores.reduce((s, v) => s + v, 0) / scores.length) * 10) / 10 : null,
    maxScore: scores.length ? Math.max(...scores) : null,
    minScore: scores.length ? Math.min(...scores) : null,
    passCount: scores.filter((v) => v >= exam.passScore).length,
    passRate: scores.length ? Math.round((scores.filter((v) => v >= exam.passScore).length / scores.length) * 1000) / 10 : null,
    byPost,
  };
}

/* ---------------- HTTP 工具 ---------------- */
function send(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}
const ok = (res, data) => send(res, 200, { ok: true, data });
const fail = (res, code, msg) => send(res, code, { ok: false, error: msg });

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 5e6) reject(new Error('body too large')); });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch { reject(new Error('invalid JSON')); }
    });
    req.on('error', reject);
  });
}

const publicUser = (u) => ({ id: u.id, username: u.username, name: u.name, role: u.role, roleLabel: ROLE_LABEL[u.role], post: u.post, postLabel: u.post ? POST_LABEL[u.post] : null, dept: u.dept });

/* ================ 路由 ================ */
const routes = [];
function route(method, pattern, roles, handler) {
  routes.push({ method, pattern: new RegExp('^' + pattern.replace(/:([\w]+)/g, '(?<$1>[\\w-]+)') + '$'), roles, handler });
}

/* ---------- 认证 ---------- */
route('POST', '/api/auth/login', null, async (req, res) => {
  const { username, password } = await readBody(req);
  const user = db.users.find((u) => u.username === String(username || '').trim());
  if (!user || user.password !== sha(password || '')) return fail(res, 401, '用户名或密码错误');
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, { uid: user.id, loginAt: nowIso() });
  ok(res, { token, user: publicUser(user) });
});
route('POST', '/api/auth/logout', null, (req, res) => {
  const t = req.headers['x-auth-token'];
  if (t) sessions.delete(t);
  ok(res, { loggedOut: true });
});
route('GET', '/api/auth/me', '@login', (req, res, user) => ok(res, publicUser(user)));

/* ---------- 人员管理（护理部） ---------- */
route('GET', '/api/users', 'nursing', (req, res) => ok(res, db.users.map(publicUser)));
route('POST', '/api/users', 'nursing', async (req, res) => {
  const b = await readBody(req);
  if (!b.username || !b.name || !b.role) return fail(res, 400, '用户名、姓名、角色必填');
  if (db.users.some((u) => u.username === b.username.trim())) return fail(res, 409, '用户名已存在');
  if (b.role === 'examinee' && !['nurse', 'doctor', 'technician'].includes(b.post)) return fail(res, 400, '请为考生选择岗位');
  const u = {
    id: uid('u'), username: b.username.trim(), name: b.name, role: b.role,
    post: b.role === 'examinee' ? b.post : (b.post || null),
    dept: b.dept || '', password: sha(b.password || '123456'),
  };
  db.users.push(u); saveDb();
  ok(res, publicUser(u));
});
route('PUT', '/api/users/:id', 'nursing', async (req, res, user, m) => {
  const u = find(db.users, m.id);
  if (!u) return fail(res, 404, '用户不存在');
  const b = await readBody(req);
  ['name', 'dept', 'role', 'post'].forEach((k) => { if (b[k] !== undefined) u[k] = b[k]; });
  if (b.password) u.password = sha(b.password);
  saveDb();
  ok(res, publicUser(u));
});
route('DELETE', '/api/users/:id', 'nursing', (req, res, user, m) => {
  const idx = db.users.findIndex((u) => u.id === m.id);
  if (idx < 0) return fail(res, 404, '用户不存在');
  if (db.users[idx].username === 'admin') return fail(res, 400, '内置管理员不可删除');
  db.users.splice(idx, 1); saveDb();
  ok(res, { deleted: true });
});

/* ---------- 题库（护理部全部；老师本科室相关岗位只读；考生不可见） ---------- */
route('GET', '/api/questions', '@any', (req, res, user, m, query) => {
  if (user.role === 'examinee') return fail(res, 403, '考生不能直接查看题库，请在考试时间内进入答题');
  if (user.role === 'admin') return fail(res, 403, '院级视图仅提供汇总数据，不开放题库');
  let list = db.questions;
  if (query.post) list = list.filter((q) => q.post === query.post);
  if (query.type) list = list.filter((q) => q.type === query.type);
  if (query.kp) list = list.filter((q) => q.kp.includes(query.kp));
  if (user.role === 'teacher') list = list.filter((q) => q.post === user.post); // 老师只看本岗位题库
  ok(res, list.map((q) => ({ ...q, typeLabel: TYPE_LABEL[q.type], postLabel: POST_LABEL[q.post] })));
});
route('POST', '/api/questions', 'nursing', async (req, res) => {
  const b = await readBody(req);
  if (!b.post || !b.type || !b.stem || !b.score) return fail(res, 400, '岗位、题型、题干、分值必填');
  const q = {
    id: uid('q'), post: b.post, type: b.type, stem: b.stem,
    options: b.options || (b.type === 'judge' ? ['正确', '错误'] : null),
    answer: b.answer ?? null, blanks: b.blanks || null,
    reference: b.reference || '', score: Number(b.score), kp: b.kp || '未分类',
    status: b.status || 'active',
  };
  db.questions.push(q); saveDb();
  ok(res, q);
});
route('PUT', '/api/questions/:id', 'nursing', async (req, res, user, m) => {
  const q = find(db.questions, m.id);
  if (!q) return fail(res, 404, '题目不存在');
  const b = await readBody(req);
  ['post', 'type', 'stem', 'options', 'answer', 'blanks', 'reference', 'score', 'kp', 'status'].forEach((k) => {
    if (b[k] !== undefined) q[k] = b[k];
  });
  saveDb(); ok(res, q);
});
route('DELETE', '/api/questions/:id', 'nursing', (req, res, user, m) => {
  const idx = db.questions.findIndex((q) => q.id === m.id);
  if (idx < 0) return fail(res, 404, '题目不存在');
  db.questions.splice(idx, 1); saveDb();
  ok(res, { deleted: true });
});

/* ---------- 考试 ---------- */
function serializeExam(e) {
  return { ...e, liveStatus: examLiveStatus(e), postLabels: e.posts.map((p) => POST_LABEL[p]) };
}
route('GET', '/api/exams', '@login', (req, res, user, m, query) => {
  let list = db.exams.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (user.role === 'examinee') {
    // 考生只能看到已发布且本人在名单内的考试
    list = list.filter((e) => e.status !== 'draft' && examRoster(e).some((u) => u.id === user.id));
    if (query.status === 'mine') {
      // 附带个人状态
    }
  } else if (user.role === 'teacher') {
    list = list.filter((e) => e.status !== 'draft' || e.createdBy); // 老师可见所有非草稿
    list = list.filter((e) => e.posts.includes(user.post));
  }
  if (query.status) list = list.filter((e) => examLiveStatus(e) === query.status || e.status === query.status);
  ok(res, list.map(serializeExam));
});

route('POST', '/api/exams', 'nursing', async (req, res) => {
  const b = await readBody(req);
  if (!b.title || !b.startTime || !b.endTime) return fail(res, 400, '标题与起止时间必填');
  if (new Date(b.endTime) <= new Date(b.startTime)) return fail(res, 400, '结束时间必须晚于开始时间');
  let posts = b.posts;
  if (!Array.isArray(posts) || !posts.length) posts = ['nurse', 'doctor', 'technician'];
  const exam = {
    id: uid('ex'),
    title: b.title, intro: b.intro || '', posts,
    deptScope: b.deptScope === 'all' || !b.deptScope ? 'all' : b.deptScope,
    status: 'draft',
    startTime: new Date(b.startTime).toISOString(), endTime: new Date(b.endTime).toISOString(),
    durationMin: Number(b.durationMin) || 60,
    passScore: Number(b.passScore) || 60,
    credits: Number(b.credits) || 0,
    createdBy: 'u-hulibu', createdAt: nowIso(), publishedAt: null, closedAt: null,
  };
  db.exams.push(exam); saveDb();
  ok(res, serializeExam(exam));
});
route('PUT', '/api/exams/:id', 'nursing', async (req, res, user, m) => {
  const e = find(db.exams, m.id);
  if (!e) return fail(res, 404, '考试不存在');
  if (e.status !== 'draft') return fail(res, 400, '仅草稿状态可编辑');
  const b = await readBody(req);
  ['title', 'intro', 'posts', 'deptScope', 'durationMin', 'passScore', 'credits'].forEach((k) => { if (b[k] !== undefined) e[k] = b[k]; });
  if (b.startTime) e.startTime = new Date(b.startTime).toISOString();
  if (b.endTime) e.endTime = new Date(b.endTime).toISOString();
  saveDb(); ok(res, serializeExam(e));
});
route('POST', '/api/exams/:id/publish', 'nursing', (req, res, user, m) => {
  const e = find(db.exams, m.id);
  if (!e) return fail(res, 404, '考试不存在');
  if (e.status !== 'draft') return fail(res, 400, '仅草稿可发布');
  const missing = e.posts.filter((p) => !db.questions.some((q) => q.status === 'active' && q.post === p));
  if (missing.length) return fail(res, 400, '以下岗位题库为空，无法发布：' + missing.map((p) => POST_LABEL[p]).join('、'));
  e.status = 'published'; e.publishedAt = nowIso(); saveDb();
  ok(res, serializeExam(e));
});
route('POST', '/api/exams/:id/close', 'nursing', (req, res, user, m) => {
  const e = find(db.exams, m.id);
  if (!e) return fail(res, 404, '考试不存在');
  if (e.status === 'closed') return fail(res, 400, '考试已结考');
  closeExam(e); saveDb();
  ok(res, serializeExam(e));
});
route('DELETE', '/api/exams/:id', 'nursing', (req, res, user, m) => {
  const idx = db.exams.findIndex((e) => e.id === m.id);
  if (idx < 0) return fail(res, 404, '考试不存在');
  if (db.exams[idx].status !== 'draft') return fail(res, 400, '仅草稿可删除');
  db.exams.splice(idx, 1); saveDb();
  ok(res, { deleted: true });
});

// 考试名单（护理部/老师）
route('GET', '/api/exams/:id/roster', '@staff', (req, res, user, m) => {
  const e = find(db.exams, m.id);
  if (!e) return fail(res, 404, '考试不存在');
  if (user.role === 'teacher' && !e.posts.includes(user.post)) return fail(res, 403, '仅可查看本岗位考试');
  const roster = examRoster(e).map((u) => {
    const a = db.attempts.find((x) => x.examId === e.id && x.userId === u.id);
    return { ...publicUser(u), attemptStatus: a ? a.status : 'not_started', total: a?.total ?? null };
  });
  ok(res, roster);
});

// 考试汇总（护理部/老师看本科岗位）
route('GET', '/api/exams/:id/summary', '@staff', (req, res, user, m) => {
  const e = find(db.exams, m.id);
  if (!e) return fail(res, 404, '考试不存在');
  const s = examSummary(e);
  if (user.role === 'teacher') {
    s.absentUsers = s.absentUsers.filter((u) => u.post === user.post);
    s.byPost = Object.fromEntries(Object.entries(s.byPost).filter(([p]) => p === user.post));
  }
  ok(res, s);
});

/* ---------- 考生：我的考试 / 试卷 / 交卷 ---------- */
route('GET', '/api/my/exams', 'examinee', (req, res, user) => {
  const list = db.exams
    .filter((e) => e.status !== 'draft' && examRoster(e).some((u) => u.id === user.id))
    .sort((a, b) => new Date(a.startTime) - new Date(b.startTime))
    .map((e) => {
      const a = attemptView(e, user);
      const qs = examQuestions(e, user.post);
      return {
        ...serializeExam(e),
        myStatus: a.status, myTotal: a.total ?? null,
        questionCount: qs.length, fullScore: qs.reduce((s, q) => s + q.score, 0),
        submittedAt: a.submittedAt || null, gradedAt: a.gradedAt || null,
        comment: a.comment || '',
      };
    });
  ok(res, list);
});

route('GET', '/api/exams/:id/paper', 'examinee', (req, res, user, m) => {
  const e = find(db.exams, m.id);
  if (!e) return fail(res, 404, '考试不存在');
  if (!examRoster(e).some((u) => u.id === user.id)) return fail(res, 403, '你不在本场考试名单中');
  const live = examLiveStatus(e);
  if (!['ongoing', 'ended', 'closed'].includes(live)) return fail(res, 400, '考试未开始');
  const att = db.attempts.find((a) => a.examId === e.id && a.userId === user.id);
  if (att && att.submittedAt && att.status !== 'graded' && live !== 'closed') {
    return fail(res, 400, '你已交卷，等待批阅');
  }
  const qs = examQuestions(e, user.post);
  const fullScore = qs.reduce((s, q) => s + q.score, 0);
  // 已结考/已批阅 → 返回解析；进行中 → 不返回答案
  const showAnswer = att?.status === 'graded' || e.status === 'closed';
  const qById = Object.fromEntries(db.questions.map((x) => [x.id, x]));
  const paper = qs.map((q, i) => ({
    idx: i + 1, qid: q.id, type: q.type, typeLabel: TYPE_LABEL[q.type], stem: q.stem,
    options: q.options, blanks: q.blanks, score: q.score, kp: q.kp,
    answer: showAnswer ? (q.answer ?? null) : null,
    reference: showAnswer ? (q.reference || '') : '',
    given: att?.items?.find((it) => it.qid === q.id)?.given ?? null,
    awarded: showAnswer ? (att?.items?.find((it) => it.qid === q.id)?.awarded ?? null) : null,
  }));
  ok(res, {
    exam: serializeExam(e), fullScore, liveStatus: live,
    myStatus: att?.status || 'not_started',
    deadline: att?.startedAt ? new Date(Math.min(new Date(att.startedAt).getTime() + e.durationMin * 60000, new Date(e.endTime).getTime())).toISOString() : null,
    questions: paper,
  });
});

route('POST', '/api/exams/:id/start', 'examinee', (req, res, user, m) => {
  const e = find(db.exams, m.id);
  if (!e) return fail(res, 404, '考试不存在');
  if (!examRoster(e).some((u) => u.id === user.id)) return fail(res, 403, '你不在本场考试名单中');
  if (examLiveStatus(e) !== 'ongoing') return fail(res, 400, '当前不在考试时间段内');
  let att = db.attempts.find((a) => a.examId === e.id && a.userId === user.id);
  if (att && att.submittedAt) return fail(res, 400, '你已交卷，不能重复作答');
  if (!att) {
    att = {
      id: uid('a'), userId: user.id, examId: e.id, post: user.post, status: 'ongoing',
      startedAt: nowIso(), submittedAt: null, gradedBy: null, gradedAt: null, comment: '',
      items: [], objectiveTotal: 0, total: 0,
    };
    db.attempts.push(att); saveDb();
  }
  ok(res, { attemptId: att.id, startedAt: att.startedAt, durationMin: e.durationMin, endTime: e.endTime });
});

route('POST', '/api/exams/:id/submit', 'examinee', async (req, res, user, m) => {
  const e = find(db.exams, m.id);
  if (!e) return fail(res, 404, '考试不存在');
  const live = examLiveStatus(e);
  if (!['ongoing', 'ended'].includes(live)) return fail(res, 400, '当前不在可交卷时间');
  const b = await readBody(req);
  const answers = b.answers || {};
  const qs = examQuestions(e, user.post);
  let att = db.attempts.find((a) => a.examId === e.id && a.userId === user.id);
  if (att && att.submittedAt) return fail(res, 400, '不能重复交卷');
  if (!att) {
    att = { id: uid('a'), userId: user.id, examId: e.id, post: user.post, startedAt: nowIso(), items: [] };
    db.attempts.push(att);
  }
  att.items = qs.map((q) => {
    const given = answers[q.id] != null ? answers[q.id] : (q.type === 'blank' ? [] : (OBJECTIVE_TYPES.includes(q.type) ? null : ''));
    if (OBJECTIVE_TYPES.includes(q.type)) {
      const awarded = gradeObjective(q, given);
      return { qid: q.id, type: q.type, kp: q.kp, given, awarded, max: q.score, objective: true, correct: awarded >= q.score };
    }
    return { qid: q.id, type: q.type, kp: q.kp, given: String(given || ''), awarded: null, max: q.score, objective: false };
  });
  att.submittedAt = nowIso();
  recalcAttempt(att);
  saveDb();
  const hasSubjective = qs.some((q) => !OBJECTIVE_TYPES.includes(q.type));
  ok(res, {
    submitted: true, status: att.status,
    objectiveTotal: att.objectiveTotal,
    total: att.status === 'graded' ? att.total : att.objectiveTotal,
    message: hasSubjective ? '客观题已自动判分，主观题等待科室老师批阅' : '客观题已全部判分',
  });
});

/* ---------- 科室老师：批阅主观题 ---------- */
route('GET', '/api/grading/pending', 'teacher', (req, res, user) => {
  // 老师批阅：本岗位 + （本科室考生 或 护理部委托的全岗位）。科室老师默认批阅本岗位全部科室
  const rows = db.attempts
    .filter((a) => a.status === 'submitted' && a.post === user.post)
    .map((a) => {
      const e = find(db.exams, a.examId);
      const u = getUser(a.userId);
      const subj = a.items.filter((i) => !i.objective);
      return {
        attemptId: a.id, examId: a.examId, examTitle: e?.title,
        userId: u.id, name: u.name, dept: u.dept, submittedAt: a.submittedAt,
        objectiveTotal: a.objectiveTotal,
        subjectCount: subj.length,
        subjectScore: subj.reduce((s, i) => s + i.max, 0),
      };
    })
    .sort((a, b) => new Date(a.submittedAt) - new Date(b.submittedAt));
  ok(res, rows);
});
route('GET', '/api/grading/:attemptId', 'teacher', (req, res, user, m) => {
  const a = find(db.attempts, m.attemptId);
  if (!a) return fail(res, 404, '作答不存在');
  if (a.post !== user.post) return fail(res, 403, '仅可批阅本岗位考生试卷');
  const e = find(db.exams, a.examId);
  const qmap = Object.fromEntries(db.questions.map((q) => [q.id, q]));
  ok(res, {
    attemptId: a.id, exam: { id: e.id, title: e.title, passScore: e.passScore, credits: e.credits },
    student: publicUser(getUser(a.userId)),
    status: a.status, objectiveTotal: a.objectiveTotal, total: a.total, comment: a.comment,
    items: a.items.map((it) => ({
      ...it, typeLabel: TYPE_LABEL[it.type],
      stem: qmap[it.qid]?.stem, reference: qmap[it.qid]?.reference,
    })),
  });
});
route('POST', '/api/grading/:attemptId', 'teacher', async (req, res, user, m) => {
  const a = find(db.attempts, m.attemptId);
  if (!a) return fail(res, 404, '作答不存在');
  if (a.post !== user.post) return fail(res, 403, '仅可批阅本岗位考生试卷');
  if (a.status === 'graded') return fail(res, 400, '该试卷已批阅完成');
  const b = await readBody(req); // { scores: {qid: number}, comment }
  const scores = b.scores || {};
  for (const it of a.items) {
    if (it.objective) continue;
    if (scores[it.qid] === undefined) return fail(res, 400, '请完成全部主观题评分：' + it.qid);
    const v = Number(scores[it.qid]);
    if (Number.isNaN(v) || v < 0 || v > it.max) return fail(res, 400, `分数须在0~${it.max}之间`);
    it.awarded = Math.round(v * 100) / 100;
  }
  a.gradedBy = user.id;
  a.comment = b.comment || '';
  recalcAttempt(a);
  saveDb();
  // 批阅后同步补考名单：合格则撤销待定/不合格记录；不合格则登记/更新
  const e = find(db.exams, a.examId);
  if (e) {
    if (a.total >= e.passScore) {
      // 考生正常交卷且合格，不应在补考名单中（缺考考生不会有提交记录）
      db.makeupRoster = db.makeupRoster.filter((mm) => !(mm.sourceExamId === e.id && mm.userId === a.userId));
    } else {
      const reason = `不合格（${a.total}分）`;
      const exist = db.makeupRoster.find((mm) => mm.sourceExamId === e.id && mm.userId === a.userId);
      if (exist) { exist.reason = reason; if (!exist.examId) exist.notified = false; }
      else db.makeupRoster.push({ id: uid('m'), examId: null, sourceExamId: e.id, userId: a.userId, reason, notified: false, createdAt: nowIso() });
    }
    saveDb();
  }
  ok(res, { graded: true, total: a.total, passed: a.total >= e.passScore });
});

/* ---------- 培训档案 ---------- */
route('GET', '/api/my/archive', 'examinee', (req, res, user) => ok(res, personArchive(user.id)));
route('GET', '/api/archive/:userId', '@staff', (req, res, user, m) => {
  const target2 = getUser(m.userId);
  if (!target2) return fail(res, 404, '人员不存在');
  if (user.role === 'teacher' && target2.post !== user.post) return fail(res, 403, '仅可查看本岗位人员档案');
  ok(res, personArchive(m.userId));
});

/* ---------- 补考名单（护理部、老师） ---------- */
route('GET', '/api/makeup', '@staff', (req, res, user, m, query) => {
  let rows = db.makeupRoster.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (user.role === 'teacher') rows = rows.filter((r) => getUser(r.userId)?.post === user.post);
  if (query.source) rows = rows.filter((r) => r.sourceExamId === query.source);
  ok(res, rows.map((r) => ({
    ...r,
    userName: getUser(r.userId)?.name, dept: getUser(r.userId)?.dept,
    post: getUser(r.userId)?.post, postLabel: POST_LABEL[getUser(r.userId)?.post],
    sourceTitle: find(db.exams, r.sourceExamId)?.title,
    makeupTitle: r.examId ? find(db.exams, r.examId)?.title : null,
  })));
});
route('POST', '/api/makeup/notify', 'nursing', async (req, res) => {
  const b = await readBody(req);
  const ids = b.ids || [];
  let n = 0;
  db.makeupRoster.forEach((r) => { if (ids.includes(r.id)) { r.notified = true; n++; } });
  saveDb(); ok(res, { notified: n });
});
// 一键创建补考（护理部）：基于某场正考
route('POST', '/api/exams/:id/makeup', 'nursing', async (req, res, user, m) => {
  const src = find(db.exams, m.id);
  if (!src) return fail(res, 404, '考试不存在');
  if (src.status !== 'closed') return fail(res, 400, '正考结考后方可安排补考');
  const b = await readBody(req);
  const exam = {
    id: uid('ex'),
    title: b.title || src.title + '·补考',
    intro: b.intro || '面向本场考试缺考及不合格人员。',
    posts: src.posts, deptScope: src.deptScope, status: 'published',
    startTime: new Date(b.startTime).toISOString(), endTime: new Date(b.endTime).toISOString(),
    durationMin: src.durationMin, passScore: src.passScore, credits: Math.max(1, Math.floor((src.credits || 2) / 2)),
    createdBy: 'u-hulibu', createdAt: nowIso(), publishedAt: nowIso(), closedAt: null,
    sourceExamId: src.id,
  };
  db.exams.push(exam);
  // 将补考名单中来源该场且尚未安排补考的人员挂到新考试
  db.makeupRoster.forEach((r) => {
    if (r.sourceExamId === src.id && !r.examId) r.examId = exam.id;
  });
  saveDb(); ok(res, serializeExam(exam));
});

/* ---------- 薄弱知识点 ---------- */
route('GET', '/api/weakpoints', '@login', (req, res, user, m, query) => {
  // 院级管理员：全院汇总（只看知识点聚合，不落具体人）；护理部：全院；老师：本岗位
  let filt;
  if (query.examId) {
    const eid = query.examId;
    filt = (a) => a.examId === eid;
  } else {
    filt = () => true;
  }
  let rows = weakPoints(filt, 100);
  if (user.role === 'teacher') rows = rows.filter((r) => r.post === user.post);
  if (user.role === 'admin') rows = rows.map((r) => { const { people, weakPeople, ...rest } = r; return rest; });
  if (query.post) rows = rows.filter((r) => r.post === query.post);
  // 院级管理员不返回涉及人员规模明细中的个人标识（本就只有聚合人数，安全）
  ok(res, rows);
});

/* ---------- 院级汇总看板（仅管理员 + 护理部可访问同一接口，admin 只拿到汇总） ---------- */
route('GET', '/api/dashboard/hospital', '@adminOrNursing', (req, res) => {
  const exams = db.exams.filter((e) => e.status !== 'draft');
  const allGraded = db.attempts.filter((a) => a.status === 'graded');
  const allSubmitted = db.attempts.filter((a) => a.status === 'graded' || a.status === 'submitted');
  const allAbsent = db.attempts.filter((a) => a.status === 'absent');
  const examStats = exams.map(examSummary);
  // 全院按岗位平均分
  const postAgg = ['nurse', 'doctor', 'technician'].map((p) => {
    const gs = allGraded.filter((a) => a.post === p).map((a) => a.total);
    return {
      post: p, label: POST_LABEL[p], graded: gs.length,
      avg: gs.length ? Math.round((gs.reduce((s, v) => s + v, 0) / gs.length) * 10) / 10 : null,
      passRate: gs.length ? Math.round((gs.filter((v) => v >= 60).length / gs.length) * 1000) / 10 : null,
    };
  });
  const kps = weakPoints(() => true, 10);
  ok(res, {
    kpi: {
      examCount: exams.length,
      publishedOngoing: exams.filter((e) => ['scheduled', 'ongoing', 'ended'].includes(examLiveStatus(e))).length,
      examineeCount: db.users.filter((u) => u.role === 'examinee').length,
      gradedCount: allGraded.length,
      pendingGrading: allSubmitted.filter((a) => a.status === 'submitted').length,
      absentCount: allAbsent.length,
      makeupListCount: db.makeupRoster.filter((r) => !r.examId).length,
      avgScore: allGraded.length ? Math.round((allGraded.reduce((s, a) => s + a.total, 0) / allGraded.length) * 10) / 10 : null,
    },
    postAgg,
    weakTop: kps.map((r) => { const { people, weakPeople, ...rest } = r; return rest }),
    exams: examStats.map((e) => {
      const { absentUsers, ...agg } = e;
      return agg;
    }),
  });
});

/* ================= 服务器分发 ================= */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.ico': 'image/x-icon', '.json': 'application/json; charset=utf-8',
};
const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://x');
    const pathname = decodeURIComponent(u.pathname);
    const query = Object.fromEntries(u.searchParams.entries());

    if (pathname.startsWith('/api/')) {
      const user = auth(req);
      for (const r of routes) {
        if (r.method !== req.method) continue;
        const mm = r.pattern.exec(pathname);
        if (!mm) continue;
        // 角色校验
        if (r.roles === '@login') { if (!user) return fail(res, 401, '请先登录'); }
        else if (r.roles === '@any') { if (!user) return fail(res, 401, '请先登录'); }
        else if (r.roles === '@staff') { if (!user || !['nursing', 'teacher'].includes(user.role)) return fail(res, 403, '无权限'); }
        else if (r.roles === '@adminOrNursing') { if (!user || !['admin', 'nursing'].includes(user.role)) return fail(res, 403, '无权限'); }
        else if (r.roles) {
          const allow = Array.isArray(r.roles) ? r.roles : [r.roles];
          if (!user || !allow.includes(user.role)) return fail(res, 403, '无权限');
        }
        return await r.handler(req, res, user, mm.groups || {}, query);
      }
      return fail(res, 404, '接口不存在: ' + pathname);
    }

    // 静态文件
    let file = pathname === '/' ? '/index.html' : pathname;
    let fp = path.normalize(path.join(PUBLIC, file));
    if (!fp.startsWith(PUBLIC)) return fail(res, 403, '禁止访问');
    if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) fp = path.join(PUBLIC, 'index.html');
    const ext = path.extname(fp);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    fs.createReadStream(fp).pipe(res);
  } catch (err) {
    if (err.message === 'invalid JSON') return fail(res, 400, '请求数据格式错误');
    console.error(err);
    fail(res, 500, '服务器内部错误: ' + err.message);
  }
});

server.listen(PORT, () => {
  console.log('三基考试管理系统已启动: http://localhost:' + PORT);
  console.log('演示账号: admin / hulibu / teacher_hu / wangxue   密码均为 123456');
});
