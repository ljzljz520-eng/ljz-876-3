/* ========== 医院三基考试管理系统 前端 SPA（原生 JS） ========== */
const $app = document.getElementById('app');
const state = {
  token: localStorage.getItem('sanji_token') || null,
  user: null,
  view: 'home',
  cache: {},
};

const POST_LABEL = { nurse: '护士', doctor: '医生', technician: '技师' };
const POST_COLOR = { nurse: 'tag-blue', doctor: 'tag-green', technician: 'tag-purple' };
const TYPE_LABEL = { single: '单选题', multi: '多选题', judge: '判断题', blank: '填空题', short: '简答题', essay: '论述题' };

/* ---------- 工具 ---------- */
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function el(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
function fmt(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function fmtDate(iso) { return iso ? fmt(iso).slice(0, 10) : '—'; }
function statusTag(s) {
  return ({
    not_started: ['未开始', 'tag-gray'], ongoing: ['考试中', 'tag-blue'], submitted: ['待批阅', 'tag-orange'],
    graded: ['已出分', 'tag-green'], absent: ['缺考', 'tag-red'],
    draft: ['草稿', 'tag-gray'], scheduled: ['未开始', 'tag-gray'], ended: ['已结束待结考', 'tag-orange'],
    closed: ['已结考', 'tag-blue'], published: ['已发布', 'tag-blue'],
  }[s] || [s, 'tag-gray']);
}
function tag(s, cls) { return `<span class="tag ${cls}">${esc(s)}</span>`; }
function statusHtml(s) { const [t, c] = statusTag(s); return tag(t, c); }
function toast(msg, isErr) {
  const t = el(`<div class="toast ${isErr ? 'err' : ''}">${esc(msg)}</div>`);
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}
function confirm2(msg) { return window.confirm(msg); }
function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso), p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (state.token) headers['X-Auth-Token'] = state.token;
  const res = await fetch(path, { method: opts.method || 'GET', headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const j = await res.json().catch(() => ({ ok: false, error: '响应解析失败' }));
  if (!res.ok || !j.ok) {
    if (res.status === 401) { logout(true); }
    throw new Error(j.error || '请求失败');
  }
  return j.data;
}

/* ---------- 启动 ---------- */
async function boot() {
  if (!state.token) return renderLogin();
  try {
    state.user = await api('/api/auth/me');
    renderApp();
  } catch { renderLogin(); }
}
function logout(silent) {
  api('/api/auth/logout', { method: 'POST' }).catch(() => {});
  state.token = null; state.user = null; localStorage.removeItem('sanji_token');
  if (!silent) renderLogin(); else location.reload();
}

/* ---------- 登录页 ---------- */
function renderLogin() {
  state.view = 'login';
  const demos = [
    ['admin', '院级管理员'], ['hulibu', '护理部主任'], ['teacher_hu', '护理老师'],
    ['teacher_nei', '内科老师'], ['wangxue', '护士考生'], ['zhangqiang', '医生考生'], ['sunyao', '技师考生'],
  ];
  $app.innerHTML = `
  <div class="login-wrap">
    <div class="login-card">
      <div class="brand">
        <div class="logo">医</div>
        <div><h1>医院三基考试管理系统</h1><div class="sub">基础理论 · 基本知识 · 基本技能</div></div>
      </div>
      <div class="tip">护理部统一发布科室考试；医生、护士、技师按岗位进入不同题库；成绩自动归入个人培训档案，缺考人员自动进入补考名单，主观题由科室老师批阅。</div>
      <div class="field"><label>用户名</label><input id="lg-user" value="wangxue" placeholder="请输入用户名"></div>
      <div class="field"><label>密码</label><input id="lg-pass" type="password" value="123456" placeholder="默认密码 123456"></div>
      <button class="btn btn-primary btn-block" id="lg-btn">登 录</button>
      <div class="demo-accounts">
        <div class="t">演示账号（点击可快速填充，密码统一为 123456）：</div>
        <div class="chip-row">
          ${demos.map(([u, n]) => `<span class="chip" data-u="${u}"><b>${n}</b> ${u}</span>`).join('')}
        </div>
      </div>
    </div>
  </div>`;
  document.getElementById('lg-btn').onclick = doLogin;
  document.getElementById('lg-pass').onkeydown = (e) => e.key === 'Enter' && doLogin();
  $app.querySelectorAll('.chip').forEach((c) => c.onclick = () => {
    document.getElementById('lg-user').value = c.dataset.u;
    document.getElementById('lg-pass').value = '123456';
  });
}
async function doLogin() {
  const username = document.getElementById('lg-user').value.trim();
  const password = document.getElementById('lg-pass').value;
  try {
    const d = await api('/api/auth/login', { method: 'POST', body: { username, password } });
    state.token = d.token; state.user = d.user;
    localStorage.setItem('sanji_token', d.token);
    renderApp();
  } catch (e) { toast(e.message, true); }
}

/* ---------- 主框架 ---------- */
const MENUS = {
  examinee: [
    { group: '考试中心', items: [['my-exams', '📝 我的考试'], ['my-archive', '📚 培训档案']] },
  ],
  teacher: [
    { group: '阅卷工作', items: [['grading', '✍️ 待批试卷']] },
    { group: '科室管理', items: [['t-exams', '📋 科室考试'], ['t-makeup', '🔁 补考名单'], ['t-archive', '📚 人员档案'], ['t-bank', '📖 岗位题库']] },
  ],
  nursing: [
    { group: '考务管理', items: [['home', '🏠 护理部首页'], ['exams', '📋 考试管理'], ['makeup', '🔁 补考名单'], ['bank', '📖 题库管理']] },
    { group: '人员与档案', items: [['users', '👥 人员管理'], ['archives', '📚 培训档案'], ['weak', '📊 薄弱知识点']] },
  ],
  admin: [
    { group: '院级概览', items: [['home', '🏠 全院汇总']] },
  ],
};
const DEFAULT_VIEW = { examinee: 'my-exams', teacher: 'grading', nursing: 'home', admin: 'home' };

function renderApp() {
  state.view = DEFAULT_VIEW[state.user.role];
  const groups = MENUS[state.user.role];
  $app.innerHTML = `
  <div class="app">
    <aside class="sidebar">
      <div class="sb-brand"><div class="logo">三</div><div>三基考试系统</div></div>
      <nav class="sb-nav">
        ${groups.map((g) => `
          <div class="sb-group">${g.group}</div>
          ${g.items.map(([v, label]) => `<div class="sb-item ${v === state.view ? 'active' : ''}" data-view="${v}">${label}</div>`).join('')}
        `).join('')}
      </nav>
      <div class="sb-foot">护理部主管 · 培训档案留存</div>
    </aside>
    <div class="main">
      <header class="topbar">
        <div class="page-title" id="page-title"></div>
        <div class="userbox">
          <div class="avatar">${esc(state.user.name[0])}</div>
          <div>${esc(state.user.name)}<div class="muted" style="font-size:11.5px">${esc(state.user.roleLabel)}${state.user.postLabel ? ' · ' + esc(state.user.postLabel) : ''}${state.user.dept ? ' · ' + esc(state.user.dept) : ''}</div></div>
          <button class="btn btn-sm" id="logout-btn">退出</button>
        </div>
      </header>
      <main class="content" id="content"></main>
    </div>
  </div>`;
  $app.querySelectorAll('.sb-item').forEach((it) => it.onclick = () => navigate(it.dataset.view));
  document.getElementById('logout-btn').onclick = () => { logout(); };
  navigate(state.view);
}
const TITLES = {
  home: '工作台', 'my-exams': '我的考试', 'my-archive': '我的培训档案',
  grading: '待批试卷', 't-exams': '科室考试', 't-makeup': '补考名单', 't-archive': '人员档案', 't-bank': '岗位题库',
  exams: '考试管理', makeup: '补考名单', bank: '题库管理', users: '人员管理', archives: '培训档案', weak: '薄弱知识点分析',
};
function navigate(view) {
  state.view = view;
  document.querySelectorAll('.sb-item').forEach((i) => i.classList.toggle('active', i.dataset.view === view));
  const pt = document.getElementById('page-title');
  if (pt) pt.textContent = TITLES[view] || '';
  const c = document.getElementById('content');
  c.innerHTML = '<div class="empty">加载中…</div>';
  const fn = VIEWS[view];
  Promise.resolve(fn ? fn(c) : (c.innerHTML = '<div class="empty">页面不存在</div>')).catch((e) => {
    console.error(e);
    c.innerHTML = `<div class="empty" style="color:var(--danger)">加载失败：${esc(e.message)}</div>`;
  });
}

const VIEWS = {};

/* ===================== 考生视图 ===================== */
VIEWS['my-exams'] = async function (c) {
  const list = await api('/api/my/exams');
  if (!list.length) { c.innerHTML = '<div class="empty">当前暂无可参加的考试</div>'; return; }
  c.innerHTML = `<div class="exam-list">${list.map((e) => {
    const [st, sc] = statusTag(e.liveStatus);
    const [ms, mc] = statusTag(e.myStatus);
    const isMakeup = e.sourceExamId;
    let action = '';
    if (e.myStatus === 'not_started' && e.liveStatus === 'ongoing') action = `<button class="btn btn-primary" data-act="start" data-id="${e.id}">进入考试</button>`;
    else if (e.myStatus === 'ongoing' && e.liveStatus === 'ongoing') action = `<button class="btn btn-primary" data-act="start" data-id="${e.id}">继续答题</button>`;
    else if ((e.myStatus === 'graded')) action = `<button class="btn" data-act="review" data-id="${e.id}">查看试卷解析</button>`;
    else if (e.myStatus === 'submitted') action = `<span class="muted">已交卷，等待科室老师批阅主观题…</span>`;
    else if (e.myStatus === 'absent') action = tag('缺考', 'tag-red');
    else if (e.liveStatus === 'scheduled') action = `<span class="muted">未到开考时间</span>`;
    else if (e.liveStatus === 'ended' && e.myStatus === 'not_started') action = tag('已超时', 'tag-red');
    else action = `<button class="btn" data-act="review" data-id="${e.id}">查看考试</button>`;
    const score = e.myStatus === 'graded'
      ? `<span class="score-big ${e.myTotal >= e.passScore ? 'pass' : 'fail'}">${e.myTotal}</span><span class="muted"> / ${e.fullScore}分（合格线${e.passScore}）</span>`
      : '';
    return `<div class="exam-card ${isMakeup ? 'makeup' : ''}">
      <h4>${isMakeup ? '🔁 ' : ''}${esc(e.title)} ${e.deptScope !== 'all' ? tag('科室专场', 'tag-purple') : ''}</h4>
      <div class="exam-meta">
        岗位：${e.postLabels.map((p) => esc(p)).join('、')} ｜ 题量：${e.questionCount} 题（满分 ${e.fullScore} 分，合格 ${e.passScore} 分，时长 ${e.durationMin} 分钟）<br>
        时间：${fmt(e.startTime)} ～ ${fmt(e.endTime)}<br>
        培训学分：合格计 ${e.credits} 学分 ｜ 状态：${tag(st, sc)} · 我的状态：${tag(ms, mc)}
        ${e.comment ? `<br>批阅评语：<span style="color:#b06a12">${esc(e.comment)}</span>` : ''}
      </div>
      <div class="exam-foot">${score}${action}</div>
    </div>`;
  }).join('')}</div>`;
  c.querySelectorAll('[data-act]').forEach((b) => b.onclick = () => {
    if (b.dataset.act === 'start') openQuiz(b.dataset.id);
    if (b.dataset.act === 'review') openQuiz(b.dataset.id, true);
  });
};

/* ---------- 在线答题 ---------- */
let quizTimer = null;
async function openQuiz(examId, reviewOnly) {
  let data;
  try { data = await api(`/api/exams/${examId}/paper`); }
  catch (e) { toast(e.message, true); return; }
  const { exam, questions } = data;
  const mask = el('<div class="modal-mask"></div>');
  const isReview = reviewOnly || data.myStatus === 'graded' || data.liveStatus === 'closed';
  const showAnswer = isReview;
  mask.innerHTML = `<div class="modal wide"><div class="modal-head">
      ${esc(exam.title)}${exam.sourceExamId ? '（补考）' : ''}
      <span class="x">×</span>
    </div>
    <div class="modal-body" id="quiz-body" style="background:#f3f6f8">
      ${!isReview ? `<div class="quiz-head"><span class="timer" id="q-timer">--:--:--</span>
        <span class="muted">满分 ${questions.reduce((s, q) => s + q.score, 0)} 分，共 ${questions.length} 题；主观题由${POST_LABEL[state.user.post]}科室老师批阅</span>
        <div style="margin-left:auto"><button class="btn btn-primary" id="q-submit">交卷</button></div>
      </div>` : `<div class="quiz-head"><strong>试卷回顾</strong><span class="muted">客观题自动判分 · 主观题得分与参考答案如下</span></div>`}
      <div id="q-list"></div>
    </div>
    ${!isReview ? '<div class="modal-foot"><span class="muted grow" style="margin-right:auto">交卷后客观题立即出分，主观题待批阅</span><button class="btn" id="q-cancel">关闭</button></div>' : '<div class="modal-foot"><button class="btn btn-primary" id="q-cancel">关 闭</button></div>'}
  </div>`;
  document.body.appendChild(mask);
  const body = mask.querySelector('#q-list');

  body.innerHTML = questions.map((q) => {
    let inner = '';
    const givenVal = q.given;
    if (q.type === 'single' || q.type === 'judge') {
      inner = (q.options || []).map((opt, i) => {
        const letter = String.fromCharCode(65 + i);
        const checked = givenVal === letter ? 'checked' : '';
        let cls = '';
        if (showAnswer) { if (letter === q.answer) cls = 'correct'; else if (givenVal === letter) cls = 'wrong'; }
        return `<label class="opt ${cls}"><input type="radio" name="${q.qid}" value="${letter}" ${checked} ${isReview ? 'disabled' : ''}>
          <b>${letter}.</b>&nbsp;${esc(opt)}${showAnswer && letter === q.answer ? ' ✔ 正确答案' : ''}</label>`;
      }).join('');
    } else if (q.type === 'multi') {
      const sel = new Set((givenVal || '').split(''));
      const ansSet = new Set((q.answer || '').split(''));
      inner = (q.options || []).map((opt, i) => {
        const letter = String.fromCharCode(65 + i);
        let cls = '';
        if (showAnswer) { if (ansSet.has(letter)) cls = 'correct'; else if (sel.has(letter)) cls = 'wrong'; }
        return `<label class="opt ${cls}"><input type="checkbox" name="${q.qid}" value="${letter}" ${sel.has(letter) ? 'checked' : ''} ${isReview ? 'disabled' : ''}>
          <b>${letter}.</b>&nbsp;${esc(opt)}${showAnswer && ansSet.has(letter) ? ' ✔' : ''}</label>`;
      }).join('');
    } else if (q.type === 'blank') {
      const arr = Array.isArray(givenVal) ? givenVal : [];
      const ans = Array.isArray(q.answer) ? q.answer : [];
      inner = `<div style="line-height:2.6">${Array.from({ length: q.blanks || ans.length || 1 }).map((_, i) => {
        let resNote = '';
        if (showAnswer) resNote = ` <span class="${(q.awarded !== null && arr[i] === ans[i]) ? '' : ''}muted">（参考答案：<b style="color:var(--ok)">${esc(ans[i] || '')}</b>）</span>`;
        return `<span>（${i + 1}）<input class="blank-input" data-qid="${q.qid}" data-bi="${i}" value="${esc(arr[i] || '')}" ${isReview ? 'disabled' : ''} style="min-width:150px">${resNote}</span>　`;
      }).join('')}</div>`;
    } else {
      inner = `<textarea class="ans" data-qid="${q.qid}" placeholder="请输入${q.typeLabel}作答内容…" ${isReview ? 'disabled' : ''}>${esc(givenVal || '')}</textarea>
        ${showAnswer && q.reference ? `<div class="ref-box"><b>📌 参考要点：</b>${esc(q.reference)}</div>` : ''}`;
    }
    let scoreNote = '';
    if (showAnswer && q.awarded !== null && q.awarded !== undefined) {
      scoreNote = q.type === 'short' || q.type === 'essay' || true
        ? `<span class="tag ${q.awarded >= q.score * 0.6 ? 'tag-green' : 'tag-red'}">得分 ${q.awarded} / ${q.score}</span>` : '';
    }
    return `<div class="q-block">
      <div class="q-title"><span class="q-no">${q.idx}.</span>[${q.typeLabel}] ${esc(q.stem)}<span class="q-score">${q.score}分 · ${esc(q.kp)} ${scoreNote}</span></div>
      ${inner}
    </div>`;
  }).join('');

  const close = () => { clearInterval(quizTimer); mask.remove(); navigate('my-exams'); };
  mask.querySelector('.x').onclick = close;
  mask.querySelector('#q-cancel').onclick = close;

  if (!isReview) {
    // 先通知后端开始
    try { await api(`/api/exams/${examId}/start`, { method: 'POST' }); }
    catch (e) { toast(e.message, true); mask.remove(); return; }
    // 倒计时
    const startedAt = Date.now();
    const endAt = Math.min(startedAt + exam.durationMin * 60000, new Date(exam.endTime).getTime());
    const timerEl = mask.querySelector('#q-timer');
    const tick = () => {
      const left = endAt - Date.now();
      if (left <= 0) { clearInterval(quizTimer); timerEl.textContent = '00:00:00'; toast('考试时间到，自动交卷'); doSubmit(true); return; }
      const h = String(Math.floor(left / 3600000)).padStart(2, '0');
      const mm = String(Math.floor((left % 3600000) / 60000)).padStart(2, '0');
      const ss = String(Math.floor((left % 60000) / 1000)).padStart(2, '0');
      timerEl.textContent = `${h}:${mm}:${ss}`;
      timerEl.classList.toggle('danger', left < 5 * 60000);
    };
    tick(); clearInterval(quizTimer); quizTimer = setInterval(tick, 1000);

    async function doSubmit(auto) {
      const answers = {};
      mask.querySelectorAll('.q-block').forEach((blk) => {
        const firstRadio = blk.querySelector('input[type=radio]');
        const cbs = blk.querySelectorAll('input[type=checkbox]');
        const ta = blk.querySelector('textarea.ans');
        const blanks = blk.querySelectorAll('input.blank-input');
        if (firstRadio) { const ck = blk.querySelector('input[type=radio]:checked'); answers[firstRadio.name] = ck ? ck.value : null; }
        else if (cbs.length) {
          const name = cbs[0].name;
          answers[name] = blk.querySelectorAll('input[type=checkbox]:checked').map((i) => i.value).sort().join('');
        } else if (ta) { answers[ta.dataset.qid] = ta.value; }
        else if (blanks.length) {
          const qid = blanks[0].dataset.qid; const arr = [];
          blanks.forEach((b) => { arr[Number(b.dataset.bi)] = b.value; });
          answers[qid] = arr;
        }
      });
      try {
        const r = await api(`/api/exams/${examId}/submit`, { method: 'POST', body: { answers } });
        clearInterval(quizTimer);
        toast(`${r.message}，客观题 ${r.objectiveTotal} 分`);
        mask.remove(); navigate('my-exams');
      } catch (e) { if (!auto) toast(e.message, true); }
    }
    mask.querySelector('#q-submit').onclick = () => { if (confirm2('确认交卷？交卷后不可修改。')) doSubmit(false); };
  }
}

VIEWS['my-archive'] = async function (c) {
  const a = await api('/api/my/archive');
  c.innerHTML = `
  <div class="grid grid-4">
    ${kpiHtml('累计已出分', a.totalExams, '次', '📄')}
    ${kpiHtml('平均分', a.avgScore ?? '—', '分', '📈', a.avgScore != null && a.avgScore >= 60 ? 'ok' : 'danger')}
    ${kpiHtml('合格率', a.passRate == null ? '—' : a.passRate + '%', '', '✅', 'ok')}
    ${kpiHtml('培训学分', a.totalCredits, '分', '🎓', 'warn')}
  </div>
  <div class="card">
    <h3>考试成绩档案</h3>
    ${a.records.length ? `<table><thead><tr><th>考试名称</th><th>岗位</th><th>提交时间</th><th>成绩</th><th>状态</th><th>学分</th></tr></thead><tbody>
      ${a.records.map((r) => `<tr>
        <td>${esc(r.title)}</td><td>${tag(POST_LABEL[r.post], POST_COLOR[r.post])}</td>
        <td>${fmt(r.submittedAt)}</td>
        <td>${r.status === 'graded' ? `<b class="${r.passed ? '' : ''}" style="color:${r.passed ? 'var(--ok)' : 'var(--danger)'}">${r.total}</b> <span class="muted">(合格线${r.passScore})</span>` : '批阅中'}</td>
        <td>${r.status === 'graded' ? (r.passed ? tag('合格', 'tag-green') : tag('不合格', 'tag-red')) : statusHtml('submitted')}</td>
        <td>${r.credits ? `<b>${r.credits}</b>` : '<span class="muted">—</span>'}</td>
      </tr>`).join('')}
    </tbody></table>` : '<div class="empty">暂无成绩记录</div>'}
  </div>
  ${a.absents.length ? `<div class="card"><h3>缺考记录 <span class="more muted">缺考已自动进入护理部补考名单</span></h3>
    ${a.absents.map((x) => `<span style="margin-right:14px">🔸 ${esc(x.title)}</span>`).join('')}</div>` : ''}
  `;
};

/* ===================== 科室老师视图 ===================== */
VIEWS['grading'] = async function (c) {
  const list = await api('/api/grading/pending');
  c.innerHTML = `<div class="card">
    <h3>待批阅的主观题试卷 <span class="more muted">仅显示本岗位（${esc(POST_LABEL[state.user.post])}）考生的试卷</span></h3>
    ${list.length ? `<table><thead><tr><th>考试</th><th>考生</th><th>科室</th><th>提交时间</th><th>客观题已得</th><th>待批主观题</th><th>操作</th></tr></thead><tbody>
      ${list.map((r) => `<tr>
        <td>${esc(r.examTitle)}</td><td><b>${esc(r.name)}</b></td><td>${esc(r.dept)}</td>
        <td>${fmt(r.submittedAt)}</td>
        <td><b>${r.objectiveTotal}</b> 分</td>
        <td>${tag(r.subjectCount + ' 道 / 共' + r.subjectScore + '分', 'tag-orange')}</td>
        <td><button class="btn btn-primary btn-sm" data-id="${r.attemptId}">批阅打分</button></td>
      </tr>`).join('')}</tbody></table>`
      : '<div class="empty">🎉 暂无待批阅试卷，所有本岗位考生主观题均已完成批阅</div>'}
  </div>`;
  c.querySelectorAll('button[data-id]').forEach((b) => b.onclick = () => openGrading(b.dataset.id));
};

async function openGrading(attemptId) {
  const d = await api(`/api/grading/${attemptId}`);
  const mask = el('<div class="modal-mask"></div>');
  mask.innerHTML = `<div class="modal wide"><div class="modal-head">批阅试卷 — ${esc(d.student.name)}（${esc(d.student.dept)}）<span class="x">×</span></div>
    <div class="modal-body" style="background:#f3f6f8">
      <div class="quiz-head"><b>${esc(d.exam.title)}</b>
        <span class="muted">客观题已自动判分：<b>${d.objectiveTotal}</b> 分；请为下列主观题打分（合格线 ${d.exam.passScore} 分）</span>
      </div>
      <div id="grade-list">
        ${d.items.map((it) => {
          if (it.objective) {
            return `<div class="q-block" style="opacity:.85">
              <div class="q-title"><span class="q-no">·</span>[${it.typeLabel}] ${esc(it.stem)}
                <span class="q-score">${tag(it.correct ? '答对 +' + it.awarded : '答错 0', it.correct ? 'tag-green' : 'tag-red')} / ${it.max}分</span></div>
              <div class="muted" style="margin-bottom:6px">考生作答：${it.type === 'blank' ? (Array.isArray(it.given) ? esc(it.given.join('　')) : esc(it.given)) : esc(it.given)}</div>
            </div>`;
          }
          return `<div class="q-block">
            <div class="q-title">✍️ [${it.typeLabel}] ${esc(it.stem)}<span class="q-score">满分 ${it.max} 分 · ${esc(it.kp)}</span></div>
            <div style="background:#fafcfd;border:1px solid var(--line);border-radius:8px;padding:12px;line-height:1.9;white-space:pre-wrap">${esc(it.given) || '<span class="muted">（考生未作答）</span>'}</div>
            ${it.reference ? `<div class="ref-box"><b>📌 参考要点：</b>${esc(it.reference)}</div>` : ''}
            <div class="grade-row"><b>评分：</b><input type="number" min="0" max="${it.max}" step="1" data-qid="${it.qid}" data-max="${it.max}" value="${Math.round(it.max * 0.7)}"> <span class="muted">/ ${it.max} 分</span></div>
          </div>`;
        }).join('')}
      </div>
      <div class="field" style="margin-top:14px"><label>批阅评语（可选，将展示给考生）</label>
        <textarea id="grade-comment" style="width:100%;min-height:64px;border:1px solid var(--line);border-radius:8px;padding:10px">${esc(d.comment || '')}</textarea></div>
    </div>
    <div class="modal-foot"><span class="muted" style="margin-right:auto" id="grade-proj"></span>
      <button class="btn" id="g-cancel">取消</button>
      <button class="btn btn-primary" id="g-save">提交批阅成绩</button></div>
  </div>`;
  document.body.appendChild(mask);
  const close = () => mask.remove();
  mask.querySelector('.x').onclick = close;
  mask.querySelector('#g-cancel').onclick = close;
  const inputs = [...mask.querySelectorAll('input[data-qid]')];
  const proj = mask.querySelector('#grade-proj');
  const updateProj = () => {
    let sub = 0; inputs.forEach((i) => { sub += Number(i.value) || 0; });
    const total = d.objectiveTotal + sub;
    proj.innerHTML = `主观题合计 ${Math.round(sub * 100) / 100} 分，预计总分 <b style="color:${total >= d.exam.passScore ? 'var(--ok)' : 'var(--danger)'}">${Math.round(total * 100) / 100}</b> 分`;
  };
  inputs.forEach((i) => i.oninput = () => {
    if (Number(i.value) > Number(i.dataset.max)) i.value = i.dataset.max;
    if (Number(i.value) < 0) i.value = 0;
    updateProj();
  });
  updateProj();
  mask.querySelector('#g-save').onclick = async () => {
    const scores = {};
    for (const i of inputs) {
      if (i.value === '') return toast('请完成所有主观题评分', true);
      scores[i.dataset.qid] = Number(i.value);
    }
    try {
      const r = await api(`/api/grading/${attemptId}`, { method: 'POST', body: { scores, comment: mask.querySelector('#grade-comment').value } });
      toast(`批阅完成：总分 ${r.total}，${r.passed ? '合格' : '不合格（已进入补考名单）'}`);
      mask.remove(); navigate('grading');
    } catch (e) { toast(e.message, true); }
  };
}

VIEWS['t-exams'] = async function (c) {
  const exams = await api('/api/exams');
  c.innerHTML = `<div class="card"><h3>与本岗位相关的考试及成绩汇总</h3>
    ${exams.length ? `<table><thead><tr><th>考试名称</th><th>时间</th><th>状态</th><th>岗位汇总</th><th>操作</th></tr></thead><tbody>
      ${exams.map((e) => {
        const [st, sc] = statusTag(e.liveStatus);
        return `<tr><td><b>${esc(e.title)}</b></td><td class="muted">${fmtDate(e.startTime)}</td>
        <td>${tag(st, sc)}</td><td class="muted" data-sum="${e.id}">加载中…</td>
        <td class="row-actions"><button class="btn btn-sm" data-detail="${e.id}">成绩汇总</button>${e.status === 'closed' ? `<button class="btn btn-sm" data-roster="${e.id}">名单/缺考</button>` : ''}</td></tr>`;
      }).join('')}</tbody></table>` : '<div class="empty">暂无考试</div>'}</div>`;
  c.querySelectorAll('[data-detail]').forEach((b) => b.onclick = () => openExamSummary(b.dataset.detail, true));
  c.querySelectorAll('[data-roster]').forEach((b) => b.onclick = () => openRoster(b.dataset.roster, true));
  // 预加载汇总
  for (const e of exams) {
    try {
      const s = await api(`/api/exams/${e.id}/summary`);
      const cell = c.querySelector(`[data-sum="${e.id}"]`);
      if (cell) {
        const p = s.byPost[state.user.post];
        cell.innerHTML = p ? `应考${p.roster} / 已交${p.submitted} / 缺考<b style="color:var(--danger)">${p.absent}</b> / 均分${p.avg ?? '—'}` : '—';
      }
    } catch {}
  }
};

async function openRoster(examId, teacherMode) {
  const [roster] = await Promise.all([api(`/api/exams/${examId}/roster`)]);
  const mask = el('<div class="modal-mask"></div>');
  const rows = teacherMode ? roster.filter((u) => u.post === state.user.post) : roster;
  mask.innerHTML = `<div class="modal"><div class="modal-head">应考名单与状态<span class="x">×</span></div>
    <div class="modal-body"><table><thead><tr><th>姓名</th><th>科室</th><th>岗位</th><th>状态</th><th>成绩</th></tr></thead><tbody>
      ${rows.map((u) => `<tr><td><b>${esc(u.name)}</b></td><td>${esc(u.dept)}</td><td>${tag(u.postLabel, POST_COLOR[u.post])}</td>
        <td>${statusHtml(u.attemptStatus)}</td><td>${u.total ?? '<span class="muted">—</span>'}</td></tr>`).join('')}
    </tbody></table></div><div class="modal-foot"><button class="btn btn-primary" data-close>关 闭</button></div></div>`;
  document.body.appendChild(mask);
  mask.querySelector('.x').onclick = mask.querySelector('[data-close]').onclick = () => mask.remove();
}

async function openExamSummary(examId, teacherMode) {
  const s = await api(`/api/exams/${examId}/summary`);
  const posts = Object.values(s.byPost);
  const mask = el('<div class="modal-mask"></div>');
  mask.innerHTML = `<div class="modal wide"><div class="modal-head">成绩汇总 — ${esc(s.title)}<span class="x">×</span></div>
    <div class="modal-body">
      <div class="grid grid-4">
        ${kpiHtml('应考人数', s.rosterCount, '', '👥')}
        ${kpiHtml('已交卷', s.submittedCount, '', '📝')}
        ${kpiHtml('缺考', s.absentCount, '人', '🚫', s.absentCount ? 'danger' : '')}
        ${kpiHtml('平均分', s.avgScore ?? '—', '分', '📈', s.avgScore != null && s.avgScore >= 60 ? 'ok' : 'danger')}
      </div>
      <div class="card"><h3>分岗位统计</h3><table><thead><tr><th>岗位</th><th>应考</th><th>已交</th><th>已出分</th><th>缺考</th><th>平均分</th><th>合格人数</th></tr></thead><tbody>
        ${posts.map((p) => `<tr><td><b>${esc(p.label)}</b></td><td>${p.roster}</td><td>${p.submitted}</td><td>${p.graded}</td>
          <td>${p.absent ? `<b style="color:var(--danger)">${p.absent}</b>` : 0}</td><td><b>${p.avg ?? '—'}</b></td>
          <td>${tag(p.pass + ' 人', 'tag-green')}</td></tr>`).join('')}
      </tbody></table></div>
      ${s.absentUsers.length ? `<div class="card"><h3>缺考人员（已自动进入补考名单）</h3>
        ${s.absentUsers.map((u) => `<span style="display:inline-block;margin:4px 10px 4px 0">🚫 <b>${esc(u.name)}</b> <span class="muted">${esc(u.dept)} · ${POST_LABEL[u.post]}</span></span>`).join('')}</div>` : ''}
    </div>
    <div class="modal-foot"><button class="btn btn-primary" data-close>关 闭</button></div></div>`;
  document.body.appendChild(mask);
  mask.querySelector('.x').onclick = mask.querySelector('[data-close]').onclick = () => mask.remove();
}

VIEWS['t-makeup'] = async function (c) {
  const rows = await api('/api/makeup');
  c.innerHTML = makeupTableHtml(rows, true);
};
function makeupTableHtml(rows, teacherMode) {
  return `<div class="card"><h3>补考名单 ${teacherMode ? tag('仅本岗位', 'tag-blue') : ''} <span class="more muted">缺考或不合格人员自动进入；护理部可统一安排补考并通知到人</span></h3>
    ${rows.length ? `<table><thead><tr><th>来源考试</th><th>姓名</th><th>科室</th><th>岗位</th><th>原因</th><th>安排的补考</th><th>通知状态</th>${teacherMode ? '' : '<th>操作</th>'}</tr></thead><tbody>
      ${rows.map((r) => `<tr>
        <td>${esc(r.sourceTitle)}</td><td><b>${esc(r.userName)}</b></td><td>${esc(r.dept)}</td>
        <td>${tag(r.postLabel, POST_COLOR[r.post])}</td><td>${tag(r.reason, r.reason.includes('缺考') ? 'tag-red' : r.reason.includes('不合格') ? 'tag-orange' : 'tag-gray')}</td>
        <td>${r.makeupTitle ? esc(r.makeupTitle) : '<span class="muted">待安排</span>'}</td>
        <td>${r.notified ? tag('已通知', 'tag-green') : tag('未通知', 'tag-gray')}</td>
        ${teacherMode ? '' : `<td>${!r.notified ? `<button class="btn btn-sm" data-notify="${r.id}">标记已通知</button>` : ''}</td>`}
      </tr>`).join('')}</tbody></table>
      ${teacherMode ? '' : `<div style="margin-top:14px;display:flex;gap:10px"><button class="btn btn-primary" id="notify-all">一键通知所有未通知人员</button></div>`}`
      : '<div class="empty">暂无补考人员 🎉</div>'}</div>`;
}

VIEWS['t-archive'] = async function (c) {
  c.innerHTML = `<div class="card"><h3>本岗位人员培训档案</h3><div id="arch-list" class="empty">加载中…</div></div>`;
  // 从所有相关考试名单聚合本岗位考生（老师无全院人员管理权限）
  const exams = await api('/api/exams');
  const set = new Map();
  for (const e of exams) {
    const roster = await api(`/api/exams/${e.id}/roster`).catch(() => []);
    roster.filter((u) => u.post === state.user.post).forEach((u) => set.set(u.id, u));
  }
  const people = [...set.values()];
  const box = c.querySelector('#arch-list');
  if (!people.length) { box.className = 'empty'; box.textContent = '暂无本岗位考生'; return; }
  box.className = '';
  box.innerHTML = `<table><thead><tr><th>姓名</th><th>科室</th><th>岗位</th><th>操作</th></tr></thead><tbody>
    ${people.map((u) => `<tr><td><b>${esc(u.name)}</b></td><td>${esc(u.dept)}</td><td>${tag(u.postLabel, POST_COLOR[u.post])}</td>
    <td><button class="btn btn-sm btn-primary" data-uid="${u.id}">查看培训档案</button></td></tr>`).join('')}</tbody></table>`;
  box.querySelectorAll('[data-uid]').forEach((b) => b.onclick = () => openArchive(b.dataset.uid));
};

async function openArchive(userId) {
  const a = await api(`/api/archive/${userId}`);
  const mask = el('<div class="modal-mask"></div>');
  mask.innerHTML = `<div class="modal wide"><div class="modal-head">培训档案 — ${esc(a.name)}（${esc(a.dept)} · ${POST_LABEL[a.post]}）<span class="x">×</span></div>
    <div class="modal-body">
      <div class="grid grid-4">
        ${kpiHtml('已出分次数', a.totalExams, '', '📄')}
        ${kpiHtml('平均分', a.avgScore ?? '—', '分', '📈')}
        ${kpiHtml('合格率', a.passRate == null ? '—' : a.passRate + '%', '', '✅', 'ok')}
        ${kpiHtml('培训学分', a.totalCredits, '', '🎓', 'warn')}
      </div>
      <div class="card"><h3>成绩记录</h3>
        ${a.records.length ? `<table><thead><tr><th>考试</th><th>提交时间</th><th>分数</th><th>结果</th><th>学分</th></tr></thead><tbody>
          ${a.records.map((r) => `<tr><td>${esc(r.title)}</td><td>${fmt(r.submittedAt)}</td>
            <td><b style="color:${r.status === 'graded' && !r.passed ? 'var(--danger)' : 'var(--text)'}">${r.status === 'graded' ? r.total : '批阅中'}</b></td>
            <td>${r.status === 'graded' ? (r.passed ? tag('合格', 'tag-green') : tag('不合格', 'tag-red')) : statusHtml('submitted')}</td>
            <td>${r.credits || '—'}</td></tr>`).join('')}
        </tbody></table>` : '<div class="empty">暂无记录</div>'}
      </div>
      ${a.absents.length ? `<div class="card"><h3>缺考记录</h3>${a.absents.map((x) => `🔸 ${esc(x.title)}　`).join('')}</div>` : ''}
    </div><div class="modal-foot"><button class="btn btn-primary" data-close>关 闭</button></div></div>`;
  document.body.appendChild(mask);
  mask.querySelector('.x').onclick = mask.querySelector('[data-close]').onclick = () => mask.remove();
}

VIEWS['t-bank'] = async function (c) {
  const qs = await api(`/api/questions?post=${state.user.post}`);
  c.innerHTML = `<div class="card"><h3>${POST_LABEL[state.user.post]}岗位题库（只读）<span class="more muted">共 ${qs.length} 题；题目的新增与维护由护理部负责</span></h3>
    ${questionTableHtml(qs, false)}</div>`;
};

/* ===================== 公共小部件 ===================== */
function kpiHtml(label, val, unit, ico, cls = '') {
  return `<div class="kpi ${cls}"><div class="k-label">${esc(label)}</div><div class="k-val">${esc(val)}<span style="font-size:14px;font-weight:400">${esc(unit)}</span></div><div class="k-ico">${ico || ''}</div></div>`;
}
function questionTableHtml(qs, canEdit) {
  if (!qs.length) return '<div class="empty">题库中暂无题目</div>';
  return `<table><thead><tr><th style="width:44px">#</th><th>岗位</th><th>题型</th><th>题目</th><th>知识点</th><th>分值</th><th>状态</th>${canEdit ? '<th>操作</th>' : ''}</tr></thead><tbody>
    ${qs.map((q, i) => `<tr>
      <td class="muted">${i + 1}</td>
      <td>${tag(q.postLabel || POST_LABEL[q.post], POST_COLOR[q.post])}</td>
      <td>${tag(q.typeLabel || TYPE_LABEL[q.type], 'tag-blue')}</td>
      <td style="max-width:380px">${esc(q.stem)}</td>
      <td class="muted">${esc(q.kp)}</td>
      <td>${q.score}</td>
      <td>${q.status === 'active' ? tag('启用', 'tag-green') : tag('停用', 'tag-gray')}</td>
      ${canEdit ? `<td class="row-actions"><button class="btn btn-sm" data-qedit="${q.id}">编辑</button><button class="btn btn-sm btn-danger" data-qdel="${q.id}">删除</button></td>` : ''}
    </tr>`).join('')}
  </tbody></table>`;
}
function barChart(rows, valKey, totalKey, labelFn) {
  return rows.map((r) => {
    const pct = r[totalKey] ? Math.round((r[valKey] / r[totalKey]) * 100) : 0;
    return `<div class="bar-row">
      <div class="bar-label" title="${esc(labelFn(r))}">${esc(labelFn(r))}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
      <div class="bar-val">${r[valKey]} / ${r[totalKey]}（${pct}%）</div>
    </div>`;
  }).join('');
}

/* ===================== 护理部视图 ===================== */
VIEWS['home'] = async function (c) {
  const d = await api('/api/dashboard/hospital');
  const k = d.kpi;
  c.innerHTML = `
  <div class="grid grid-4">
    ${kpiHtml('已发布考试', k.publishedOngoing, '场', '📋')}
    ${kpiHtml('考生总人数', k.examineeCount, '人', '👨‍⚕️')}
    ${kpiHtml('待批阅试卷', k.pendingGrading, '份', '✍️', k.pendingGrading ? 'warn' : '')}
    ${kpiHtml('全院平均分', k.avgScore ?? '—', '分', '📈', k.avgScore >= 60 ? 'ok' : 'danger')}
  </div>
  <div class="grid grid-2">
    <div class="card"><h3>各岗位成绩概况</h3>
      <table><thead><tr><th>岗位</th><th>已出分</th><th>平均分</th><th>合格率</th></tr></thead><tbody>
        ${d.postAgg.map((p) => `<tr><td><b>${esc(p.label)}</b></td><td>${p.graded}</td>
          <td><b>${p.avg ?? '—'}</b></td><td>${p.passRate == null ? '—' : `<b style="color:var(--ok)">${p.passRate}%</b>`}</td></tr>`).join('')}
      </tbody></table>
    </div>
    <div class="card"><h3>考务提醒</h3>
      <div style="line-height:2.4;font-size:13.5px">
        🔸 当前缺考记录共 <b style="color:var(--danger)">${k.absentCount}</b> 人次，待安排补考 <b>${k.makeupListCount}</b> 人<br>
        🔸 有 <b style="color:var(--warn)">${k.pendingGrading}</b> 份试卷等待科室老师批阅主观题<br>
        🔸 薄弱知识点 TOP 项请见「薄弱知识点分析」，可用于组织专项培训<br>
        🔸 草稿考试发布前请确认对应岗位题库题目已备齐
      </div>
    </div>
  </div>
  <div class="card"><h3>薄弱知识点 TOP 10（按错误率）<span class="more"><a data-go="weak">查看完整分析 →</a></span></h3>
    ${d.weakTop.length ? barChart(d.weakTop, 'wrongAnswers', 'answers', (r) => `[${r.postLabel}] ${r.kp}`) : '<div class="empty">暂无数据</div>'}
  </div>
  <div class="card"><h3>各场考试汇总</h3>
    <table><thead><tr><th>考试</th><th>状态</th><th>应考</th><th>已交</th><th>缺考</th><th>均分</th><th>合格率</th><th></th></tr></thead><tbody>
      ${d.exams.map((e) => `<tr><td><b>${esc(e.title)}</b></td><td>${statusHtml(e.liveStatus)}</td>
        <td>${e.rosterCount}</td><td>${e.submittedCount}</td>
        <td>${e.absentCount ? `<b style="color:var(--danger)">${e.absentCount}</b>` : 0}</td>
        <td>${e.avgScore ?? '—'}</td><td>${e.passRate == null ? '—' : e.passRate + '%'}</td>
        <td><button class="btn btn-sm" data-sum="${e.examId}">详细汇总</button></td></tr>`).join('')}
    </tbody></table>
  </div>`;
  c.querySelectorAll('[data-go]').forEach((a) => a.onclick = () => navigate(a.dataset.go));
  c.querySelectorAll('[data-sum]').forEach((b) => b.onclick = () => openExamSummary(b.dataset.sum));
};

VIEWS['exams'] = async function (c) {
  const exams = await api('/api/exams');
  c.innerHTML = `<div class="toolbar">
    <button class="btn btn-primary" id="new-exam">＋ 发布新考试</button>
    <span class="muted">流程：新建草稿 → 确认题库 → 发布 → 考试结束后「结考」（自动登记缺考、生成补考名单）→ 可一键创建补考</span>
  </div>
  <div class="card"><table><thead><tr><th>考试名称</th><th>面向岗位</th><th>考试时间</th><th>时长/合格线</th><th>状态</th><th>操作</th></tr></thead><tbody>
    ${exams.map((e) => {
      const [st, sc] = statusTag(e.liveStatus === 'draft' ? 'draft' : e.status === 'closed' ? 'closed' : e.liveStatus);
      let ops = '';
      if (e.status === 'draft') {
        ops = `<button class="btn btn-sm" data-edit="${e.id}">编辑</button>
               <button class="btn btn-sm btn-primary" data-pub="${e.id}">发布</button>
               <button class="btn btn-sm btn-danger" data-del="${e.id}">删除</button>`;
      } else if (e.status === 'published') {
        ops = `<button class="btn btn-sm" data-sum="${e.id}">成绩汇总</button>
               <button class="btn btn-sm" data-roster="${e.id}">名单</button>
               <button class="btn btn-sm btn-danger" data-close="${e.id}">结考</button>`;
      } else {
        ops = `<button class="btn btn-sm" data-sum="${e.id}">成绩汇总</button>
               <button class="btn btn-sm" data-roster="${e.id}">名单/缺考</button>
               ${e.sourceExamId ? '' : `<button class="btn btn-sm btn-primary" data-mk="${e.id}">安排补考</button>`}`;
      }
      return `<tr>
        <td style="max-width:260px"><b>${esc(e.title)}</b>${e.sourceExamId ? ' ' + tag('补考', 'tag-orange') : ''}<div class="muted" style="font-size:11.5px">${esc(e.intro || '')}</div></td>
        <td>${e.posts.map((p) => tag(POST_LABEL[p], POST_COLOR[p])).join(' ')}</td>
        <td class="muted" style="font-size:12px">${fmt(e.startTime)}<br>～ ${fmt(e.endTime)}</td>
        <td>${e.durationMin}分钟 / ${e.passScore}分<br><span class="muted">合格计${e.credits}学分</span></td>
        <td>${tag(st, sc)}</td>
        <td class="row-actions">${ops}</td>
      </tr>`;
    }).join('')}
  </tbody></table></div>`;
  document.getElementById('new-exam').onclick = () => editExam(null);
  c.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => editExam(b.dataset.edit));
  c.querySelectorAll('[data-pub]').forEach((b) => b.onclick = async () => {
    if (!confirm2('确认发布？发布后对应岗位考生即可在考试时间内进入答题。')) return;
    try { await api(`/api/exams/${b.dataset.pub}/publish`, { method: 'POST' }); toast('考试已发布'); navigate('exams'); }
    catch (e) { toast(e.message, true); }
  });
  c.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
    if (!confirm2('确认删除该草稿考试？')) return;
    await api(`/api/exams/${b.dataset.del}`, { method: 'DELETE' }); toast('已删除'); navigate('exams');
  });
  c.querySelectorAll('[data-close]').forEach((b) => b.onclick = async () => {
    if (!confirm2('确认结考？系统将把未交卷人员登记为缺考，并同步补考名单。')) return;
    try { await api(`/api/exams/${b.dataset.close}/close`, { method: 'POST' }); toast('已结考，缺考已登记'); navigate('exams'); }
    catch (e) { toast(e.message, true); }
  });
  c.querySelectorAll('[data-sum]').forEach((b) => b.onclick = () => openExamSummary(b.dataset.sum));
  c.querySelectorAll('[data-roster]').forEach((b) => b.onclick = () => openRoster(b.dataset.roster));
  c.querySelectorAll('[data-mk]').forEach((b) => b.onclick = () => openMakeupCreate(b.dataset.mk));
};

