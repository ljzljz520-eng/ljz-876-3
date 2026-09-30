'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

// 临时数据库，避免污染演示库
const dbFile = path.join(os.tmpdir(), `sanji-test-${process.pid}.db`);
process.env.DB_FILE = dbFile;
process.env.TOKEN_SECRET = 'test-secret';
process.env.PORT = '0';

const { resetDb, getDb } = require('../server/src/db');
const { hashPassword } = require('../server/src/auth');
const app = require('../server/src/index');

let server, base;

function t(offsetMin) {
  const d = new Date(Date.now() + offsetMin * 60000);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

async function api(method, p, token, body) {
  const res = await fetch(base + '/api' + p, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}
const login = async (username) => (await api('POST', '/login', null, { username, password: username === 'nursing' || username === 'hospital' || username.startsWith('teacher') ? 'pw' : 'pw' })).data.token;

test.before(async () => {
  resetDb(dbFile);
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
  await seed();
});

test.after(() => { server.close(); for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(dbFile + s); } catch {} } });

function seed() {
  const db = getDb();
  const mk = (username, real, role, jobType, dept) => {
    const { salt, hash } = hashPassword('pw');
    return db.prepare('INSERT INTO users(username,password_hash,salt,real_name,role,job_type,dept_id) VALUES (?,?,?,?,?,?,?)')
      .run(username, hash, salt, real, role, jobType, dept || null).lastInsertRowid;
  };
  const d1 = db.prepare("INSERT INTO departments(name) VALUES ('一病区')").run().lastInsertRowid;
  const d2 = db.prepare("INSERT INTO departments(name) VALUES ('二病区')").run().lastInsertRowid;
  mk('nursing', '护理部', 'nursing_admin', null, null);
  mk('hospital', '院级', 'hospital_admin', null, null);
  mk('teacher1', '一病区老师', 'dept_teacher', null, d1);
  mk('n1', '护士甲', 'examinee', 'nurse', d1);
  mk('n2', '护士乙', 'examinee', 'nurse', d1);
  mk('d3doc', '医生甲', 'examinee', 'doctor', d1);

  const kpN = db.prepare("INSERT INTO knowledge_points(job_type,name) VALUES ('nurse','护理基础')").run().lastInsertRowid;
  const kpD = db.prepare("INSERT INTO knowledge_points(job_type,name) VALUES ('doctor','诊疗基础')").run().lastInsertRowid;
  const insQ = db.prepare('INSERT INTO questions(job_type,type,kp_id,stem,options_json,answer_json,reference_answer,score,created_by) VALUES (?,?,?,?,?,?,?,?,?)');
  // 护士题
  insQ.run('nurse', 'single', kpN, '单选1', JSON.stringify(['A. x', 'B. y']), JSON.stringify('A'), null, 2, 1);
  insQ.run('nurse', 'single', kpN, '单选2', JSON.stringify(['A. x', 'B. y']), JSON.stringify('B'), null, 2, 1);
  insQ.run('nurse', 'multi', kpN, '多选1', JSON.stringify(['A. x', 'B. y', 'C. z']), JSON.stringify(['A', 'B']), null, 3, 1);
  insQ.run('nurse', 'judge', kpN, '判断1', null, JSON.stringify(true), null, 2, 1);
  insQ.run('nurse', 'essay', kpN, '简答1', null, JSON.stringify(''), '评分要点XYZ', 4, 1);
  // 医生题（验证岗位隔离）
  insQ.run('doctor', 'single', kpD, '医生单选1', JSON.stringify(['A. x', 'B. y']), JSON.stringify('A'), null, 2, 1);
}

let nurseExamId;

test('护理部发布分岗位考试并自动生成名册与试卷', async () => {
  const tk = await login('nursing');
  const depts = (await api('GET', '/departments', tk)).data;
  const ward1 = depts.find((d) => d.name === '一病区').id;
  const r = await api('POST', '/exams', tk, {
    title: '护理三基测试', job_type: 'nurse', dept_ids: [ward1],
    start_time: t(-5), end_time: t(60), duration_minutes: 30, pass_score: 8,
    composition: [
      { type: 'single', count: 2, score_each: 2 },
      { type: 'multi', count: 1, score_each: 3 },
      { type: 'judge', count: 1, score_each: 2 },
      { type: 'essay', count: 1, score_each: 4 },
    ],
  });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  nurseExamId = r.data.id;
  const db = getDb();
  assert.equal(db.prepare('SELECT COUNT(*) c FROM exam_roster WHERE exam_id=?').get(nurseExamId).c, 2, '名册应为2名护士');
  assert.equal(db.prepare('SELECT COUNT(*) c FROM exam_questions WHERE exam_id=?').get(nurseExamId).c, 5);
  assert.equal(db.prepare('SELECT total_score FROM exams WHERE id=?').get(nurseExamId).total_score, 13);
});

