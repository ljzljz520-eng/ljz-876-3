'use strict';
const { getDb } = require('../db');

function nowStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// ---------- 组卷与发布 ----------
function createExam({ title, level, job_type, dept_ids, start_time, end_time, duration_minutes, pass_score, composition }, creatorId) {
  const db = getDb();
  if (!title || !job_type || !Array.isArray(dept_ids) || dept_ids.length === 0) {
    throw httpError(400, '标题、岗位、面向科室为必填');
  }
  const st = normalizeTime(start_time);
  const et = normalizeTime(end_time);
  if (!(et > st)) throw httpError(400, '结束时间必须晚于开始时间');
  if (!Array.isArray(composition) || composition.length === 0) throw httpError(400, '请配置试卷题型构成');

  // 抽题并校验题量
  const picked = [];
  for (const c of composition) {
    const count = Number(c.count) || 0;
    const scoreEach = Number(c.score_each) || 0;
    if (count <= 0 || scoreEach <= 0) throw httpError(400, '题型数量与单题分值必须大于 0');
    const rows = db.prepare(
      "SELECT id FROM questions WHERE active=1 AND job_type=? AND type=? ORDER BY RANDOM()"
    ).all(job_type, c.type);
    if (rows.length < count) {
      throw httpError(400, `${TYPE_LABEL[c.type] || c.type}题库题量不足：需要 ${count} 题，现有 ${rows.length} 题`);
    }
    rows.slice(0, count).forEach((r) => picked.push({ question_id: r.id, score: scoreEach, type: c.type }));
  }
  const totalScore = picked.reduce((s, q) => s + q.score, 0);

  const tx = db.transaction(() => {
    const info = db.prepare(`INSERT INTO exams
      (title, level, job_type, publish_dept_id, start_time, end_time, duration_minutes, pass_score, total_score, created_by)
      VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run(title, level || 'sanji', job_type, null, st, et, duration_minutes || 60, pass_score || 60, totalScore, creatorId);
    const examId = info.lastInsertRowid;
    const insDept = db.prepare('INSERT INTO exam_depts(exam_id, dept_id) VALUES (?,?)');
    dept_ids.forEach((d) => insDept.run(examId, d));

    // 名册：面向科室中同岗位的在职考生
    const placeholders = dept_ids.map(() => '?').join(',');
    const examinees = db.prepare(
      `SELECT id FROM users WHERE active=1 AND role='examinee' AND job_type=? AND dept_id IN (${placeholders})`
    ).all(job_type, ...dept_ids);
    if (examinees.length === 0) throw httpError(400, '所选科室没有该岗位的在职考生，无法发布');
    const insRoster = db.prepare('INSERT INTO exam_roster(exam_id, user_id) VALUES (?,?)');
    examinees.forEach((e) => insRoster.run(examId, e.id));

    // 题目快照
    const qStmt = db.prepare('SELECT id, type, kp_id, stem, options_json, reference_answer FROM questions WHERE id=?');
    const insEq = db.prepare(`INSERT INTO exam_questions
      (exam_id, question_id, seq, type, kp_id, stem, options_json, reference_answer, score)
      VALUES (?,?,?,?,?,?,?,?,?)`);
    picked.forEach((q, i) => {
      const qrow = qStmt.get(q.question_id);
      insEq.run(examId, q.question_id, i + 1, qrow.type, qrow.kp_id, qrow.stem, qrow.options_json, qrow.reference_answer, q.score);
    });
    return examId;
  });
  return tx();
}

function closeExam(examId) {
  const db = getDb();
  const exam = db.prepare('SELECT * FROM exams WHERE id=?').get(examId);
  if (!exam) throw httpError(404, '考试不存在');
  if (exam.status === 'closed') return exam;
  const tx = db.transaction(() => {
    db.prepare("UPDATE exams SET status='closed' WHERE id=?").run(examId);
    // 未交卷的在册考生 -> 缺考，自动进入补考名单
    const absent = db.prepare(
      "SELECT id, user_id FROM exam_roster WHERE exam_id=? AND status='assigned'"
    ).all(examId);
    const up = db.prepare("UPDATE exam_roster SET status='absent' WHERE id=?");
    const insMakeup = db.prepare(
      `INSERT OR IGNORE INTO makeup_list(exam_id, user_id, reason) VALUES (?,?, 'absent')`
    );
    absent.forEach((r) => { up.run(r.id); insMakeup.run(examId, r.user_id); });
  });
  tx();
  return getDb().prepare('SELECT * FROM exams WHERE id=?').get(examId);
}

// 惰性截止：考试列表/详情/相关接口调用，保证缺考与状态及时落库
function sweepDueExams() {
  const db = getDb();
  const due = db.prepare("SELECT id FROM exams WHERE status='published' AND end_time <= ?").all(nowStr());
  due.forEach((e) => { try { closeExam(e.id); } catch (_) { /* ignore */ } });
}

function ensureFinalized(examId) {
  const exam = getDb().prepare('SELECT * FROM exams WHERE id=?').get(examId);
  if (exam && exam.status === 'published' && exam.end_time <= nowStr()) closeExam(examId);
  return getDb().prepare('SELECT * FROM exams WHERE id=?').get(examId);
}

// ---------- 答题与判分 ----------
function startAttempt(examId, user) {
  const db = getDb();
  const exam = ensureFinalized(examId);
  if (!exam) throw httpError(404, '考试不存在');
  const roster = db.prepare('SELECT * FROM exam_roster WHERE exam_id=? AND user_id=?').get(examId, user.id);
  if (!roster) throw httpError(403, '你不在本场考试的名册中');
  if (roster.status === 'absent') throw httpError(403, '该场考试已结束，你已被记为缺考');
  const now = nowStr();
  if (now < exam.start_time) throw httpError(403, '考试尚未开始');
  if (exam.status === 'closed') throw httpError(403, '考试已结束');
  const existing = db.prepare('SELECT * FROM attempts WHERE exam_id=? AND user_id=?').get(examId, user.id);
  if (existing) throw httpError(409, '你已参加本场考试，不能重复作答');

  const info = db.prepare('INSERT INTO attempts(exam_id, user_id) VALUES (?,?)').run(examId, user.id);
  return { attempt_id: info.lastInsertRowid, exam, started_at: nowStr() };
}

function submitAttempt(examId, user, responses) {
  const db = getDb();
  const exam = ensureFinalized(examId);
  if (!exam || exam.status === 'closed') throw httpError(403, '考试已结束，无法交卷');
  if (nowStr() > exam.end_time) { closeExam(examId); throw httpError(403, '已超过交卷截止时间，按缺考处理'); }
  const attempt = db.prepare('SELECT * FROM attempts WHERE exam_id=? AND user_id=?').get(examId, user.id);
  if (!attempt) throw httpError(404, '请先进入考试');
  if (attempt.submitted_at) throw httpError(409, '试卷已提交，不能重复交卷');

  const eqs = db.prepare('SELECT * FROM exam_questions WHERE exam_id=? ORDER BY seq').all(examId);
  const respMap = new Map();
  (responses || []).forEach((r) => respMap.set(String(r.eq_id), r.response));

  const insAnswer = db.prepare(
    'INSERT INTO answers(attempt_id, exam_question_id, response, score) VALUES (?,?,?,?)'
  );
  const getQ = db.prepare('SELECT answer_json FROM questions WHERE id=?');
  let objective = 0;
  let hasEssay = false;

  const tx = db.transaction(() => {
    for (const eq of eqs) {
      const response = respMap.has(String(eq.id)) ? respMap.get(String(eq.id)) : null;
      let score = null;
      if (eq.type === 'essay') {
        hasEssay = true;
      } else {
        const correct = JSON.parse(getQ.get(eq.question_id).answer_json);
        score = isObjectiveCorrect(eq.type, response, correct) ? eq.score : 0;
        objective += score;
      }
      insAnswer.run(attempt.id, eq.id, response === null || response === undefined ? null : JSON.stringify(response), score);
    }
    db.prepare(`UPDATE attempts SET submitted_at=?, objective_score=?, graded=? WHERE id=?`)
      .run(nowStr(), objective, hasEssay ? 0 : 1, attempt.id);
    db.prepare("UPDATE exam_roster SET status='submitted' WHERE exam_id=? AND user_id=?").run(examId, user.id);
    if (!hasEssay) {
      finalizeAttempt(attempt.id, 0, null, null);
    }
  });
  tx();
  return getAttemptView(db.prepare('SELECT * FROM attempts WHERE id=?').get(attempt.id).id);
}

function isObjectiveCorrect(type, response, correct) {
  if (response === null || response === undefined || response === '') return false;
  if (type === 'multi') {
    const a = Array.isArray(response) ? [...response].map(String).sort() : [];
    const b = Array.isArray(correct) ? [...correct].map(String).sort() : [];
    return a.length === b.length && a.every((v, i) => v === b[i]);
  }
  return String(response) === String(correct);
}

// 批阅主观题并完结成绩：归档 + 不合格入补考名单
function gradeAttempt(attemptId, grader, scores, comment) {
  const db = getDb();
  const attempt = db.prepare('SELECT * FROM attempts WHERE id=?').get(attemptId);
  if (!attempt) throw httpError(404, '答卷不存在');
  if (!attempt.submitted_at) throw httpError(400, '考生尚未交卷');
  const essays = db.prepare(
    "SELECT eq.id, eq.score FROM answers a JOIN exam_questions eq ON eq.id=a.exam_question_id WHERE a.attempt_id=? AND eq.type='essay'"
  ).all(attemptId);
  const scoreMap = scores || {};
  const parsed = essays.map((e) => {
    const raw = scoreMap[e.id] ?? scoreMap[String(e.id)];
    const v = Number(raw && typeof raw === 'object' ? raw.score : raw);
    const c = raw && typeof raw === 'object' ? raw.comment : null;
    if (!(v >= 0) || v > e.score + 1e-9) throw httpError(400, `主观题评分需在 0~${e.score} 之间`);
    return { e, v, comment: c };
  });
  const subjective = parsed.reduce((s, x) => s + x.v, 0);
  const tx = db.transaction(() => {
    const upd = db.prepare('UPDATE answers SET score=?, grader_comment=? WHERE id=?');
    for (const { e, v, comment } of parsed) {
      upd.run(v, comment || null,
        db.prepare('SELECT id FROM answers WHERE attempt_id=? AND exam_question_id=?').get(attemptId, e.id).id);
    }
    finalizeAttempt(attemptId, subjective, grader.id, comment || null);
  });
  tx();
  return getAttemptView(attemptId);
}

function finalizeAttempt(attemptId, subjectiveScore, graderId, comment) {
  const db = getDb();
  const attempt = db.prepare('SELECT * FROM attempts WHERE id=?').get(attemptId);
  const exam = db.prepare('SELECT * FROM exams WHERE id=?').get(attempt.exam_id);
  const total = (attempt.objective_score || 0) + subjectiveScore;
  const result = total >= exam.pass_score ? 'pass' : 'fail';
  db.prepare(`UPDATE attempts SET subjective_score=?, total_score=?, result=?, graded=1, grader_id=?, graded_at=?, grading_comment=? WHERE id=?`)
    .run(subjectiveScore, total, result, graderId, graderId ? nowStr() : null, comment, attemptId);
  db.prepare("UPDATE exam_roster SET status='graded' WHERE exam_id=? AND user_id=?").run(attempt.exam_id, attempt.user_id);
  // 归档到培训档案
  db.prepare(`INSERT INTO training_records(user_id, exam_id, total_score, result, objective_score, subjective_score)
    VALUES (?,?,?,?,?,?)
    ON CONFLICT(user_id, exam_id) DO UPDATE SET total_score=excluded.total_score, result=excluded.result,
      objective_score=excluded.objective_score, subjective_score=excluded.subjective_score, archived_at=datetime('now','localtime')`)
    .run(attempt.user_id, attempt.exam_id, total, result, attempt.objective_score || 0, subjectiveScore);
  // 不合格自动进入补考名单；合格则解除未闭环的不合格记录（支持批阅更正）
  if (result === 'fail') {
    db.prepare(`INSERT OR IGNORE INTO makeup_list(exam_id, user_id, reason) VALUES (?,?, 'fail')`)
      .run(attempt.exam_id, attempt.user_id);
    db.prepare("UPDATE makeup_list SET status='pending', resolved_at=NULL WHERE exam_id=? AND user_id=? AND reason='fail' AND status IN ('resolved','waived')")
      .run(attempt.exam_id, attempt.user_id);
  } else {
    db.prepare("UPDATE makeup_list SET status='resolved', resolved_at=? WHERE exam_id=? AND user_id=? AND reason='fail' AND status IN ('pending','notified','scheduled')")
      .run(nowStr(), attempt.exam_id, attempt.user_id);
  }
}

// ---------- 查询视图 ----------
function getAttemptView(attemptId) {
  const db = getDb();
  const a = db.prepare(`SELECT a.*, u.real_name, u.job_type, d.name AS dept_name
    FROM attempts a JOIN users u ON u.id=a.user_id
    LEFT JOIN departments d ON d.id=u.dept_id WHERE a.id=?`).get(attemptId);
  if (!a) return null;
  a.answers = db.prepare(`SELECT an.exam_question_id AS eq_id, an.response, an.score AS awarded_score, an.grader_comment,
    eq.seq, eq.type, eq.stem, eq.options_json, eq.reference_answer, eq.score AS max_score, eq.kp_id
    FROM answers an JOIN exam_questions eq ON eq.id=an.exam_question_id
    WHERE an.attempt_id=? ORDER BY eq.seq`).all(attemptId);
  return a;
}

// ---------- 统计 ----------
function examSummary(examId) {
  const db = getDb();
  const exam = ensureFinalized(examId);
  if (!exam) throw httpError(404, '考试不存在');
  const roster = db.prepare(`SELECT r.status, u.id AS user_id, u.real_name, d.name AS dept_name,
    a.id AS attempt_id, a.objective_score, a.subjective_score, a.total_score, a.result, a.graded, a.submitted_at
    FROM exam_roster r JOIN users u ON u.id=r.user_id
    LEFT JOIN departments d ON d.id=u.dept_id
    LEFT JOIN attempts a ON a.exam_id=r.exam_id AND a.user_id=r.user_id
    WHERE r.exam_id=? ORDER BY d.name, u.real_name`).all(examId);
  const total = roster.length;
  const submitted = roster.filter((r) => r.status !== 'assigned' && r.status !== 'absent').length;
  const absent = roster.filter((r) => r.status === 'absent').length;
  const graded = roster.filter((r) => r.status === 'graded');
  const pass = graded.filter((r) => r.result === 'pass').length;
  const fail = graded.filter((r) => r.result === 'fail').length;
  const pendingGrade = roster.filter((r) => r.status === 'submitted').length;
  const avg = graded.length ? +(graded.reduce((s, r) => s + r.total_score, 0) / graded.length).toFixed(1) : null;
  return {
    exam,
    counts: { total, submitted, absent, graded: graded.length, pass, fail, pending_grade: pendingGrade, pass_rate: graded.length ? +(pass / graded.length * 100).toFixed(1) : null, attendance_rate: total ? +((total - absent) / total * 100).toFixed(1) : null, avg_score: avg },
    roster,
  };
}

// 薄弱知识点：按已批阅答卷的题目得分率聚合，可按岗位/科室/考试过滤
function weakKnowledge({ job_type, dept_id, exam_id } = {}) {
  const db = getDb();
  const where = ['a.graded=1', 'eq.kp_id IS NOT NULL'];
  const params = {};
  if (job_type) { where.push('e.job_type=@job_type'); params.job_type = job_type; }
  if (dept_id) { where.push('u.dept_id=@dept_id'); params.dept_id = dept_id; }
  if (exam_id) { where.push('e.id=@exam_id'); params.exam_id = exam_id; }
  const rows = db.prepare(`
    SELECT kp.id AS kp_id, kp.name AS kp_name, kp.job_type,
      COUNT(an.id) AS answer_count,
      SUM(eq.score) AS max_sum,
      SUM(COALESCE(an.score,0)) AS got_sum
    FROM answers an
    JOIN attempts a ON a.id=an.attempt_id
    JOIN users u ON u.id=a.user_id
    JOIN exams e ON e.id=a.exam_id
    JOIN exam_questions eq ON eq.id=an.exam_question_id
    JOIN knowledge_points kp ON kp.id=eq.kp_id
    WHERE ${where.join(' AND ')}
    GROUP BY kp.id HAVING answer_count >= 1
    ORDER BY (CAST(SUM(COALESCE(an.score,0)) AS REAL)/SUM(eq.score)) ASC, answer_count DESC
  `).all(params);
  return rows.map((r) => ({
    kp_id: r.kp_id, kp_name: r.kp_name, job_type: r.job_type,
    answer_count: r.answer_count,
    mastery_rate: +(r.got_sum / r.max_sum * 100).toFixed(1),
    avg_loss: +((r.max_sum - r.got_sum) / r.answer_count).toFixed(2),
  }));
}

function globalSummary() {
  sweepDueExams();
  const db = getDb();
  const examRows = db.prepare(`SELECT e.*,
    (SELECT COUNT(*) FROM exam_roster r WHERE r.exam_id=e.id) AS total,
    (SELECT COUNT(*) FROM exam_roster r WHERE r.exam_id=e.id AND r.status='absent') AS absent,
    (SELECT COUNT(*) FROM exam_roster r WHERE r.exam_id=e.id AND r.status='graded') AS graded,
    (SELECT COUNT(*) FROM attempts a WHERE a.exam_id=e.id AND a.graded=1 AND a.result='pass') AS pass
    FROM exams e ORDER BY e.created_at DESC`).all();
  const exams = examRows.map((e) => ({
    ...e,
    pass_rate: e.graded ? +(e.pass / e.graded * 100).toFixed(1) : null,
    attendance_rate: e.total ? +((e.total - e.absent) / e.total * 100).toFixed(1) : null,
  }));
  const agg = db.prepare(`SELECT
    COUNT(DISTINCT a.exam_id) AS exam_count,
    COUNT(a.id) AS graded_count,
    SUM(CASE WHEN a.result='pass' THEN 1 ELSE 0 END) AS pass_count,
    ROUND(AVG(a.total_score),1) AS avg_score
    FROM attempts a WHERE a.graded=1`).get();
  const pendingMakeup = db.prepare(`SELECT COUNT(*) AS c FROM makeup_list WHERE status IN ('pending','notified','scheduled')`).get().c;
  return { exams, agg, pending_makeup: pendingMakeup };
}

function normalizeTime(t) {
  if (!t) throw httpError(400, '时间不能为空');
  return String(t).replace('T', ' ').slice(0, 19);
}

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

const TYPE_LABEL = { single: '单选题', multi: '多选题', judge: '判断题', essay: '简答题' };

module.exports = {
  createExam, closeExam, sweepDueExams, ensureFinalized,
  startAttempt, submitAttempt, gradeAttempt, getAttemptView,
  examSummary, weakKnowledge, globalSummary, nowStr, httpError, TYPE_LABEL,
};