/* ---------- 考试新建/编辑 ---------- */
const ALL_DEPTS = ['内科', '外科', '急诊科', '儿科', '妇产科', '护理部', '医技科', '检验科', '放射科'];
async function editExam(id) {
  const e = id ? (await api('/api/exams')).find((x) => x.id === id) : null;
  const mask = modalShell(`<h3>${e ? '编辑考试（草稿）' : '新建科室考试'}</h3>`);
  const body = mask.querySelector('.modal-body');
  body.innerHTML = `
    <div class="form-grid">
      <div class="field full"><label>考试名称</label><input id="f-title" value="${esc(e?.title || '')}" placeholder="如：2026年第三季度三基理论考试"></div>
      <div class="field full"><label>考试说明</label><textarea id="f-intro" style="width:100%;min-height:56px;border:1px solid var(--line);border-radius:8px;padding:10px">${esc(e?.intro || '')}</textarea></div>
      <div class="field full"><label>面向岗位（医生、护士、技师进入各自独立题库）</label>
        <div class="check-pills" id="f-posts">
          ${Object.entries(POST_LABEL).map(([k, v]) => `<span class="pill ${!e || e.posts.includes(k) ? 'on' : ''}" data-v="${k}">${v}</span>`).join('')}
        </div>
      </div>
      <div class="field full"><label>科室范围</label>
        <div class="check-pills" id="f-scope">
          <span class="pill ${!e || e.deptScope === 'all' ? 'on' : ''}" data-v="all">全院</span>
          ${ALL_DEPTS.map((d) => `<span class="pill ${e && Array.isArray(e.deptScope) && e.deptScope.includes(d) ? 'on' : ''}" data-v="${d}">${d}</span>`).join('')}
        </div>
      </div>
      <div class="field"><label>开始时间</label><input type="datetime-local" id="f-start" value="${toLocalInput(e?.startTime)}"></div>
      <div class="field"><label>结束时间</label><input type="datetime-local" id="f-end" value="${toLocalInput(e?.endTime)}"></div>
      <div class="field"><label>考试时长（分钟）</label><input type="number" id="f-dur" value="${e?.durationMin || 60}"></div>
      <div class="field"><label>合格分数线</label><input type="number" id="f-pass" value="${e?.passScore || 60}"></div>
      <div class="field"><label>合格所得培训学分</label><input type="number" step="0.5" id="f-cred" value="${e?.credits || 2}"></div>
    </div>`;
  mask.querySelector('#f-posts').querySelectorAll('.pill').forEach((p) => p.onclick = () => p.classList.toggle('on'));
  const scope = mask.querySelector('#f-scope');
  scope.querySelectorAll('.pill').forEach((p) => p.onclick = () => {
    if (p.dataset.v === 'all') { scope.querySelectorAll('.pill').forEach((x) => x.classList.toggle('on', x.dataset.v === 'all')); }
    else { scope.querySelector('[data-v="all"]').classList.remove('on'); p.classList.toggle('on'); }
  });
  mask.querySelector('#g-save') && 0;
  foot(mask, [['取消', ''], ['保存' + (e ? '修改' : '为草稿'), 'btn-primary']], async () => {
    const posts = [...mask.querySelectorAll('#f-posts .pill.on')].map((p) => p.dataset.v);
    if (!posts.length) return toast('至少选择一个岗位', true);
    const scopes = [...scope.querySelectorAll('.pill.on')].map((p) => p.dataset.v);
    const payload = {
      title: mask.querySelector('#f-title').value.trim(),
      intro: mask.querySelector('#f-intro').value,
      posts,
      deptScope: scopes.includes('all') || !scopes.length ? 'all' : scopes.filter((x) => x !== 'all'),
      startTime: mask.querySelector('#f-start').value,
      endTime: mask.querySelector('#f-end').value,
      durationMin: Number(mask.querySelector('#f-dur').value),
      passScore: Number(mask.querySelector('#f-pass').value),
      credits: Number(mask.querySelector('#f-cred').value),
    };
    if (!payload.title || !payload.startTime || !payload.endTime) return toast('请完整填写名称和起止时间', true);
    try {
      if (e) { await api(`/api/exams/${e.id}`, { method: 'PUT', body: payload }); toast('已保存修改'); }
      else { await api('/api/exams', { method: 'POST', body: payload }); toast('已创建草稿，可继续发布'); }
      mask.remove(); navigate('exams');
    } catch (err) { toast(err.message, true); }
  });
}