test('题量不足时拒绝组卷', async () => {
  const tk = await login('nursing');
  const ward1 = (await api('GET', '/departments', tk)).data.find((d) => d.name === '一病区').id;
  const r = await api('POST', '/exams', tk, {
    title: '题量不足场', job_type: 'doctor', dept_ids: [ward1],
    start_time: t(-5), end_time: t(60), duration_minutes: 30, pass_score: 60,
    composition: [{ type: 'single', count: 5, score_each: 2 }],
  });
  assert.equal(r.status, 400);
  assert.match(r.data.error, /题量不足/);
});

test('考生只能看到本岗位考试与题库；看不到答案', async () => {
  const n = await login('n1');
  const list = (await api('GET', '/exams', n)).data;
  assert.ok(Array.isArray(list));
  assert.ok(list.some((e) => e.id === nurseExamId));
  const d = await login('d3doc');
  const docList = (await api('GET', '/exams', d)).data;
  assert.ok(!docList.some((e) => e.id === nurseExamId), '医生不应看到护理岗位考试');
  const qs = (await api('GET', '/questions', n)).data;
  assert.ok(qs.every((q) => q.job_type === 'nurse'));
  assert.ok(qs.every((q) => q.answer === undefined), '考生不能看到标准答案');
  const dqs = (await api('GET', '/questions', d)).data;
  assert.ok(dqs.every((q) => q.job_type === 'doctor'));
});

test('考生参加考试：客观题自动判分，主观题待批阅', async () => {
  const n1 = await login('n1');
  await api('POST', `/exams/${nurseExamId}/start`, n1);
  const paper = (await api('GET', `/exams/${nurseExamId}/paper`, n1)).data;
  const qmap = {};
  paper.questions.forEach((q) => { qmap[q.type] = q; });
  const responses = paper.questions.map((q) => {
    if (q.type === 'single') return { eq_id: q.eq_id, response: 'A' }; // 第一题对(A)、第二题错(正确答案B)
    if (q.type === 'multi') return { eq_id: q.eq_id, response: ['A'] }; // 漏选 => 错
    if (q.type === 'judge') return { eq_id: q.eq_id, response: true }; // 正确
    return { eq_id: q.eq_id, response: '作答内容' };
  });
  const r = await api('POST', `/exams/${nurseExamId}/submit`, n1, { responses });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.graded, 0, '含主观题不应自动完结');
  assert.equal(r.data.objective_score, 4, '一个单选2分+判断2分=4分');
  // 不能重复交卷/开考
  const again = await api('POST', `/exams/${nurseExamId}/start`, n1);
  assert.equal(again.status, 409);
});

test('科室老师批阅主观题：总分归档，不合格自动进入补考名单', async () => {
  const teacher = await login('teacher1');
  const pending = (await api('GET', `/exams/${nurseExamId}/grading/pending?ungraded=1`, teacher)).data;
  assert.equal(pending.list.length, 1);
  const attemptId = pending.list[0].attempt_id;
  const detail = (await api('GET', `/attempts/${attemptId}`, teacher)).data;
  const essay = detail.answers.find((a) => a.type === 'essay');
  // 越界分值在批阅完成前应被拒绝
  const badRange = await api('POST', `/attempts/${attemptId}/grade`, teacher, { scores: { [essay.eq_id]: 99 } });
  assert.equal(badRange.status, 400);
  // 客观4 + 主观1 = 5 < 合格线8 => 不合格
  const g = await api('POST', `/attempts/${attemptId}/grade`, teacher, { scores: { [essay.eq_id]: { score: 1, comment: '要点不全' } }, comment: '需补考' });
  assert.equal(g.status, 200, JSON.stringify(g.data));
  assert.equal(g.data.total_score, 5);
  assert.equal(g.data.result, 'fail');
  const db = getDb();
  const tr = db.prepare('SELECT * FROM training_records WHERE user_id=? AND exam_id=?').get(detail.user_id, nurseExamId);
  assert.ok(tr && tr.result === 'fail', '培训档案已归档为不合格');
  const mk = db.prepare("SELECT * FROM makeup_list WHERE exam_id=? AND user_id=? AND reason='fail'").get(nurseExamId, detail.user_id);
  assert.ok(mk, '不合格应自动入补考名单');
  // 已批阅后允许更新成绩（修正批阅），档案与补考状态同步更新
  const dup = await api('POST', `/attempts/${attemptId}/grade`, teacher, { scores: { [essay.eq_id]: 2 } });
  assert.equal(dup.status, 200);
  assert.equal(dup.data.total_score, 6);
});

