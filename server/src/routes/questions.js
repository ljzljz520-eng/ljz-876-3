'use strict';
const express = require('express');
const { getDb } = require('../db');
const { authRequired, requireRole } = require('../auth');

const router = express.Router();
router.use(authRequired);

const JOB_TYPES = ['doctor', 'nurse', 'technician'];
const Q_TYPES = ['single', 'multi', 'judge', 'essay'];

// 题目列表：考生只能查本岗位题库（且不返回标准答案）；护理部可查全部维护
router.get('/questions', (req, res, next) => {
  try {
    const db = getDb();
    const { job_type, type, kp_id, q } = req.query;
    const where = ['q.active=1'];
    const params = [];
    let jt = job_type;
    if (req.user.role === 'examinee') jt = req.user.job_type; // 强制岗位隔离
    if (req.user.role === 'hospital_admin') return res.status(403).json({ error: '院级管理员仅可查看汇总数据' });
    if (jt) {
      if (!JOB_TYPES.includes(jt)) return res.status(400).json({ error: '岗位非法' });
      where.push('q.job_type=?'); params.push(jt);
    }
    if (type) { where.push('q.type=?'); params.push(type); }
    if (kp_id) { where.push('q.kp_id=?'); params.push(Number(kp_id)); }
    if (q) { where.push('q.stem LIKE ?'); params.push(`%${q}%`); }
    const rows = db.prepare(`SELECT q.*, kp.name AS kp_name, creator.real_name AS created_by_name
      FROM questions q
      LEFT JOIN knowledge_points kp ON kp.id=q.kp_id
      LEFT JOIN users creator ON creator.id=q.created_by
      WHERE ${where.join(' AND ')} ORDER BY q.job_type, q.type, q.id DESC`).all(...params);
    const isExaminee = req.user.role === 'examinee';
    rows.forEach((r) => {
      r.options = r.options_json ? JSON.parse(r.options_json) : null;
      r.answer = isExaminee ? undefined : JSON.parse(r.answer_json);
      delete r.answer_json; delete r.options_json;
    });
    res.json(rows);
  } catch (e) { next(e); }
});

// 新增题目（护理部维护题库）
router.post('/questions', requireRole('nursing_admin'), (req, res, next) => {
  try {
    const b = req.body || {};
    if (!JOB_TYPES.includes(b.job_type)) return res.status(400).json({ error: '岗位非法' });
    if (!Q_TYPES.includes(b.type)) return res.status(400).json({ error: '题型非法' });
    if (!b.stem) return res.status(400).json({ error: '题干必填' });
    if (b.type === 'multi' && (!Array.isArray(b.answer) || b.answer.length === 0)) {
      return res.status(400).json({ error: '多选题答案为非空数组' });
    }
    if ((b.type === 'single' || b.type === 'judge') && (b.answer === undefined || b.answer === null)) {
      return res.status(400).json({ error: '请填写标准答案' });
    }
    const info = getDb().prepare(
      `INSERT INTO questions(job_type,type,kp_id,stem,options_json,answer_json,reference_answer,score,created_by)
       VALUES (?,?,?,?,?,?,?,?,?)`
    ).run(b.job_type, b.type, b.kp_id || null, b.stem,
      b.options ? JSON.stringify(b.options) : null,
      JSON.stringify(b.type === 'multi' ? b.answer : (b.answer ?? '')),
      b.reference_answer || null, b.score || 5, req.user.id);
    res.status(201).json({ id: info.lastInsertRowid });
  } catch (e) { next(e); }
});

// 知识点列表
router.get('/knowledge-points', (req, res, next) => {
  try {
    const { job_type } = req.query;
    let sql = 'SELECT * FROM knowledge_points';
    const params = [];
    if (job_type) { sql += ' WHERE job_type=?'; params.push(job_type); }
    sql += ' ORDER BY job_type, name';
    res.json(getDb().prepare(sql).all(...params));
  } catch (e) { next(e); }
});

router.post('/knowledge-points', requireRole('nursing_admin'), (req, res, next) => {
  try {
    const { job_type, name } = req.body || {};
    if (!JOB_TYPES.includes(job_type) || !name) return res.status(400).json({ error: '岗位与知识点名称必填' });
    const info = getDb().prepare('INSERT INTO knowledge_points(job_type,name) VALUES (?,?)').run(job_type, name);
    res.status(201).json({ id: info.lastInsertRowid });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: '该岗位下知识点已存在' });
    next(e);
  }
});

// 题库余量统计（组卷前提示）
router.get('/questions/meta/counts', requireRole('nursing_admin', 'dept_teacher'), (req, res) => {
  const rows = getDb().prepare(
    'SELECT job_type, type, COUNT(*) AS count FROM questions WHERE active=1 GROUP BY job_type, type'
  ).all();
  res.json(rows);
});

module.exports = router;