async function openMakeupCreate(sourceId) {
  const src = (await api('/api/exams')).find((x) => x.id === sourceId);
  const start = new Date(Date.now() + 3 * 86400000); start.setMinutes(0, 0, 0);
  const end = new Date(Date.now() + 5 * 86400000); end.setMinutes(0, 0, 0);
  const mask = modalShell('<h3>安排补考</h3>', '');
  mask.querySelector('.modal-body').innerHTML = `
    <div class="field"><label>补考名称</label><input id="m-title" value="${esc(src.title)}·补考"></div>
    <div class="form-grid">
      <div class="field"><label>补考开始</label><input type="datetime-local" id="m-start" value="${toLocalInput(start.toISOString())}"></div>
      <div class="field"><label>补考结束</label><input type="datetime-local" id="m-end" value="${toLocalInput(end.toISOString())}"></div>
    </div>
    <div class="muted">补考名单中的缺考/不合格人员将自动关联到此场补考，考生在「我的考试」中可见。</div>`;
  foot(mask, [['取消', ''], ['确认安排补考', 'btn-primary']], async () => {
    try {
      await api(`/api/exams/${sourceId}/makeup`, {
        method: 'POST',
        body: {
          title: mask.querySelector('#m-title').value,
          startTime: mask.querySelector('#m-start').value,
          endTime: mask.querySelector('#m-end').value,
        },
      });
      toast('补考已安排并发布'); mask.remove(); navigate('exams');
    } catch (e) { toast(e.message, true); }
  });
}

