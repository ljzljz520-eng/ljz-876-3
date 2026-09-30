'use strict';
const MENUS = {
  examinee: [
    { route: 'exams', label: '我的考试', icon: '📝' },
    { route: 'makeup', label: '我的补考', icon: '🔁' },
    { route: 'archive', label: '培训档案', icon: '📂' },
  ],
  nursing_admin: [
    { route: 'dashboard', label: '工作概览', icon: '📊' },
    { route: 'exams', label: '考试管理', icon: '📝' },
    { route: 'create', label: '发布考试', icon: '➕' },
    { route: 'questions', label: '题库管理', icon: '📚' },
    { route: 'makeup', label: '补考名单', icon: '🔁' },
    { route: 'people', label: '人员科室', icon: '👥' },
    { route: 'analytics', label: '薄弱知识点', icon: '🎯' },
  ],
  dept_teacher: [
    { route: 'grading', label: '主观题批阅', icon: '✍️' },
    { route: 'exams', label: '科室考试', icon: '📝' },
    { route: 'makeup', label: '补考名单', icon: '🔁' },
    { route: 'archive', label: '科室档案', icon: '📂' },
  ],
  hospital_admin: [
    { route: 'overview', label: '全院汇总', icon: '📊' },
    { route: 'analytics', label: '薄弱知识点', icon: '🎯' },
    { route: 'makeup', label: '补考跟踪', icon: '🔁' },
  ],
};

function loginView() {
  return `<div class="login-wrap"><div class="login-card">
    <h1>医院三基考试管理系统</h1>
    <div class="sub">基本理论 · 基本知识 · 基本技能 —— 培训考核闭环管理</div>
    <form id="loginForm">
      <div class="field"><label>用户名</label><input id="loginUser" placeholder="请输入用户名" autocomplete="username"></div>
      <div class="field"><label>密码</label><input id="loginPwd" type="password" placeholder="请输入密码" autocomplete="current-password"></div>
      <button class="btn" style="width:100%;padding:10px" type="submit">登 录</button>
    </form>
    <div class="login-demo">
      <b>演示账号</b>（护理部/院级/老师密码 admin123，考生密码 123456）<br>
      nursing 护理部　hospital 院级管理员<br>
      teacher_xnk 心内科老师<br>
      n1 护士（合格）/ n3 护士（不合格）/ d1 医生 / t1 技师
    </div>
  </div></div>`;
}

async function route() {
  const app = document.getElementById('app');
  const u = Api.user();
  const hash = location.hash.replace(/^#\/?/, '');
  const [page, ...rest] = hash.split('/');

  if (!Api.token() || !u) {
    app.innerHTML = loginView();
    document.getElementById('loginForm').onsubmit = async (e) => {
      e.preventDefault();
      await UI.handler(async () => {
        const r = await Api.post('/login', { username: document.getElementById('loginUser').value.trim(), password: document.getElementById('loginPwd').value });
        Api.setSession(r.token, r.user);
        UI.toast('欢迎，' + r.user.real_name, 'ok');
        location.hash = defaultRoute(r.user.role);
        route();
      });
    };
    return;
  }

  const menu = MENUS[u.role];
  const active = page || defaultRoute(u.role);
  if (!page) { location.hash = defaultRoute(u.role); return; }

  const renderer = ViewRegistry[u.role] && ViewRegistry[u.role][active];
  if (!renderer) { location.hash = defaultRoute(u.role); return; }
  app.innerHTML = UI.layout(menu, active, UI.loading());
  UI.bindLogout();
  await UI.handler(() => renderer(document.getElementById('viewRoot'), rest));
}

function defaultRoute(role) {
  return { examinee: 'exams', nursing_admin: 'dashboard', dept_teacher: 'grading', hospital_admin: 'overview' }[role];
}

window.addEventListener('hashchange', route);
window.addEventListener('DOMContentLoaded', route);
