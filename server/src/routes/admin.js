'use strict';
const express = require('express');
const { authRequired } = require('../auth');
const svc = require('../services/examService');

const router = express.Router();
router.use(authRequired);

// 院级驾驶舱：仅汇总，不下钻到个人成绩明细
router.get('/admin/overview', (req, res, next) => {
  try {
    if (req.user.role !== 'hospital_admin') return res.status(403).json({ error: '仅院级管理员可访问' });
    const summary = svc.globalSummary();
    res.json(summary);
  } catch (e) { next(e); }
});

// 薄弱知识点：院级管理员（全院）/护理部/科室老师（本科室）
router.get('/analytics/weak-points', (req, res, next) => {
  try {
    if (req.user.role === 'examinee') return res.status(403).json({ error: '无权访问' });
    const filter = {
      job_type: req.query.job_type || undefined,
      exam_id: req.query.exam_id ? Number(req.query.exam_id) : undefined,
    };
    if (req.user.role === 'dept_teacher') filter.dept_id = req.user.dept_id;
    if (req.user.role === 'hospital_admin' && req.query.dept_id) filter.dept_id = Number(req.query.dept_id);
    res.json(svc.weakKnowledge(filter));
  } catch (e) { next(e); }
});

module.exports = router;
