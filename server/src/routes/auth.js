'use strict';
const express = require('express');
const { getDb } = require('../db');
const { hashPassword, verifyPassword, issueToken, authRequired } = require('../auth');

const router = express.Router();

router.post('/login', (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: '请输入用户名和密码' });
    const u = getDb().prepare('SELECT * FROM users WHERE username=?').get(username);
    if (!u || !u.active || !verifyPassword(password, u.salt, u.password_hash)) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }
    const dept = u.dept_id ? getDb().prepare('SELECT name FROM departments WHERE id=?').get(u.dept_id) : null;
    res.json({
      token: issueToken(u),
      user: { id: u.id, username: u.username, real_name: u.real_name, role: u.role, job_type: u.job_type, dept_id: u.dept_id, dept_name: dept ? dept.name : null },
    });
  } catch (e) { next(e); }
});

router.get('/me', authRequired, (req, res) => {
  const u = req.user;
  const dept = u.dept_id ? getDb().prepare('SELECT name FROM departments WHERE id=?').get(u.dept_id) : null;
  res.json({ ...u, dept_name: dept ? dept.name : null });
});

module.exports = router;
