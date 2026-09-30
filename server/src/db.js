'use strict';
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

let dbInstance = null;

function getDb() {
  if (dbInstance) return dbInstance;
  const dataDir = path.join(__dirname, '..', '..', 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const dbFile = process.env.DB_FILE || path.join(dataDir, 'sanji.db');
  const db = new Database(dbFile);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  dbInstance = db;
  return db;
}

function resetDb(file) {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
  const target = file || path.join(__dirname, '..', '..', 'data', 'sanji.db');
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(target + suffix); } catch (_) { /* ignore */ }
  }
  return getDb();
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS departments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  real_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('nursing_admin','dept_teacher','examinee','hospital_admin')),
  job_type TEXT CHECK (job_type IN ('doctor','nurse','technician')),
  dept_id INTEGER REFERENCES departments(id),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- 知识点（薄弱分析的最小维度）
CREATE TABLE IF NOT EXISTS knowledge_points (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_type TEXT NOT NULL CHECK (job_type IN ('doctor','nurse','technician')),
  name TEXT NOT NULL,
  UNIQUE (job_type, name)
);

-- 题库：按岗位(job_type)隔离；题型支持 单选/多选/判断(客观) 与 简答(主观)
CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_type TEXT NOT NULL CHECK (job_type IN ('doctor','nurse','technician')),
  type TEXT NOT NULL CHECK (type IN ('single','multi','judge','essay')),
  kp_id INTEGER REFERENCES knowledge_points(id),
  stem TEXT NOT NULL,
  options_json TEXT,
  answer_json TEXT NOT NULL,
  reference_answer TEXT,
  score REAL NOT NULL DEFAULT 1,
  created_by INTEGER REFERENCES users(id),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS exams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'sanji' CHECK (level IN ('basic','sanji','special')),
  job_type TEXT NOT NULL CHECK (job_type IN ('doctor','nurse','technician')),
  publish_dept_id INTEGER REFERENCES departments(id),
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL,
  pass_score REAL NOT NULL DEFAULT 60,
  total_score REAL NOT NULL DEFAULT 100,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published','closed')),
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- 考试面向科室（一场考试可覆盖多个科室；考生按"科室×岗位"入册）
CREATE TABLE IF NOT EXISTS exam_depts (
  exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  dept_id INTEGER NOT NULL REFERENCES departments(id),
  PRIMARY KEY (exam_id, dept_id)
);

-- 考生名册（发布时生成）
CREATE TABLE IF NOT EXISTS exam_roster (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'assigned'
    CHECK (status IN ('assigned','submitted','absent','graded')),
  UNIQUE (exam_id, user_id)
);

-- 试卷（从题库抽题生成快照，题目修改不影响历史试卷）
CREATE TABLE IF NOT EXISTS exam_questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES questions(id),
  seq INTEGER NOT NULL,
  type TEXT NOT NULL,
  kp_id INTEGER,
  stem TEXT NOT NULL,
  options_json TEXT,
  reference_answer TEXT,
  score REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  exam_id INTEGER NOT NULL REFERENCES exams(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  started_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  submitted_at TEXT,
  objective_score REAL DEFAULT 0,
  subjective_score REAL DEFAULT 0,
  total_score REAL,
  result TEXT CHECK (result IN ('pass','fail')),
  graded INTEGER NOT NULL DEFAULT 0,
  grader_id INTEGER REFERENCES users(id),
  graded_at TEXT,
  grading_comment TEXT,
  UNIQUE (exam_id, user_id)
);

CREATE TABLE IF NOT EXISTS answers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  attempt_id INTEGER NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  exam_question_id INTEGER NOT NULL REFERENCES exam_questions(id),
  response TEXT,
  score REAL,
  grader_comment TEXT,
  UNIQUE (attempt_id, exam_question_id)
);

-- 缺考 / 不合格人员补考名单（闭环）
CREATE TABLE IF NOT EXISTS makeup_list (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  exam_id INTEGER NOT NULL REFERENCES exams(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL CHECK (reason IN ('absent','fail')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','notified','scheduled','resolved','waived')),
  makeup_exam_id INTEGER REFERENCES exams(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  resolved_at TEXT,
  UNIQUE (exam_id, user_id)
);

-- 培训档案：每名考生每场已结束考试一条
CREATE TABLE IF NOT EXISTS training_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  exam_id INTEGER NOT NULL REFERENCES exams(id),
  total_score REAL,
  result TEXT,
  objective_score REAL,
  subjective_score REAL,
  archived_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE (user_id, exam_id)
);
`;

module.exports = { getDb, resetDb };
