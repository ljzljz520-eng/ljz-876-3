'use strict';
const path = require('path');
const express = require('express');
const { getDb } = require('./db');
const { hashPassword } = require('./auth');

const app = express();
app.use(express.json({ limit: '1mb' }));

app.use('/api', require('./routes/auth'));
app.use('/api', require('./routes/users'));
app.use('/api', require('./routes/questions'));
app.use('/api', require('./routes/exams'));
app.use('/api', require('./routes/makeup'));
app.use('/api', require('./routes/admin'));

app.use(express.static(path.join(__dirname, '..', '..', 'public')));
app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(__dirname, '..', '..', 'public', 'index.html')));

app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message || '服务器内部错误' });
});

const PORT = process.env.PORT || 3000;

function ensureBootstrapAdmin() {
  const db = getDb();
  const count = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (count === 0) {
    const { salt, hash } = hashPassword('admin123');
    db.prepare(`INSERT INTO users(username,password_hash,salt,real_name,role) VALUES (?,?,?,?,?)`)
      .run('nursing', hash, salt, '护理部管理员', 'nursing_admin');
    console.log('已创建初始护理部账号: nursing / admin123');
  }
}

if (require.main === module) {
  ensureBootstrapAdmin();
  app.listen(PORT, () => console.log(`医院三基考试管理系统已启动: http://localhost:${PORT}`));
}

module.exports = app;
