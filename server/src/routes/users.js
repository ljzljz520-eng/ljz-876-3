'use strict';
const express = require('express');
const { getDb } = require('../db');
const { authRequired, requireRole, hashPassword } = require('../auth');

const router = express.Router();
router.use(authRequired);

// 科室列表（所有登录用户可查，用于筛选/展示）
router.get('/departments', (req, res) => {
  res.json(getDb().prepare('SELECT id, name FROM departments ORDER BY id').all());
});

// 用户列表（护理部/院级管理员可查；科室老师可查本科室成员）
router.get('/users', (req, res, next) => {
  try {
    const db = getDb();
    let sql = `SELECT u.id, u.username, u.real_name, u.role, u.job_type, u.dept_id, d.name AS dept_name, u.active
      FROM users u LEFT JOIN departments d ON d.id=u.dept_id WHERE 1=1`;
    const params = [];
    if (req.user.role === 'dept_teacher') {
      sql += ' AND u.dept_id=?';
      params.push(req.user.dept_id);
    } else if (!['nursing_admin', 'hospital_admin'].includes(req.user.role)) {
      sql += ' AND u.id=?';
      params.push(req.user.id);
    }
    if (req.query.role) { sql += ' AND u.role=?'; params.push(req.query.role); }
    if (req.query.job_type) { sql += ' AND u.job_type=?'; params.push(req.query.job_type); }
    if (req.query.dept_id) { sql += ' AND u.dept_id=?'; params.push(Number(req.query.dept_id)); }
    sql += ' ORDER BY d.name, u.role, u.real_name';
    res.json(db.prepare(sql).all(...params));
  } catch (e) { next(e); }
});

// 新建用户（仅护理部）
router.post('/users', requireRole('nursing_admin'), (req, res, next) => {
  try {
    const { username, password, real_name, role, job_type, dept_id } = req.body || {};
    if (!username || !password || !real_name || !role) return res.status(400).json({ error: '用户名/密码/姓名/角色必填' });
    if (!['nursing_admin', 'dept_teacher', 'examinee', 'hospital_admin'].includes(role)) return res.status(400).json({ error: '角色非法' });
    if (role === 'examinee') {
      if (!['doctor', 'nurse', 'technician'].includes(job_type)) return res.status(400).json({ error: '考生必须选择岗位（医生/护士/技师）' });
      if (!dept_id) return res.status(400).json({ error: '考生必须归属科室' });
    }
    if (getDb().prepare('SELECT 1 FROM users WHERE username=?').get(username)) return res.status(409).json({ error: '用户名已存在' });
    const { salt, hash } = hashPassword(password);
    const info = getDb().prepare(
      'INSERT INTO users(username,password_hash,salt,real_name,role,job_type,dept_id) VALUES (?,?,?,?,?,?,?)'
    ).run(username, hash, salt, real_name, role, role === 'examinee' ? job_type : null, dept_id || null);
    res.status(201).json({ id: info.lastInsertRowid });
  } catch (e) { next(e); }
});

// 新建科室（仅护理部）
router.post('/departments', requireRole('nursing_admin'), (req, res, next) => {
  try {
    const { name } = req.body || {};
    if (!name) return res.status(400).json({ error: '科室名称必填' });
    const info = getDb().prepare('INSERT INTO departments(name) VALUES (?)').run(name);
    res.status(201).json({ id: info.lastInsertRowid, name });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: '科室已存在' });
    next(e);
  }
});

// 培训档案：护理部/院级可查任意人；本人查本人；科室老师查本科室
router.get('/training-records/:userId', (req, res, next) => {
  try {
    const userId = Number(req.params.userId);
    const db = getDb();
    const target = db.prepare('SELECT * FROM users WHERE id=?').get(userId);
    if (!target) return res.status(404).json({ error: '用户不存在' });
    if (req.user.role === 'examinee' && req.user.id !== userId) return res.status(403).json({ error: '只能查看本人培训档案' });
    if (req.user.role === 'dept_teacher' && target.dept_id !== req.user.dept_id) return res.status(403).json({ error: '只能查看本科室人员档案' });
    const rows = db.prepare(`SELECT tr.*, e.title, e.job_type, e.level, e.start_time, e.end_time
      FROM training_records tr JOIN exams e ON e.id=tr.exam_id
      WHERE tr.user_id=? ORDER BY tr.archived_at DESC`).all(userId);
    const stat = db.prepare(`SELECT COUNT(*) AS total,
      SUM(CASE WHEN result='pass' THEN 1 ELSE 0 END) AS pass_count,
      ROUND(AVG(total_score),1) AS avg_score
      FROM training_records WHERE user_id=?`).get(userId);
    res.json({ user: { id: target.id, real_name: target.real_name, role: target.role, job_type: target.job_type }, stat, records: rows });
  } catch (e) { next(e); }
});

module.exports = router;