test('全对考生：自动客观判分+主观满分 => 合格并归档，不进补考', async () => {
  const n2 = await login('n2');
  await api('POST', `/exams/${nurseExamId}/start`, n2);
  const paper = (await api('GET', `/exams/${nurseExamId}/paper`, n2)).data;
  const db = getDb();
  const responses = paper.questions.map((q) => {
    const answer = JSON.parse(db.prepare('SELECT answer_json FROM questions WHERE id=?').get(q.question_id).answer_json);
    if (q.type === 'essay') return { eq_id: q.eq_id, response: '完整作答' };
    return { eq_id: q.eq_id, response: answer };
  });
  await api('POST', `/exams/${nurseExamId}/submit`, n2, { responses });
  const teacher = await login('teacher1');
  const pending = (await api('GET', `/exams/${nurseExamId}/grading/pending?ungraded=1`, teacher)).data;
  const attemptId = pending.list[0].attempt_id;
  const detail = (await api('GET', `/attempts/${attemptId}`, teacher)).data;
  const essay = detail.answers.find((a) => a.type === 'essay');
  const g = await api('POST', `/attempts/${attemptId}/grade`, teacher, { scores: { [essay.eq_id]: 4 } });
  assert.equal(g.data.total_score, 13);
  assert.equal(g.data.result, 'pass');
});

test('截止后未交卷 => 缺考并自动进入补考名单', async () => {
  // n2 已交卷；新建一场只有 n1 n2 的考试，二人都不交，直接截止
  const tk = await login('nursing');
  const ward1 = (await api('GET', '/departments', tk)).data.find((d) => d.name === '一病区').id;
  const r = await api('POST', '/exams', tk, {
    title: '缺考测试场', job_type: 'nurse', dept_ids: [ward1],
    start_time: t(-30), end_time: t(10), duration_minutes: 30, pass_score: 60,
    composition: [{ type: 'single', count: 2, score_each: 2 }],
  });
  const examId = r.data.id;
  dbTimeTravel(examId, -1); // 把结束时间改到过去
  const closed = await api('POST', `/exams/${examId}/close`, tk);
  assert.equal(closed.data.status, 'closed');
  const db = getDb();
  const absents = db.prepare("SELECT user_id FROM exam_roster WHERE exam_id=? AND status='absent'").all(examId);
  assert.equal(absents.length, 2);
  const mk = db.prepare("SELECT COUNT(*) c FROM makeup_list WHERE exam_id=? AND reason='absent'").get(examId).c;
  assert.equal(mk, 2, '两名缺考者都应进入补考名单');
  // 考生本人可见自己的补考记录
  const n1 = await login('n1');
  const my = (await api('GET', '/makeup', n1)).data;
  assert.ok(my.some((m) => m.exam_id === examId && m.reason === 'absent'));
});

test('惰性截止：访问列表时自动把到期考试关闭并生成缺考', async () => {
  const tk = await login('nursing');
  const ward1 = (await api('GET', '/departments', tk)).data.find((d) => d.name === '一病区').id;
  const r = await api('POST', '/exams', tk, {
    title: '惰性截止场', job_type: 'nurse', dept_ids: [ward1],
    start_time: t(-30), end_time: t(-1), duration_minutes: 30, pass_score: 60,
    composition: [{ type: 'single', count: 1, score_each: 2 }],
  });
  const examId = r.data.id;
  const exams = (await api('GET', '/exams', tk)).data;
  const e = exams.find((x) => x.id === examId);
  assert.equal(e.status, 'closed', '访问列表时应自动截止');
  const db = getDb();
  assert.equal(db.prepare("SELECT COUNT(*) c FROM makeup_list WHERE exam_id=? AND reason='absent'").get(examId).c, 2);
});

