'use strict';
const crypto = require('crypto');
const { getDb } = require('./db');

const TOKEN_TTL_SECONDS = 8 * 3600;

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, salt, expectedHash) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(expectedHash, 'hex'));
}

function secret() {
  return process.env.TOKEN_SECRET || 'sanji-exam-dev-secret-change-me';
}

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

function sign(payloadB64) {
  return crypto.createHmac('sha256', secret()).update(payloadB64).digest('base64url');
}

function issueToken(user) {
  const payload = b64url({
    uid: user.id,
    role: user.role,
    dept_id: user.dept_id || null,
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
  });
  return `${payload}.${sign(payload)}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let data;
  try { data = JSON.parse(Buffer.from(payload, 'base64url').toString()); } catch { return null; }
  if (!data.exp || data.exp < Math.floor(Date.now() / 1000)) return null;
  return data;
}

function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const claims = verifyToken(token);
  if (!claims) return res.status(401).json({ error: '未登录或登录已过期' });
  const user = getDb().prepare('SELECT id, username, real_name, role, job_type, dept_id, active FROM users WHERE id = ?').get(claims.uid);
  if (!user || !user.active) return res.status(401).json({ error: '账号不可用' });
  req.user = user;
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: '无权执行该操作' });
    next();
  };
}

module.exports = { hashPassword, verifyPassword, issueToken, verifyToken, authRequired, requireRole };
