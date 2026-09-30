'use strict';

// ---------- 发布考试 ----------
async function createExamView(root) {
  const [depts, counts] = await Promise.all([Api.get('/departments'), Api.get('/questions/meta/counts')]);
  function defaultStart() {
    const d = new Date(Date.now() + 5 * 60000); d.setSeconds(0, 0);
    return toLocalInput(d);
  }
  function toLocalInput(d) {
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  root.innerHTML = `
    <h2 class="page-title">发布科室三基考试</h2>
    <p class="page-desc">护理部面向指定科室发布考试，系统按岗位从对应题库随机抽题组卷，并自动生成考生名册</p>
    <div class="card">
      <div class="row">
        <div class="field" style="flex:2"><label>考试名称</label><input id="fTitle" placeholder="如：2026年Q3护理三基理论考试（心内科）"></div>
        <div class="field"><label>三基类别</label><select id="fLevel">
          <option value="sanji">三基（综合）</option><option value="basic">基本理论</option><option value="special">专科</option></select></div>
      </div>
      <div class="row">
        <div class="field"><label>岗位题库</label><select id="fJob">
          <option value="nurse">护士题库</option><option value="doctor">医生题库</option><option value="technician">技师题库</option></select></div>
        <div class="field"><label>考试时长（分钟）</label><input id="fDuration" type="number" value="30"></div>
        <div class="field"><label>合格分数线</label><input id="fPass" type="number" value="60"></div>
      </div>
      <div class="row">
        <div class="field"><label>开始时间</label><input id="fStart" type="datetime-local" value="${defaultStart()}"></div>
        <div class="field"><label>截止时间</label><input id="fEnd" type="datetime-local" value="${toLocalInput(new Date(Date.now() + 7 * 86400000))}"></div>
      </div>
      <div class="field"><label>面向科室（所选科室中同岗位考生自动入册）</label>
        <div class="checkbox-group" id="fDepts">${depts.map((d) => `<label><input type="checkbox" value="${d.id}"> ${UI.esc(d.name)}</label>`).join('')}</div></div>
      <div class="field"><label>试卷构成（按题型随机抽题）</label>
        <table id="compTable"><thead><tr><th>题型</th><th>抽题数量</th><th>每题分值</th><th>题库存量</th></tr></thead>
        <tbody>${[['single', '单选题'], ['multi', '多选题'], ['judge', '判断题'], ['essay', '简答题']].map(([t, label]) => `
          <tr data-type="${t}"><td>${label}</td>
            <td><input class="comp-count" type="number" min="0" value="${t === 'single' ? 5 : 0}"></td>
            <td><input class="comp-score" type="number" min="0" value="${t === 'single' ? 2 : (t === 'multi' ? 3 : (t === 'essay' ? 4 : 2))}"></td>
            <td class="comp-stock muted">—</td></tr>`).join('')}</tbody></table></div>
      <div class="row"><div class="field"><b>卷面总分：<span id="totalScore">10</span> 分</b>
        <span class="pill-note">（请将合格线与总分设置匹配，演示试卷可按小分值配置）</span></div></div>
      <button class="btn" id="publishBtn" style="padding:10px 26px">确认发布并组卷</button>
    </div>`;

  const countMap = {};
  counts.forEach((c) => { countMap[c.job_type + '|' + c.type] = c.count; });
  function refreshStock() {
    const jt = document.getElementById('fJob').value;
    root.querySelectorAll('#compTable tbody tr').forEach((tr) => {
      const n = countMap[jt + '|' + tr.dataset.type] || 0;
      tr.querySelector('.comp-stock').textContent = n + ' 题';
    });
    updateTotal();
  }
  function updateTotal() {
    let total = 0;
    root.querySelectorAll('#compTable tbody tr').forEach((tr) => {
      total += Number(tr.querySelector('.comp-count').value || 0) * Number(tr.querySelector('.comp-score').value || 0);
    });
    document.getElementById('totalScore').textContent = total;
  }
  document.getElementById('fJob').onchange = refreshStock;
  root.querySelectorAll('#compTable input').forEach((i) => i.oninput = updateTotal);
  refreshStock();

  document.getElementById('publishBtn').onclick = () => UI.handler(async () => {
    const job_type = document.getElementById('fJob').value;
    const dept_ids = [...document.querySelectorAll('#fDepts input:checked')].map((i) => Number(i.value));
    if (!document.getElementById('fTitle').value.trim()) throw new Error('请填写考试名称');
    if (!dept_ids.length) throw new Error('请至少选择一个面向科室');
    const composition = [];
    for (const tr of root.querySelectorAll('#compTable tbody tr')) {
      const count = Number(tr.querySelector('.comp-count').value || 0);
      const score_each = Number(tr.querySelector('.comp-score').value || 0);
      if (count > 0) {
        if (score_each <= 0) throw new Error('抽题题型的每题分值必须大于 0');
        composition.push({ type: tr.dataset.type, count, score_each });
      }
    }
    if (!composition.length) throw new Error('请至少配置一种题型并设置抽题数量');
    const r = await Api.post('/exams', {
      title: document.getElementById('fTitle').value.trim(),
      level: document.getElementById('fLevel').value,
      job_type, dept_ids,
      start_time: document.getElementById('fStart').value.replace('T', ' ') + ':00',
      end_time: document.getElementById('fEnd').value.replace('T', ' ') + ':00',
      duration_minutes: Number(document.getElementById('fDuration').value),
      pass_score: Number(document.getElementById('fPass').value),
      composition,
    });
    UI.toast('考试已发布，试卷已按岗位随机生成', 'ok');
    location.hash = '#/summary/' + r.id;
  });
}

// ---------- 题库管理 ----------
async function questionsView(root) {
  const [kps, jobCounts] = await Promise.all([Api.get('/knowledge-points'), Api.get('/questions/meta/counts')]);
  let curJob = 'nurse';
  let curType = '';

  async function loadList() {
    const list = await Api.get(`/questions?job_type=${curJob}${curType ? '&type=' + curType : ''}`);
    document.getElementById('qList').innerHTML = `<table><thead><tr><th width="44">#</th><th>题型</th><th>题干</th><th>知识点</th><th>分值</th></tr></thead>
      <tbody>${list.map((q) => `<tr>
        <td>${q.id}</td><td>${UI.qtypeBadge(q.type)}</td>
        <td>${UI.esc(q.stem)}<br><span class="pill-note">标准答案：${q.type === 'essay' ? UI.esc(q.reference_answer || '—') : (Array.isArray(q.answer) ? q.answer.join('、') : (q.type === 'judge' ? (q.answer ? '正确' : '错误') : UI.esc(q.answer)))}</span></td>
        <td>${UI.esc(q.kp_name || '—')}</td><td>${q.score}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">该岗位下暂无题目</td></tr>'}</tbody></table>`;
  }

  root.innerHTML = `
    <h2 class="page-title">分岗位题库管理</h2>
    <p class="page-desc">医生、护士、技师使用相互独立的题库；组卷时仅从对应岗位随机抽题</p>
    <div class="card filter-bar">
      <div class="field"><label>岗位</label><select id="qfJob">
        <option value="nurse">护士</option><option value="doctor">医生</option><option value="technician">技师</option></select></div>
      <div class="field"><label>题型</label><select id="qfType">
        <option value="">全部</option><option value="single">单选题</option><option value="multi">多选题</option>
        <option value="judge">判断题</option><option value="essay">简答题（主观题）</option></select></div>
      <button class="btn" id="qfBtn">查询</button>
    </div>
    <div class="grid grid-2">
      <div class="card"><h3>题目列表</h3><div id="qList">${UI.loading()}</div></div>
      <div class="card"><h3>➕ 新增题目</h3>${questionFormHtml(kps, curJob)}
        <button class="btn" id="addQBtn">保存题目</button>
        <hr style="margin:14px 0;border:none;border-top:1px solid var(--border)">
        <h3>新增知识点</h3>
        <div class="row"><div class="field"><select id="kpJob">${['nurse', 'doctor', 'technician'].map((j) => `<option value="${j}">${UI.jobLabel(j)}</option>`).join('')}</select></div>
        <div class="field" style="flex:2"><input id="kpName" placeholder="知识点名称，如：休克急救"></div>
        <div class="field"><button class="btn secondary" id="addKpBtn">添加</button></div></div></div>
    </div>`;

  document.getElementById('qfJob').onchange = (e) => { curJob = e.target.value; bindForm(kps); UI.handler(loadList); };
  document.getElementById('qfType').onchange = (e) => { curType = e.target.value; UI.handler(loadList); };
  document.getElementById('qfBtn').onclick = () => UI.handler(loadList);
  bindForm(kps);
  loadList();

  function bindForm(allKps) {
    const jt = document.getElementById('qfJob').value;
    const box = document.getElementById('qFormKp');
    box.innerHTML = (allKps.filter((k) => k.job_type === jt)).map((k) => `<option value="${k.id}">${UI.esc(k.name)}</option>`).join('');
    const typeSel = document.getElementById('qFormType');
    typeSel.onchange = renderAnswerArea;
    renderAnswerArea();
    document.getElementById('addQBtn').onclick = () => UI.handler(async () => {
      const type = typeSel.value;
      const body = {
        job_type: jt, type,
        stem: document.getElementById('qStem').value.trim(),
        kp_id: Number(box.value) || null,
        score: Number(document.getElementById('qScore').value || 5),
      };
      if (!body.stem) throw new Error('请填写题干');
      if (type === 'single') {
        const opts = collectOptions();
        const ans = document.querySelector('input[name="qAnsSingle"]:checked');
        if (!ans) throw new Error('请选择正确选项');
        body.options = opts; body.answer = ans.value;
      } else if (type === 'multi') {
        const opts = collectOptions();
        const ans = [...document.querySelectorAll('input[name="qAnsMulti"]:checked')].map((i) => i.value);
        if (!ans.length) throw new Error('请勾选正确选项（可多选）');
        body.options = opts; body.answer = ans;
      } else if (type === 'judge') {
        const v = document.querySelector('input[name="qAnsJudge"]:checked');
        if (!v) throw new Error('请选择正确/错误');
        body.answer = v.value === 'true';
      } else {
        body.reference_answer = document.getElementById('qRef').value.trim();
        body.answer = '';
      }
      await Api.post('/questions', body);
      UI.toast('题目已入库', 'ok');
      loadList();
    });
  }
  function collectOptions() {
    return [...document.querySelectorAll('.q-opt-line input')].map((i) => i.value).filter((v) => v.trim());
  }
  function renderAnswerArea() {
    const jt = document.getElementById('qfJob').value;
    const type = document.getElementById('qFormType').value;
    const area = document.getElementById('answerArea');
    if (type === 'single') {
      area.innerHTML = [0, 1, 2, 3].map((i) => `<div class="q-opt-line" style="display:flex;gap:6px;margin-bottom:6px">
        <input type="radio" name="qAnsSingle" value="${'ABCD'[i]}" style="width:auto;margin-top:9px">
        <input placeholder="选项 ${'ABCD'[i]} 内容" value="${['A. ', 'B. ', 'C. ', 'D. '][i]}"></div>`).join('');
    } else if (type === 'multi') {
      area.innerHTML = [0, 1, 2, 3].map((i) => `<div class="q-opt-line" style="display:flex;gap:6px;margin-bottom:6px">
        <input type="checkbox" name="qAnsMulti" value="${'ABCD'[i]}" style="width:auto;margin-top:9px">
        <input placeholder="选项 ${'ABCD'[i]} 内容" value="${['A. ', 'B. ', 'C. ', 'D. '][i]}"></div>`).join('');
    } else if (type === 'judge') {
      area.innerHTML = `<div class="checkbox-group"><label><input type="radio" name="qAnsJudge" value="true"> 正确</label>
        <label><input type="radio" name="qAnsJudge" value="false"> 错误</label></div>`;
    } else {
      area.innerHTML = `<textarea id="qRef" placeholder="参考答案/评分要点，供科室老师批阅主观题时参考"></textarea>`;
    }
  }
  document.getElementById('addKpBtn').onclick = () => UI.handler(async () => {
    const name = document.getElementById('kpName').value.trim();
    if (!name) throw new Error('请填写知识点名称');
    await Api.post('/knowledge-points', { job_type: document.getElementById('kpJob').value, name });
    UI.toast('知识点已添加', 'ok');
    location.hash = '#/questions';
  });

  function questionFormHtml(allKps, jt) {
    return `<div class="field"><label>题型</label><select id="qFormType">
      <option value="single">单选题（客观·自动判分）</option>
      <option value="multi">多选题（客观·自动判分）</option>
      <option value="judge">判断题（客观·自动判分）</option>
      <option value="essay">简答题（主观·科室老师批阅）</option></select></div>
      <div class="row"><div class="field"><label>关联知识点（用于薄弱分析）</label><select id="qFormKp"></select></div>
      <div class="field" style="max-width:110px"><label>分值</label><input id="qScore" type="number" value="5"></div></div>
      <div class="field"><label>题干</label><textarea id="qStem"></textarea></div>
      <div class="field"><label>答案设置</label><div id="answerArea"></div></div>`;
  }
}

// ---------- 补考名单 ----------
async function makeupView(root) {
  const exams = await Api.get('/exams');
  async function render() {
    const rows = await Api.get('/makeup');
    document.getElementById('makeupBody').innerHTML = rows.map((m) => {
      const actions = [
        m.status === 'pending' ? `<button class="btn small secondary" data-act="notified" data-id="${m.id}">标记已通知</button>` : '',
        m.status === 'pending' || m.status === 'notified' ? `
          <button class="btn small" data-act="scheduled" data-id="${m.id}">安排补考专场</button>
          <button class="btn small ghost" data-act="waived" data-id="${m.id}">豁免</button>` : '',
      ].join('');
      return `<tr>
        <td>${UI.esc(m.dept_name)} · ${UI.esc(m.real_name)}<br><span class="pill-note">${UI.jobLabel(m.job_type)}</span></td>
        <td>${UI.esc(m.exam_title)}</td>
        <td>${UI.statusBadge(m.reason + '_reason')}</td>
        <td>${UI.statusBadge(m.status)}</td>
        <td>${m.makeup_exam_title ? UI.esc(m.makeup_exam_title) : '<span class="muted">待安排</span>'}</td>
        <td>${actions || '<span class="muted">已闭环</span>'}</td></tr>`;
    }).join('') || '<tr><td colspan="6" class="muted">补考名单为空</td></tr>';

    document.getElementById('makeupBody').querySelectorAll('button[data-act]').forEach((b) => b.onclick = () => UI.handler(async () => {
      if (b.dataset.act === 'scheduled') {
        const options = exams.filter((e) => e.status === 'published')
          .map((e) => `<option value="${e.id}">${UI.esc(e.title)}（${UI.jobLabel(e.job_type)}）</option>`).join('');
        if (!options) return UI.toast('暂无进行中的考试可作为补考专场，请先在"发布考试"中创建补考专场', 'error');
        const pick = prompt('选择补考专场（输入序号）：\n' +
          exams.filter((e) => e.status === 'published').map((e, i) => `${i + 1}. ${e.title}`).join('\n'));
        if (!pick) return;
        const target = exams.filter((e) => e.status === 'published')[Number(pick) - 1];
        if (!target) return;
        await Api.post(`/makeup/${b.dataset.id}/arrange`, { makeup_exam_id: target.id });
        UI.toast('已加入补考专场名册', 'ok');
      } else {
        if (b.dataset.act === 'waived' && !confirm('确认豁免该人员本次补考要求？')) return;
        await Api.post(`/makeup/${b.dataset.id}/status`, { status: b.dataset.act });
        UI.toast('状态已更新', 'ok');
      }
      render();
    }));
  }
  root.innerHTML = `<h2 class="page-title">补考名单（闭环管理）</h2>
    <p class="page-desc">考试截止后未交卷者自动以"缺考"入单；主观题批阅完成后不合格者以"成绩不合格"入单。可通知、安排补考专场或豁免</p>
    <div class="card"><table><thead><tr><th>人员</th><th>原考试</th><th>入单原因</th><th>状态</th><th>补考专场</th><th>操作</th></tr></thead>
    <tbody id="makeupBody">${UI.loading()}</tbody></table></div>`;
  render();
}

// ---------- 人员与科室 ----------
async function peopleView(root) {
  const [depts, users] = await Promise.all([Api.get('/departments'), Api.get('/users')]);
  root.innerHTML = `<h2 class="page-title">人员与科室</h2><p class="page-desc">维护科室、科室老师与分岗位考生账号</p>
    <div class="grid grid-2">
      <div class="card"><h3>👥 用户列表（${users.length}）</h3><table><thead><tr><th>姓名</th><th>角色</th><th>岗位</th><th>科室</th><th>账号</th></tr></thead>
        <tbody>${users.map((u) => `<tr><td>${UI.esc(u.real_name)}</td><td>${UI.roleLabel(u.role)}</td>
          <td>${u.job_type ? UI.jobLabel(u.job_type) : '—'}</td><td>${UI.esc(u.dept_name || '—')}</td><td>${UI.esc(u.username)}</td></tr>`).join('')}</tbody></table></div>
      <div>
        <div class="card"><h3>➕ 新增用户</h3>
          <div class="row"><div class="field"><label>姓名</label><input id="uRealName"></div>
          <div class="field"><label>登录账号</label><input id="uUsername"></div></div>
          <div class="field"><label>初始密码</label><input id="uPassword" value="123456"></div>
          <div class="row"><div class="field"><label>角色</label><select id="uRole">
            <option value="examinee">考生</option><option value="dept_teacher">科室老师</option>
            <option value="hospital_admin">院级管理员</option><option value="nursing_admin">护理部管理员</option></select></div>
          <div class="field" id="jobWrap"><label>岗位（考生必填）</label><select id="uJob">
            <option value="nurse">护士</option><option value="doctor">医生</option><option value="technician">技师</option></select></div></div>
          <div class="field"><label>科室</label><select id="uDept"><option value="">—</option>${depts.map((d) => `<option value="${d.id}">${UI.esc(d.name)}</option>`).join('')}</select></div>
          <button class="btn" id="addUserBtn">创建账号</button></div>
        <div class="card"><h3>➕ 新增科室</h3><div class="row">
          <div class="field" style="flex:2"><input id="dName" placeholder="科室名称，如：骨科"></div>
          <div class="field"><button class="btn secondary" id="addDeptBtn">添加科室</button></div></div></div>
      </div>
    </div>`;
  document.getElementById('uRole').onchange = (e) => {
    document.getElementById('jobWrap').style.display = e.target.value === 'examinee' ? '' : 'none';
  };
  document.getElementById('addUserBtn').onclick = () => UI.handler(async () => {
    const role = document.getElementById('uRole').value;
    await Api.post('/users', {
      real_name: document.getElementById('uRealName').value.trim(),
      username: document.getElementById('uUsername').value.trim(),
      password: document.getElementById('uPassword').value,
      role,
      job_type: role === 'examinee' ? document.getElementById('uJob').value : null,
      dept_id: Number(document.getElementById('uDept').value) || null,
    });
    UI.toast('账号已创建', 'ok'); peopleView(root);
  });
  document.getElementById('addDeptBtn').onclick = () => UI.handler(async () => {
    await Api.post('/departments', { name: document.getElementById('dName').value.trim() });
    UI.toast('科室已添加', 'ok'); peopleView(root);
  });
}

// ---------- 薄弱知识点 ----------
async function weakView(root) {
  const depts = await Api.get('/departments');
  async function render() {
    const jt = document.getElementById('wJob').value;
    const did = document.getElementById('wDept').value;
    const qs = new URLSearchParams();
    if (jt) qs.set('job_type', jt);
    if (did) qs.set('dept_id', did);
    const rows = await Api.get('/analytics/weak-points?' + qs.toString());
    document.getElementById('wChart').innerHTML = UI.bars(rows.map((k) => ({
      label: `[${UI.jobLabel(k.job_type)}] ${k.kp_name}`, value: k.mastery_rate,
      display: '掌握率 ' + k.mastery_rate + '%', sub: k.answer_count + ' 人次 · 人均失分 ' + k.avg_loss + ' 分',
    })));
    document.getElementById('wTable').innerHTML = `<table><thead><tr><th>岗位</th><th>知识点</th><th>作答人次</th><th>掌握率</th><th>人均失分</th></tr></thead>
      <tbody>${rows.map((k) => `<tr><td>${UI.jobLabel(k.job_type)}</td><td>${UI.esc(k.kp_name)}</td>
        <td>${k.answer_count}</td><td>${k.mastery_rate}%</td><td>${k.avg_loss}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">暂无已批阅数据</td></tr>'}</tbody></table>`;
  }
  root.innerHTML = `<h2 class="page-title">薄弱知识点分析</h2>
    <p class="page-desc">基于已批阅答卷按知识点聚合得分率，按升序定位培训重点（建议护理部据此组织专项培训）</p>
    <div class="card filter-bar">
      <div class="field"><label>岗位</label><select id="wJob"><option value="">全部岗位</option>
        <option value="nurse">护士</option><option value="doctor">医生</option><option value="technician">技师</option></select></div>
      <div class="field"><label>科室</label><select id="wDept"><option value="">全院</option>${depts.map((d) => `<option value="${d.id}">${UI.esc(d.name)}</option>`).join('')}</select></div>
      <button class="btn" id="wBtn">分析</button></div>
    <div class="card"><h3>🎯 掌握率排行（从低到高）</h3><div id="wChart">${UI.loading()}</div></div>
    <div class="card"><div id="wTable"></div></div>`;
  document.getElementById('wBtn').onclick = () => UI.handler(render);
  render();
}

window.ViewRegistry = window.ViewRegistry || {};
window.ViewRegistry.nursing_admin = Object.assign(window.ViewRegistry.nursing_admin || {}, {
  create: createExamView,
  questions: questionsView,
  makeup: makeupView,
  people: peopleView,
  analytics: weakView,
});