test('安排补考专场闭环：入册并更新名单状态', async () => {
  const tk = await login('nursing');
  const ward1 = (await api('GET', '/departments', tk)).data.find((d) => d.name === '一病区').id;
  // 创建一场未来的补考专场
  const mk = await api('POST', '/exams', tk, {
    title: '护理补考专场', job_type: 'nurse', dept_ids: [ward1],
    start_time: t(60), end_time: t(200), duration_minutes: 30, pass_score: 8,
    composition: [{ type: 'single', count: 2, score_each: 2 }, { type: 'judge', count: 1, score_each: 2 }],
  });
  const makeupExamId = mk.data.id;
  const db = getDb();
  // 该专场初始名册为空 -> 发布失败？不会：同科室有2名护士，会自动入册。改为用缺考场的名单挂接
  const listId = db.prepare("SELECT id FROM makeup_list WHERE reason='absent' ORDER BY id LIMIT 1").get().id;
  const r = await api('POST', `/makeup/${listId}/arrange`, tk, { makeup_exam_id: makeupExamId });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(db.prepare('SELECT status FROM makeup_list WHERE id=?').get(listId).status, 'scheduled');
  // 岗位不一致的专场应被拒绝
  const docExam = await api('POST', '/exams', tk, {
    title: '医生场', job_type: 'doctor', dept_ids: [ward1],
    start_time: t(60), end_time: t(200), duration_minutes: 30, pass_score: 60,
    composition: [{ type: 'single', count: 1, score_each: 2 }],
  });
  const bad = await api('POST', `/makeup/${listId}/arrange`, tk, { makeup_exam_id: docExam.data.id });
  assert.equal(bad.status, 400);
});

test('院级管理员：只看汇总与薄弱知识点，不能访问题库/不能建考试', async () => {
  const h = await login('hospital');
  const ov = await api('GET', '/admin/overview', h);
  assert.equal(ov.status, 200);
  assert.ok(ov.data.agg.graded_count >= 2);
  const weak = await api('GET', '/analytics/weak-points', h);
  assert.equal(weak.status, 200);
  assert.ok(Array.isArray(weak.data));
  // 权限边界
  assert.equal((await api('GET', '/questions', h)).status, 403);
  assert.equal((await api('POST', '/exams', h, {})).status, 403);
  assert.equal((await api('POST', '/makeup/1/arrange', h, {})).status, 403);
});

test('科室老师只能看到/批阅本科室数据', async () => {
  const t1 = await login('teacher1');
  const summary = await api('GET', `/exams/${nurseExamId}/summary`, t1);
  assert.equal(summary.status, 200);
  assert.ok(summary.data.roster.every((r) => r.dept_name === '一病区'));
  // 无 token 访问受保护接口
  assert.equal((await api('GET', '/exams', null)).status, 401);
});

test('薄弱知识点统计正确反映得分率', async () => {
  const h = await login('hospital');
  const rows = (await api('GET', `/analytics/weak-points?exam_id=${nurseExamId}`, h)).data;
  const nurseKp = rows.find((r) => r.kp_name === '护理基础');
  assert.ok(nurseKp, '应统计到护理基础知识点');
  assert.ok(nurseKp.mastery_rate >= 0 && nurseKp.mastery_rate <= 100);
});

function dbTimeTravel(examId, offsetMin) {
  getDb().prepare('UPDATE exams SET end_time=? WHERE id=?').run(t(offsetMin), examId);
}

test('批阅更正：不合格改判合格后补考名单自动解除', async () => {
  const teacher = await login('teacher1');
  const db = getDb();
  const n1 = db.prepare("SELECT id FROM users WHERE username='n1'").get().id;
  const attemptId = db.prepare('SELECT id FROM attempts WHERE exam_id=? AND user_id=?').get(nurseExamId, n1).id;
  // 前一用例末尾已改为主观2分（总分6，仍不合格）；改判主观满分 => 客观4+4=8 合格
  const detail = (await api('GET', `/attempts/${attemptId}`, teacher)).data;
  const essay = detail.answers.find((a) => a.type === 'essay');
  const g = await api('POST', `/attempts/${attemptId}/grade`, teacher, { scores: { [essay.eq_id]: 4 } });
  assert.equal(g.data.result, 'pass');
  const row = db.prepare("SELECT status FROM makeup_list WHERE exam_id=? AND user_id=? AND reason='fail'").get(nurseExamId, n1);
  assert.ok(row, '记录应保留但状态闭环');
  assert.equal(row.status, 'resolved');
});
