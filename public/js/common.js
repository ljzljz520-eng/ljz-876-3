'use strict';
const UI = (() => {
  const JOB = { doctor: '医生', nurse: '护士', technician: '技师' };
  const ROLE = { nursing_admin: '护理部管理员', dept_teacher: '科室老师', examinee: '考生', hospital_admin: '院级管理员' };
  const QTYPE = { single: '单选题', multi: '多选题', judge: '判断题', essay: '简答题' };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function fmtTime(s) { return s ? esc(s).replace('T', ' ') : '—'; }
  function jobLabel(j) { return JOB[j] || '—'; }
  function roleLabel(r) { return ROLE[r] || r; }

  let toastTimer = null;
  function toast(msg, type) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = 'toast show ' + (type || '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = 'toast'; }, 2800);
  }
  async function handler(fn) {
    try { await fn(); } catch (e) { toast(e.message, 'error'); }
  }

  function statusBadge(status) {
    const map = {
      assigned: ['gray', '待考'], submitted: ['orange', '待批阅'], absent: ['red', '缺考'], graded: ['green', '已出分'],
      published: ['blue', '进行中'], closed: ['gray', '已截止'],
      pass: ['green', '合格'], fail: ['red', '不合格'],
      pending: ['orange', '待补考'], notified: ['blue', '已通知'], scheduled: ['purple', '已安排'], resolved: ['green', '已完成'], waived: ['gray', '已豁免'],
      absent_reason: ['red', '缺考'], fail_reason: ['orange', '成绩不合格'],
    };
    const [cls, txt] = map[status] || ['gray', status];
    return `<span class="badge ${cls}">${txt}</span>`;
  }

  function bars(rows, opts) {
    opts = opts || {};
    if (!rows.length) return '<p class="muted">暂无数据</p>';
    const max = opts.max || 100;
    return '<div class="bar-chart">' + rows.map((r) => {
      const v = r.value;
      const cls = v < (opts.low || 60) ? 'low' : v < (opts.mid || 80) ? 'mid' : '';
      const sub = r.sub != null ? `<br><span class="muted">${esc(r.sub)}</span>` : '';
      return `<div class="bar-row">
        <div class="bar-label" title="${esc(r.label)}">${esc(r.label)}</div>
        <div class="bar-track"><div class="bar-fill ${cls}" style="width:${Math.max(v / max * 100, 1.5)}%"></div></div>
        <div class="bar-val">${esc(r.display != null ? r.display : v + '%')}${sub}</div>
      </div>`;
    }).join('') + '</div>';
  }

  function loading() { return '<p class="muted">加载中…</p>'; }

  const SUBPAGE_TO_MENU = { result: 'exams', take: 'exams', grade: 'grading', 'grade-detail': 'grading', record: 'archive' };
  function layout(menu, active, contentHtml) {
    const u = Api.user();
    const menuActive = SUBPAGE_TO_MENU[active] || active;
    const nav = menu.map((m) => `<a href="#/${m.route}" class="${m.route === menuActive ? 'active' : ''}">${m.icon || ''} ${m.label}</a>`).join('');
    return `<div class="layout">
      <aside class="sidebar">
        <div class="brand">🏥 三基考试管理系统<small>医院培训考核平台</small></div>
        <nav>${nav}</nav>
        <div class="me">
          <div class="name">${esc(u.real_name)}</div>
          <div class="role">${roleLabel(u.role)}${u.dept_name ? ' · ' + esc(u.dept_name) : ''}${u.job_type ? ' · ' + jobLabel(u.job_type) : ''}</div>
          <a id="logoutBtn" class="btn small ghost" style="color:#c8d9ec;border-color:#3a5572">退出登录</a>
        </div>
      </aside>
      <main class="main" id="viewRoot">${contentHtml}</main>
    </div>`;
  }

  function bindLogout() {
    const b = document.getElementById('logoutBtn');
    if (b) b.onclick = () => { Api.clear(); location.hash = ''; location.reload(); };
  }

  function qtypeBadge(t) {
    const cls = { single: 'blue', multi: 'purple', judge: 'gray', essay: 'orange' }[t] || 'gray';
    return `<span class="badge ${cls} q-type">${QTYPE[t] || t}</span>`;
  }

  return { esc, fmtTime, jobLabel, roleLabel, toast, handler, statusBadge, bars, loading, layout, bindLogout, qtypeBadge, JOB, QTYPE };
})();
