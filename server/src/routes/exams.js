'use strict';
const express = require('express');
const { getDb } = require('../db');
const { authRequired, requireRole } = require('../auth');
const svc = require('../services/examService');

const router = express.Router();
router.use(authRequired);

function getExamOr404(id) {
  return getDb().prepare('SELECT * FROM exams WHERE id=?').get(Number(id));
}

function scopeWhere(user) {
  if (user.role === 'examinee') return { clause: 'EXISTS(SELECT 1 FROM exam_roster r WHERE r.exam_id=e.id AND r.user_id=?)', params: [user.id] };
  if (user.role === 'dept_teacher') return { clause: 'EXISTS(SELECT 1 FROM exam_depts ed WHERE ed.exam_id=e.id AND ed.dept_id=?)', params: [user.dept_id] };
  return { clause: '1=1', params: [] };
}

// 考试列表
router.get('/exams', (req, res, next) => {
  try {
    svc.sweepDueExams();
    const db = getDb();
    const { clause, params } = scopeWhere(req.user);
    let sql = `SELECT e.*, pd.name AS publish_dept_name FROM exams e
      LEFT JOIN departments pd ON pd.id=e.publish_dept_id WHERE ${clause}`;
    if (req.query.job_type) { sql += ' AND e.job_type=?'; params.push(req.query.job_type); }
    if (req.query.status) { sql += ' AND e.status=?'; params.push(req.query.status); }
    sql += ' ORDER BY e.start_time DESC';
    const exams = db.prepare(sql).all(...params);
    // 附加名册/当前用户状态
    const rosterStmt = db.prepare('SELECT status FROM exam_roster WHERE exam_id=? AND user_id=?');
    const cntStmt = db.prepare('SELECT COUNT(*) c FROM exam_roster WHERE exam_id=?');
    const deptsStmt = db.prepare(`SELECT d.id, d.name FROM exam_depts ed JOIN departments d ON d.id=ed.dept_id WHERE ed.exam_id=?`);
    exams.forEach((e) => {
      e.target_depts = deptsStmt.all(e.id);
      e.roster_count = cntStmt.get(e.id).c;
      if (req.user.role === 'examinee') {
        const r = rosterStmt.get(e.id, req.user.id);
        e.my_status = r ? r.status : null;
        const a = db.prepare('SELECT id,total_score,result,graded,submitted_at FROM attempts WHERE exam_id=? AND user_id=?').get(e.id, req.user.id);
        e.my_attempt = a || null;
      }
    });
    res.json(exams);
  } catch (e) { next(e); }
});

// 发布考试（护理部）
router.post('/exams', requireRole('nursing_admin'), (req, res, next) => {
  try {
    const b = req.body || {};
    const id = svc.createExam({
      title: b.title, level: b.level, job_type: b.job_type, dept_ids: b.dept_ids,
      start_time: b.start_time, end_time: b.end_time,
      duration_minutes: b.duration_minutes, pass_score: b.pass_score, composition: b.composition,
    }, req.user.id);
    res.status(201).json({ id });
  } catch (e) { next(e); }
});

// 考试详情
router.get('/exams/:id', (req, res, next) => {
  try {
    const exam = svc.ensureFinalized(req.params.id);
    if (!exam) return res.status(404).json({ error: '考试不存在' });
    const db = getDb();
    const sc = scopeWhere(req.user);
    const ok = db.prepare(`SELECT 1 FROM exams e WHERE e.id=? AND ${sc.clause}`).get(exam.id, ...sc.params);
    if (!ok) return res.status(403).json({ error: '你不在该考试的可见范围' });
    exam.target_depts = db.prepare(`SELECT d.id,d.name FROM exam_depts ed JOIN departments d ON d.id=ed.dept_id WHERE ed.exam_id=?`).all(exam.id);
    exam.composition = db.prepare('SELECT type, COUNT(*) AS count, score FROM exam_questions WHERE exam_id=? GROUP BY type, score').all(exam.id);
    if (req.user.role === 'examinee') {
      const r = db.prepare('SELECT status FROM exam_roster WHERE exam_id=? AND user_id=?').get(exam.id, req.user.id);
      exam.my_status = r ? r.status : null;
    }
    res.json(exam);
  } catch (e) { next(e); }
});