/* ---------- 弹窗工厂 ---------- */
function modalShell(titleHtml, extraClass = '') {
  const mask = el(`<div class="modal-mask"><div class="modal ${extraClass}">
    <div class="modal-head">${titleHtml}<span class="x">×</span></div>
    <div class="modal-body"></div>
    <div class="modal-foot"></div></div></div>`);
  document.body.appendChild(mask);
  mask.querySelector('.x').onclick = () => mask.remove();
  return mask;
}
function foot(mask, buttons, onPrimary) {
  const f = mask.querySelector('.modal-foot');
  f.innerHTML = buttons.map(([t, cls], i) => `<button class="btn ${cls}" data-i="${i}">${t}</button>`).join('');
  f.querySelectorAll('button').forEach((b) => {
    b.onclick = () => { if (Number(b.dataset.i) === buttons.length - 1) onPrimary(); else mask.remove(); };
  });
}

/* ---------- 题库管理 ---------- */
VIEWS['bank'] = async function (c) {
  const post = state.cache.bankPost || '';
  const type = state.cache.bankType || '';
  const kp = state.cache.bankKp || '';
  const qs = await api(`/api/questions${post ? '?post=' + post : ''}`);
  const filtered = qs.filter((q) => (!type || q.type === type) && (!kp || q.kp.includes(kp)));
  c.innerHTML = `<div class="toolbar">
    <button class="btn btn-primary" id="new-q">＋ 新增题目</button>
    <select class="search" id="q-post"><option value="">全部岗位</option>${Object.entries(POST_LABEL).map(([k, v]) => `<option value="${k}" ${post === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
    <select class="search" id="q-type"><option value="">全部题型</option>${Object.entries(TYPE_LABEL).map(([k, v]) => `<option value="${k}" ${type === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
    <input class="search grow" id="q-kp" placeholder="按知识点筛选" value="${esc(kp)}">
    <span class="muted">共 ${filtered.length} 题</span>
  </div><div class="card">${questionTableHtml(filtered, true)}</div>`;
  const reload = () => { state.cache.bankPost = c.querySelector('#q-post').value; state.cache.bankType = c.querySelector('#q-type').value; state.cache.bankKp = c.querySelector('#q-kp').value; navigate('bank'); };
  c.querySelector('#new-q').onclick = () => editQuestion(null, reload);
  c.querySelector('#q-post').onchange = reload; c.querySelector('#q-type').onchange = reload;
  c.querySelector('#q-kp').onkeydown = (e) => e.key === 'Enter' && reload();
  c.querySelectorAll('[data-qedit]').forEach((b) => b.onclick = () => editQuestion(qs.find((x) => x.id === b.dataset.qedit), reload));
  c.querySelectorAll('[data-qdel]').forEach((b) => b.onclick = async () => {
    if (!confirm2('确认删除该题？')) return;
    await api(`/api/questions/${b.dataset.qdel}`, { method: 'DELETE' }); toast('已删除'); reload();
  });
};

function editQuestion(q0, reload) {
  const mask = modalShell(`<h3>${q0 ? '编辑题目' : '新增题目'}</h3>`, 'wide');
  const body = mask.querySelector('.modal-body');
  const q = q0 || { post: 'nurse', type: 'single', score: 5, kp: '', stem: '', options: ['', '', '', ''], answer: '', reference: '', blanks: 2, status: 'active' };
  body.innerHTML = `
  <div class="form-grid">
    <div class="field"><label>岗位题库</label><select id="qq-post">${Object.entries(POST_LABEL).map(([k, v]) => `<option value="${k}" ${q.post === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
    <div class="field"><label>题型</label><select id="qq-type">${Object.entries(TYPE_LABEL).map(([k, v]) => `<option value="${k}" ${q.type === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
    <div class="field full"><label>题干</label><textarea id="qq-stem" style="width:100%;min-height:70px;border:1px solid var(--line);border-radius:8px;padding:10px">${esc(q.stem)}</textarea></div>
    <div class="field" id="qq-opts-box" style="grid-column:1/-1"><label>选项（单选/多选使用，每行一个；判断请保留“正确/错误”）</label>
      <div id="qq-opts"></div></div>
    <div class="field full" id="qq-ans-box"></div>
    <div class="field" style="grid-column:1/-1"><label>知识点（用于薄弱知识点分析）</label><input id="qq-kp" value="${esc(q.kp)}" placeholder="如：基础护理学-无菌技术"></div>
    <div class="field"><label>分值</label><input type="number" id="qq-score" value="${q.score}"></div>
    <div class="field"><label>状态</label><select id="qq-status"><option value="active" ${q.status === 'active' ? 'selected' : ''}>启用</option><option value="disabled" ${q.status === 'disabled' ? 'selected' : ''}>停用</option></select></div>
  </div>`;
  const typeSel = body.querySelector('#qq-type');
  const optsBox = body.querySelector('#qq-opts');
  const ansBox = body.querySelector('#qq-ans-box');

  function renderOpts() {
    const t = typeSel.value;
    const showOpts = ['single', 'multi', 'judge'].includes(t);
    body.querySelector('#qq-opts-box').classList.toggle('hidden', !showOpts);
    if (showOpts) {
      let arr = Array.isArray(q.options) && q.options.length ? q.options : (t === 'judge' ? ['正确', '错误'] : ['', '', '', '']);
      optsBox.innerHTML = arr.map((o, i) => `<div style="display:flex;gap:8px;margin-bottom:6px"><b style="padding:8px 0">${String.fromCharCode(65 + i)}.</b><input class="qq-opt" data-i="${i}" value="${esc(o)}" style="flex:1;padding:8px 10px;border:1px solid var(--line);border-radius:8px"></div>`).join('')
        + (t === 'judge' ? '' : '<button class="btn btn-sm" id="add-opt">＋ 添加选项</button>');
      const add = optsBox.querySelector('#add-opt');
      if (add) add.onclick = () => { collectOptVals(arr); arr.push(''); renderOptsDynamic(arr); };
    }
    renderAnswer();
  }
  function collectOptVals(arr) { optsBox.querySelectorAll('.qq-opt').forEach((i) => { arr[Number(i.dataset.i)] = i.value; }); }
  function renderOptsDynamic(arr) {
    q.options = arr;
    optsBox.innerHTML = arr.map((o, i) => `<div style="display:flex;gap:8px;margin-bottom:6px"><b style="padding:8px 0">${String.fromCharCode(65 + i)}.</b><input class="qq-opt" data-i="${i}" value="${esc(o)}" style="flex:1;padding:8px 10px;border:1px solid var(--line);border-radius:8px"></div>`).join('')
      + '<button class="btn btn-sm" id="add-opt">＋ 添加选项</button>';
    optsBox.querySelector('#add-opt').onclick = () => { collectOptVals(arr); arr.push(''); renderOptsDynamic(arr); };
  }
  function renderAnswer() {
    const t = typeSel.value;
    if (t === 'single' || t === 'judge') {
      const letters = (optsBox.querySelectorAll('.qq-opt')).length;
      ansBox.innerHTML = `<label>正确答案</label><div class="check-pills" id="qq-ans">
        ${Array.from({ length: letters || 2 }, (_, i) => String.fromCharCode(65 + i)).map((L) => `<span class="pill ${(q.answer || '') === L ? 'on' : ''}" data-v="${L}">${L}</span>`).join('')}</div>
        <div class="muted" style="margin-top:4px">判断题：A=正确，B=错误</div>`;
      ansBox.querySelectorAll('.pill').forEach((p) => p.onclick = () => { ansBox.querySelectorAll('.pill').forEach((x) => x.classList.remove('on')); p.classList.add('on'); });
    } else if (t === 'multi') {
      const letters = (optsBox.querySelectorAll('.qq-opt')).length || 4;
      const sel = new Set((q.answer || '').split(''));
      ansBox.innerHTML = `<label>正确答案（可多选）</label><div class="check-pills" id="qq-ans">
        ${Array.from({ length: letters }, (_, i) => String.fromCharCode(65 + i)).map((L) => `<span class="pill ${sel.has(L) ? 'on' : ''}" data-v="${L}">${L}</span>`).join('')}</div>`;
      ansBox.querySelectorAll('.pill').forEach((p) => p.onclick = () => p.classList.toggle('on'));
    } else if (t === 'blank') {
      const arr = Array.isArray(q.answer) && q.answer.length ? q.answer : ['', ''];
      ansBox.innerHTML = `<label>标准答案（每个空一条，系统按空判分）</label><div id="qq-blanks">
        ${arr.map((x, i) => `<div style="display:flex;gap:8px;margin-bottom:6px"><b style="padding:8px 0">空${i + 1}</b><input class="qq-blank" data-i="${i}" value="${esc(x)}" style="flex:1;padding:8px 10px;border:1px solid var(--line);border-radius:8px"></div>`).join('')}
        <button class="btn btn-sm" id="add-blank">＋ 添加空</button></div>`;
      ansBox.querySelector('#add-blank').onclick = () => {
        const a2 = [...ansBox.querySelectorAll('.qq-blank')].map((i) => i.value); a2.push('');
        q.answer = a2; renderAnswer();
      };
    } else {
      ansBox.innerHTML = `<label>参考评分要点（批阅时展示给科室老师）</label>
        <textarea id="qq-ref" style="width:100%;min-height:110px;border:1px solid var(--line);border-radius:8px;padding:10px">${esc(q.reference || '')}</textarea>`;
    }
  }
  typeSel.onchange = () => { q.type = typeSel.value; q.options = null; q.answer = null; renderOpts(); };
  renderOpts();

  foot(mask, [['取消', ''], ['保存题目', 'btn-primary']], async () => {
    const t = typeSel.value;
    const payload = {
      post: body.querySelector('#qq-post').value, type: t,
      stem: body.querySelector('#qq-stem').value.trim(),
      kp: body.querySelector('#qq-kp').value.trim() || '未分类',
      score: Number(body.querySelector('#qq-score').value),
      status: body.querySelector('#qq-status').value,
    };
    if (['single', 'multi', 'judge'].includes(t)) {
      payload.options = [...optsBox.querySelectorAll('.qq-opt')].map((i) => i.value);
      payload.answer = [...ansBox.querySelectorAll('.pill.on')].map((p) => p.dataset.v).sort().join('');
      if (!payload.options.length || (t !== 'multi' && payload.answer.length !== 1)) return toast('请填写选项并选择正确答案', true);
      if (t === 'multi' && !payload.answer) return toast('请选择正确答案', true);
      payload.blanks = null; payload.reference = '';
    } else if (t === 'blank') {
      payload.answer = [...ansBox.querySelectorAll('.qq-blank')].map((i) => i.value.trim());
      payload.blanks = payload.answer.length;
      if (payload.answer.some((x) => !x)) return toast('请填写每个空的标准答案', true);
      payload.options = null; payload.reference = '';
    } else {
      payload.reference = body.querySelector('#qq-ref').value.trim();
      payload.answer = null; payload.options = null; payload.blanks = null;
      if (!payload.reference) return toast('主观题需填写参考评分要点', true);
    }
    try {
      if (q0) { await api(`/api/questions/${q0.id}`, { method: 'PUT', body: payload }); toast('已保存修改'); }
      else { await api('/api/questions', { method: 'POST', body: payload }); toast('题目已入库'); }
      mask.remove(); reload();
    } catch (e) { toast(e.message, true); }
  });
}

/* ---------- 补考名单（护理部） ---------- */
VIEWS['makeup'] = async function (c) {
  const rows = await api('/api/makeup');
  c.innerHTML = makeupTableHtml(rows, false);
  const bind = () => {
    c.querySelectorAll('[data-notify]').forEach((b) => b.onclick = async () => {
      await api('/api/makeup/notify', { method: 'POST', body: { ids: [b.dataset.notify] } }); toast('已标记通知'); navigate('makeup');
    });
    const all = c.querySelector('#notify-all');
    if (all) all.onclick = async () => {
      const ids = rows.filter((r) => !r.notified).map((r) => r.id);
      if (!ids.length) return;
      await api('/api/makeup/notify', { method: 'POST', body: { ids } }); toast(`已通知 ${ids.length} 人`); navigate('makeup');
    };
  };
  bind();
};

/* ---------- 人员管理 ---------- */
VIEWS['users'] = async function (c) {
  const users = await api('/api/users');
  c.innerHTML = `<div class="toolbar"><button class="btn btn-primary" id="new-user">＋ 新增人员</button><span class="muted">新增考生默认密码 123456，首次登录后可由护理部重置</span></div>
  <div class="card"><table><thead><tr><th>用户名</th><th>姓名</th><th>角色</th><th>岗位</th><th>科室</th><th>操作</th></tr></thead><tbody>
    ${users.map((u) => `<tr>
      <td>${esc(u.username)}</td><td><b>${esc(u.name)}</b></td>
      <td>${tag(u.roleLabel, u.role === 'admin' ? 'tag-purple' : u.role === 'nursing' ? 'tag-blue' : u.role === 'teacher' ? 'tag-orange' : 'tag-gray')}</td>
      <td>${u.postLabel ? tag(u.postLabel, POST_COLOR[u.post]) : '—'}</td>
      <td>${esc(u.dept || '—')}</td>
      <td class="row-actions">${u.role === 'examinee' ? `<button class="btn btn-sm" data-arch="${u.id}">培训档案</button>` : ''}
        <button class="btn btn-sm" data-reset="${u.id}">重置密码</button>
        ${u.username !== 'admin' ? `<button class="btn btn-sm btn-danger" data-rm="${u.id}">删除</button>` : ''}</td>
    </tr>`).join('')}
  </tbody></table></div>`;
  c.querySelector('#new-user').onclick = () => editUser(null);
  c.querySelectorAll('[data-arch]').forEach((b) => b.onclick = () => openArchive(b.dataset.arch));
  c.querySelectorAll('[data-reset]').forEach((b) => b.onclick = async () => {
    if (!confirm2('确认将该用户密码重置为 123456？')) return;
    await api(`/api/users/${b.dataset.reset}`, { method: 'PUT', body: { password: '123456' } }); toast('密码已重置');
  });
  c.querySelectorAll('[data-rm]').forEach((b) => b.onclick = async () => {
    if (!confirm2('确认删除该人员？其历史成绩档案将保留。')) return;
    await api(`/api/users/${b.dataset.rm}`, { method: 'DELETE' }); toast('已删除'); navigate('users');
  });
};
function editUser(u0) {
  const mask = modalShell('<h3>新增人员</h3>');
  mask.querySelector('.modal-body').innerHTML = `
  <div class="form-grid">
    <div class="field"><label>登录用户名</label><input id="u-username"></div>
    <div class="field"><label>姓名</label><input id="u-name"></div>
    <div class="field"><label>角色</label><select id="u-role">
      <option value="examinee">考生（医生/护士/技师）</option>
      <option value="teacher">科室老师（主观题批阅）</option>
      <option value="nursing">护理部管理员</option></select></div>
    <div class="field"><label>岗位（考生必填，决定进入的题库）</label><select id="u-post">
      <option value="">—</option>${Object.entries(POST_LABEL).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
    <div class="field full"><label>科室</label><input id="u-dept" list="dept-list"><datalist id="dept-list">${ALL_DEPTS.map((d) => `<option value="${d}">`).join('')}</datalist></div>
    <div class="field full"><label>初始密码</label><input id="u-pass" value="123456"></div>
  </div>`;
  foot(mask, [['取消', ''], ['保存', 'btn-primary']], async () => {
    const body = {
      username: mask.querySelector('#u-username').value.trim(),
      name: mask.querySelector('#u-name').value.trim(),
      role: mask.querySelector('#u-role').value,
      post: mask.querySelector('#u-post').value || null,
      dept: mask.querySelector('#u-dept').value.trim(),
      password: mask.querySelector('#u-pass').value,
    };
    try { await api('/api/users', { method: 'POST', body }); toast('人员已添加'); mask.remove(); navigate('users'); }
    catch (e) { toast(e.message, true); }
  });
}

/* ---------- 全院培训档案（护理部） ---------- */
VIEWS['archives'] = async function (c) {
  const users = await api('/api/users');
  const examinees = users.filter((u) => u.role === 'examinee');
  c.innerHTML = `<div class="card"><h3>全员培训档案汇总（点击姓名查看个人档案）</h3>
  <table><thead><tr><th>姓名</th><th>科室</th><th>岗位</th><th>操作</th></tr></thead><tbody>
    ${examinees.map((u) => `<tr><td><b>${esc(u.name)}</b></td><td>${esc(u.dept)}</td><td>${tag(u.postLabel, POST_COLOR[u.post])}</td>
    <td><button class="btn btn-sm btn-primary" data-arch="${u.id}">查看档案</button></td></tr>`).join('')}
  </tbody></table></div>`;
  c.querySelectorAll('[data-arch]').forEach((b) => b.onclick = () => openArchive(b.dataset.arch));
};

/* ---------- 薄弱知识点 ---------- */
VIEWS['weak'] = async function (c) {
  const [exams, rows] = await Promise.all([api('/api/exams'), api('/api/weakpoints')]);
  const closed = exams.filter((e) => e.status !== 'draft');
  c.innerHTML = `<div class="toolbar">
    <select class="search" id="w-exam"><option value="">全部考试</option>${closed.map((e) => `<option value="${e.id}">${esc(e.title)}</option>`).join('')}</select>
    <select class="search" id="w-post"><option value="">全部岗位</option>${Object.entries(POST_LABEL).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
    <span class="muted">错误率 ≥ 50% 的知识点建议组织科室专项培训</span>
  </div>
  <div class="card"><h3>薄弱知识点排行（按答题错误率降序）</h3><div id="w-box"></div></div>`;
  const renderRows = (list) => {
    const box = c.querySelector('#w-box');
    if (!list.length) { box.innerHTML = '<div class="empty">暂无数据（考试结考并完成批阅后自动统计）</div>'; return; }
    box.innerHTML = barChart(list, 'wrongAnswers', 'answers', (r) => `[${r.postLabel}] ${r.kp}`)
      + `<table style="margin-top:16px"><thead><tr><th>岗位</th><th>知识点</th><th>作答题次</th><th>错误题次</th><th>错误率</th><th>涉及人数</th></tr></thead><tbody>
        ${list.map((r) => `<tr><td>${tag(r.postLabel, POST_COLOR[r.post])}</td><td><b>${esc(r.kp)}</b></td>
          <td>${r.answers}</td><td>${r.wrongAnswers}</td>
          <td><b style="color:${r.wrongRate >= 50 ? 'var(--danger)' : r.wrongRate >= 30 ? 'var(--warn)' : 'var(--ok)'}">${r.wrongRate}%</b></td>
          <td>${r.weakPeople} / ${r.people}</td></tr>`).join('')}</tbody></table>`;
  };
  renderRows(rows);
  const reload = async () => {
    const eid = c.querySelector('#w-exam').value, p = c.querySelector('#w-post').value;
    const q = new URLSearchParams(); if (eid) q.set('examId', eid); if (p) q.set('post', p);
    renderRows(await api('/api/weakpoints?' + q.toString()));
  };
  c.querySelector('#w-exam').onchange = reload;
  c.querySelector('#w-post').onchange = reload;
};

/* ===================== 院级管理员视图（仅汇总，无个人明细） ===================== */
VIEWS['home-admin'] = null; // 占位
VIEWS['home'] = (function (realHome) {
  return async function (c) {
    if (state.user.role === 'admin') return adminDashboard(c);
    return realHome(c);
  };
})(VIEWS['home']);

async function adminDashboard(c) {
  const d = await api('/api/dashboard/hospital');
  const k = d.kpi;
  c.innerHTML = `
  <div style="background:linear-gradient(120deg,#0e7c86,#2f6fb0);color:#fff;border-radius:12px;padding:22px 26px;margin-bottom:18px;box-shadow:var(--shadow)">
    <div style="font-size:17px;font-weight:600">全院三基考试运行概览</div>
    <div style="opacity:.85;font-size:12.5px;margin-top:6px">院级视图仅展示汇总数据与薄弱知识点，不包含个人成绩明细与题库内容；具体考务由护理部与科室老师负责。</div>
  </div>
  <div class="grid grid-4">
    ${kpiHtml('累计发布考试', k.examCount, '场', '📋')}
    ${kpiHtml('覆盖考生', k.examineeCount, '人次', '👥')}
    ${kpiHtml('全院平均分', k.avgScore ?? '—', '分', '📈', k.avgScore >= 60 ? 'ok' : 'danger')}
    ${kpiHtml('待批阅/缺考', k.pendingGrading + ' / ' + k.absentCount, '份·人', '⚠️', 'warn')}
  </div>
  <div class="grid grid-2">
    <div class="card"><h3>各岗位考核情况</h3>
      <div class="chart-bars">
        ${d.postAgg.map((p) => `<div class="col"><div class="v">均分 ${p.avg ?? '—'}</div>
          <div class="b" style="height:${p.avg ? Math.min(100, p.avg) : 0}%"></div><div class="x">${esc(p.label)}<br>合格率 ${p.passRate ?? '—'}%</div></div>`).join('')}
      </div>
    </div>
    <div class="card"><h3>考试组织概览</h3>
      <table><thead><tr><th>指标</th><th>数值</th></tr></thead><tbody>
        <tr><td>已出分试卷</td><td><b>${k.gradedCount}</b> 份</td></tr>
        <tr><td>等待科室批阅</td><td><b>${k.pendingGrading}</b> 份</td></tr>
        <tr><td>累计缺考</td><td><b style="color:var(--danger)">${k.absentCount}</b> 人次</td></tr>
        <tr><td>待安排补考</td><td><b>${k.makeupListCount}</b> 人</td></tr>
      </tbody></table>
    </div>
  </div>
  <div class="card"><h3>全院薄弱知识点 TOP 10（供院级培训决策参考）</h3>
    ${d.weakTop.length ? barChart(d.weakTop, 'wrongAnswers', 'answers', (r) => `[${r.postLabel}] ${r.kp}`) : '<div class="empty">暂无数据</div>'}
  </div>
  <div class="card"><h3>各场考试总体指标</h3>
    <table><thead><tr><th>考试</th><th>状态</th><th>应考</th><th>参考率</th><th>缺考率</th><th>平均分</th><th>合格率</th></tr></thead><tbody>
      ${d.exams.map((e) => `<tr><td><b>${esc(e.title)}</b></td><td>${statusHtml(e.liveStatus)}</td>
        <td>${e.rosterCount}</td>
        <td>${e.rosterCount ? Math.round((e.submittedCount / e.rosterCount) * 1000) / 10 : 0}%</td>
        <td>${e.rosterCount ? `<b style="color:${e.absentCount / e.rosterCount > 0.2 ? 'var(--danger)' : 'var(--text)'}">${Math.round((e.absentCount / e.rosterCount) * 1000) / 10}%</b>` : '0%'}</td>
        <td>${e.avgScore ?? '—'}</td><td>${e.passRate == null ? '—' : e.passRate + '%'}</td></tr>`).join('')}
    </tbody></table>
  </div>`;
}

boot();
