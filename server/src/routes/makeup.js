'use strict';
const express = require('express');
const { getDb } = require('../db');
const { authRequired } = require('../auth');
const svc = require('../services/examService');

const router = express.Router();
router.use(authRequired);

// 补考名单：考生只看本人；科室老师看本科室；护理部/院级看全部
router.get('/makeup', (req, res, next) => {
  try {
    svc.sweepDueExams();
    const db = getDb();
    let sql = `SELECT m.*, u.real_name, u.job_type, u.dept_id, d.name AS dept_name,
      e.title AS exam_title, e.job_type AS exam_job_type, e.end_time,
      me.title AS makeup_exam_title
      FROM makeup_list m
      JOIN users u ON u.id=m.user_id
      LEFT JOIN departments d ON d.id=u.dept_id
      JOIN exams e ON e.id=m.exam_id
      LEFT JOIN exams me ON me.id=m.makeup_exam_id
      WHERE 1=1`;
    const params = [];
    if (req.user.role === 'examinee') { sql += ' AND m.user_id=?'; params.push(req.user.id); }
    if (req.user.role === 'dept_teacher') { sql += ' AND u.dept_id=?'; params.push(req.user.dept_id); }
    if (req.query.status) { sql += ' AND m.status=?'; params.push(req.query.status); }
    if (req.query.reason) { sql += ' AND m.reason=?'; params.push(req.query.reason); }
    sql += ' ORDER BY m.created_at DESC';
    res.json(db.prepare(sql).all(...params));
  } catch (e) { next(e); }
});

// 更新补考状态（护理部：通知/安排/豁免；科室老师：标记已通知）
router.post('/makeup/:id/status', (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { status } = req.body || {};
    const allowed = ['notified', 'scheduled', 'resolved', 'waived'];
    if (!allowed.includes(status)) return res.status(400).json({ error: '状态非法' });
    const db = getDb();
    const row = db.prepare(`SELECT m.*, u.dept_id FROM makeup_list m JOIN users u ON u.id=m.user_id WHERE m.id=?`).get(id);
    if (!row) return res.status(404).json({ error: '记录不存在' });
    if (req.user.role === 'dept_teacher') {
      if (row.dept_id !== req.user.dept_id || status !== 'notified') return res.status(403).json({ error: '科室老师仅可通知本科室人员' });
    } else if (req.user.role !== 'nursing_admin') {
      return res.status(403).json({ error: '无权操作' });
    }
    const finished = ['resolved', 'waived'];
    db.prepare('UPDATE makeup_list SET status=?, resolved_at=? WHERE id=?')
      .run(status, finished.includes(status) ? svc.nowStr() : null, id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// 安排补考：将补考人员挂到护理部新建的补考专场
router.post('/makeup/:id/arrange', requireNursing(), (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { makeup_exam_id } = req.body || {};
    const db = getDb();
    const row = db.prepare('SELECT * FROM makeup_list WHERE id=?').get(id);
    if (!row) return res.status(404).json({ error: '记录不存在' });
    const exam = db.prepare('SELECT * FROM exams WHERE id=?').get(Number(makeup_exam_id));
    if (!exam) return res.status(400).json({ error: '补考专场不存在' });
    // 校验岗位一致并加入补考名册（确保补考专场能参加）
    const user = db.prepare('SELECT * FROM users WHERE id=?').get(row.user_id);
    if (user.job_type !== exam.job_type) return res.status(400).json({ error: '补考专场岗位与原考试不一致' });
    db.prepare('INSERT OR IGNORE INTO exam_roster(exam_id,user_id) VALUES (?,?)').run(exam.id, row.user_id);
    db.prepare("UPDATE makeup_list SET status='scheduled', makeup_exam_id=? WHERE id=?").run(exam.id, id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

function requireNursing() {
  return (req, res, next) => {
    if (req.user.role !== 'nursing_admin') return res.status(403).json({ error: '仅护理部可安排补考专场' });
    next();
  };
}

module.exports = router;