// 提前截止（护理部）
router.post('/exams/:id/close', requireRole('nursing_admin'), (req, res, next) => {
  try {
    if (!getExamOr404(req.params.id)) return res.status(404).json({ error: '考试不存在' });
    res.json(svc.closeExam(Number(req.params.id)));
  } catch (e) { next(e); }
});

// 考生进入考试
router.post('/exams/:id/start', requireRole('examinee'), (req, res, next) => {
  try {
    res.status(201).json(svc.startAttempt(Number(req.params.id), req.user));
  } catch (e) { next(e); }
});

// 试卷内容（不返回标准答案）
router.get('/exams/:id/paper', requireRole('examinee'), (req, res, next) => {
  try {
    const examId = Number(req.params.id);
    const exam = svc.ensureFinalized(examId);
    if (!exam || exam.status === 'closed') return res.status(403).json({ error: '考试不可用' });
    const db = getDb();
    const roster = db.prepare('SELECT * FROM exam_roster WHERE exam_id=? AND user_id=?').get(examId, req.user.id);
    if (!roster) return res.status(403).json({ error: '你不在考试名册中' });
    const attempt = db.prepare('SELECT * FROM attempts WHERE exam_id=? AND user_id=?').get(examId, req.user.id);
    const now = svc.nowStr();
    if (now < exam.start_time) return res.status(403).json({ error: '考试尚未开始' });
    if (!attempt) return res.status(403).json({ error: '请先进入考试' });
    if (attempt.submitted_at) return res.status(409).json({ error: '试卷已提交' });
    const questions = db.prepare(`SELECT id AS eq_id, question_id, seq, type, stem, options_json, score
      FROM exam_questions WHERE exam_id=? ORDER BY seq`).all(examId);
    questions.forEach((q) => { q.options = q.options_json ? JSON.parse(q.options_json) : null; delete q.options_json; });
    res.json({ exam: { id: exam.id, title: exam.title, duration_minutes: exam.duration_minutes, end_time: exam.end_time, total_score: exam.total_score, pass_score: exam.pass_score }, questions });
  } catch (e) { next(e); }
});

// 交卷
router.post('/exams/:id/submit', requireRole('examinee'), (req, res, next) => {
  try {
    const view = svc.submitAttempt(Number(req.params.id), req.user, (req.body || {}).responses);
    res.json({ id: view.id, graded: view.graded, total_score: view.total_score, objective_score: view.objective_score, result: view.result });
  } catch (e) { next(e); }
});

// 考生查看本人成绩与批阅
router.get('/exams/:id/my-result', requireRole('examinee'), (req, res, next) => {
  try {
    const examId = Number(req.params.id);
    const a = getDb().prepare('SELECT * FROM attempts WHERE exam_id=? AND user_id=?').get(examId, req.user.id);
    if (!a) {
      const exam = svc.ensureFinalized(examId);
      const roster = getDb().prepare('SELECT status FROM exam_roster WHERE exam_id=? AND user_id=?').get(examId, req.user.id);
      return res.json({ status: roster ? roster.status : 'not_assigned', exam: exam ? { id: exam.id, title: exam.title, pass_score: exam.pass_score } : null });
    }
    const view = svc.getAttemptView(a.id);
    // 不把其他人的信息返回；对未批阅完的主观题，不提供参考答案
    view.answers.forEach((x) => {
      if (!view.graded && x.type === 'essay') { x.reference_answer = null; }
    });
    res.json(view);
  } catch (e) { next(e); }
});

// 待批阅列表（科室老师：本科室考生；护理部：全部）
router.get('/exams/:id/grading/pending', (req, res, next) => {
  try {
    if (!['dept_teacher', 'nursing_admin'].includes(req.user.role)) return res.status(403).json({ error: '无权查看' });
    const examId = Number(req.params.id);
    const exam = svc.ensureFinalized(examId);
    if (!exam) return res.status(404).json({ error: '考试不存在' });
    const db = getDb();
    let sql = `SELECT a.id AS attempt_id, a.submitted_at, a.objective_score, a.graded,
      u.id AS user_id, u.real_name, d.name AS dept_name,
      (SELECT COUNT(*) FROM answers an JOIN exam_questions eq ON eq.id=an.exam_question_id WHERE an.attempt_id=a.id AND eq.type='essay') AS essay_count,
      (SELECT COUNT(*) FROM answers an JOIN exam_questions eq ON eq.id=an.exam_question_id WHERE an.attempt_id=a.id AND eq.type='essay' AND an.score IS NULL) AS ungraded_essay
      FROM attempts a JOIN users u ON u.id=a.user_id
      LEFT JOIN departments d ON d.id=u.dept_id
      WHERE a.exam_id=? AND a.submitted_at IS NOT NULL`;
    const params = [examId];
    if (req.user.role === 'dept_teacher') { sql += ' AND u.dept_id=?'; params.push(req.user.dept_id); }
    if (req.query.ungraded === '1') sql += ' AND a.graded=0';
    sql += ' ORDER BY a.graded, a.submitted_at';
    res.json({ exam, list: db.prepare(sql).all(...params) });
  } catch (e) { next(e); }
});

// 答卷详情（批阅视图）
router.get('/attempts/:id', (req, res, next) => {
  try {
    if (!['dept_teacher', 'nursing_admin'].includes(req.user.role)) return res.status(403).json({ error: '无权查看' });
    const view = svc.getAttemptView(Number(req.params.id));
    if (!view) return res.status(404).json({ error: '答卷不存在' });
    if (req.user.role === 'dept_teacher') {
      const owner = getDb().prepare('SELECT dept_id FROM users WHERE id=?').get(view.user_id);
      if (!owner || owner.dept_id !== req.user.dept_id) return res.status(403).json({ error: '只能批阅本科室考生答卷' });
    }
    view.answers.forEach((x) => { x.options = x.options_json ? JSON.parse(x.options_json) : null; x.response_parsed = x.response ? JSON.parse(x.response) : null; delete x.options_json; });
    res.json(view);
  } catch (e) { next(e); }
});

// 提交批阅
router.post('/attempts/:id/grade', (req, res, next) => {
  try {
    if (!['dept_teacher', 'nursing_admin'].includes(req.user.role)) return res.status(403).json({ error: '无权批阅' });
    const attemptId = Number(req.params.id);
    const view = svc.getAttemptView(attemptId);
    if (!view) return res.status(404).json({ error: '答卷不存在' });
    if (req.user.role === 'dept_teacher') {
      const owner = getDb().prepare('SELECT dept_id FROM users WHERE id=?').get(view.user_id);
      if (!owner || owner.dept_id !== req.user.dept_id) return res.status(403).json({ error: '只能批阅本科室考生答卷' });
    }
    const b = req.body || {};
    res.json(svc.gradeAttempt(attemptId, req.user, b.scores, b.comment));
  } catch (e) { next(e); }
});

// 考试汇总（护理部/科室老师/院级管理员）
router.get('/exams/:id/summary', (req, res, next) => {
  try {
    if (req.user.role === 'examinee') return res.status(403).json({ error: '考生不可查看汇总' });
    const examId = Number(req.params.id);
    const exam = svc.ensureFinalized(examId);
    if (!exam) return res.status(404).json({ error: '考试不存在' });
    if (req.user.role === 'dept_teacher') {
      const inDept = getDb().prepare('SELECT 1 FROM exam_depts WHERE exam_id=? AND dept_id=?').get(examId, req.user.dept_id);
      if (!inDept) return res.status(403).json({ error: '该考试不涉及你所在科室' });
    }
    const summary = svc.examSummary(examId);
    // 科室老师只看本科室考生
    if (req.user.role === 'dept_teacher') {
      summary.roster = summary.roster.filter((r) => getDb().prepare('SELECT 1 FROM users WHERE id=? AND dept_id=?').get(r.user_id, req.user.dept_id));
      const graded = summary.roster.filter((r) => r.status === 'graded');
      summary.counts = {
        total: summary.roster.length,
        submitted: summary.roster.filter((r) => r.status !== 'assigned' && r.status !== 'absent').length,
        absent: summary.roster.filter((r) => r.status === 'absent').length,
        graded: graded.length,
        pass: graded.filter((r) => r.result === 'pass').length,
        fail: graded.filter((r) => r.result === 'fail').length,
        pending_grade: summary.roster.filter((r) => r.status === 'submitted').length,
        pass_rate: graded.length ? +(graded.filter((r) => r.result === 'pass').length / graded.length * 100).toFixed(1) : null,
      };
    }
    res.json(summary);
  } catch (e) { next(e); }
});

module.exports = router;
