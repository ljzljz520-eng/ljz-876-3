'use strict';
const TeacherView = (() => {
  // ---------- 批阅台 ----------
  async function grading(root) {
    const exams = await Api.get('/exams');
    const gradable = exams; // 科室范围内的考试后端已过滤
    root.innerHTML = `<h2 class="page-title">主观题批阅</h2>
      <p class="page-desc">仅可批阅本科室考生答卷；客观题已由系统自动判分，你只需评阅简答题并确认最终成绩</p>
      <div class="card"><h3>📝 待批阅考试</h3>
        <table><thead><tr><th>考试</th><th>岗位</th><th>时间</th><th>状态</th><th>操作</th></tr></thead>
        <tbody>${gradable.map((e) => `<tr>
          <td>${UI.esc(e.title)}</td><td>${UI.jobLabel(e.job_type)}</td>
          <td>${UI.fmtTime(e.end_time)} 截止</td><td>${UI.statusBadge(e.status)}</td>
          <td><a class="btn small" href="#/grade/${e.id}">进入批阅</a>
          <a class="btn small secondary" href="#/summary/${e.id}">查看汇总</a></td></tr>`).join('')
          || '<tr><td colspan="5" class="muted">当前没有涉及你科室的考试</td></tr>'}</tbody></table></div>`;
  }

  // ---------- 单场考试批阅列表 ----------
  async function gradeList(root, params) {
    const examId = params[0];
    const data = await Api.get(`/exams/${examId}/grading/pending`);
    root.innerHTML = `<h2 class="page-title">批阅：${UI.esc(data.exam.title)}</h2>
      <p class="page-desc">客观分由系统自动计算；主观题批阅完成后自动计算总分、归档培训档案，不合格者自动进入补考名单</p>
      <div class="card"><table><thead><tr><th>科室</th><th>考生</th><th>交卷时间</th><th>客观分</th><th>主观题</th><th>状态</th><th>操作</th></tr></thead>
      <tbody>${data.list.map((r) => `<tr>
        <td>${UI.esc(r.dept_name)}</td><td>${UI.esc(r.real_name)}</td>
        <td>${UI.fmtTime(r.submitted_at)}</td><td>${r.objective_score}</td>
        <td>${r.graded ? '已批阅' : `${r.ungraded_essay} 题待评 / 共 ${r.essay_count} 题`}</td>
        <td>${r.graded ? UI.statusBadge('graded') : UI.statusBadge('submitted')}</td>
        <td><a class="btn small ${r.graded ? 'secondary' : ''}" href="#/grade-detail/${r.attempt_id}">
          ${r.graded ? '查看答卷' : '批阅答卷'}</a></td></tr>`).join('')
        || '<tr><td colspan="7" class="muted">暂无已交卷答卷（缺考考生不生成答卷）</td></tr>'}</tbody></table></div>
      <a class="btn secondary" href="#/grading">返回批阅台</a>`;
  }

  // ---------- 批阅答卷 ----------
  async function gradeDetail(root, params) {
    const attemptId = params[0];
    const view = await Api.get(`/attempts/${attemptId}`);
    const exam = (await Api.get('/exams')).find((e) => e.id === view.exam_id);
    const essays = view.answers.filter((a) => a.type === 'essay');
    const objectives = view.answers.filter((a) => a.type !== 'essay');

    root.innerHTML = `
      <h2 class="page-title">批阅答卷</h2>
      <p class="page-desc">${UI.esc(view.dept_name)} · ${UI.esc(view.real_name)}　|　${exam ? UI.esc(exam.title) : ''}</p>
      <div class="grid grid-4">
        <div class="stat"><div class="num">${view.objective_score || 0}</div><div class="lbl">客观题得分（自动）</div></div>
        <div class="stat"><div class="num" id="subTotal">${essays.reduce((s, a) => s + (a.awarded_score || 0), 0)}</div><div class="lbl">主观题得分</div></div>
        <div class="stat"><div class="num" id="grandTotal">${(view.objective_score || 0) + essays.reduce((s, a) => s + (a.awarded_score || 0), 0)}</div><div class="lbl">预计总分</div></div>
        <div class="stat"><div class="num">${exam ? exam.pass_score : '—'}</div><div class="lbl">合格线</div></div>
      </div>
      <div class="card"><h3>客观题（系统自动判分，仅供核对）</h3>
        ${objectives.map((a, i) => {
          const given = a.response_parsed == null ? '<span class="muted">未作答</span>'
            : (a.type === 'multi' ? (a.response_parsed || []).join('、') : (a.type === 'judge' ? (a.response_parsed ? '正确' : '错误') : UI.esc(a.response_parsed)));
          return `<div class="exam-q"><div class="q-head"><span class="muted">${i + 1}.</span>${UI.qtypeBadge(a.type)}
            <span style="flex:1">${UI.esc(a.stem)} <span class="muted">(${a.max_score}分)</span></span>
            <span class="badge ${a.awarded_score > 0 ? 'green' : 'red'}">${a.awarded_score > 0 ? '正确' : '错误'}</span></div>
            <div>考生作答：${given}</div></div>`;
        }).join('')}</div>
      <div class="card"><h3>✍️ 主观题评分</h3>
        ${essays.map((a, i) => `
          <div class="exam-q" data-eq="${a.eq_id}" data-max="${a.max_score}">
            <div class="q-head"><span class="muted">${i + 1}.</span>${UI.qtypeBadge(a.type)}
              <span style="flex:1">${UI.esc(a.stem)} <span class="muted">(满分 ${a.max_score} 分)</span></span></div>
            <div class="q-feedback pending" style="background:#fafafa"><b>考生作答：</b><br>${UI.esc(a.response_parsed || '（未作答）')}</div>
            <div class="q-feedback right"><b>参考答案要点：</b><br>${UI.esc(a.reference_answer || '—')}</div>
            ${a.grader_comment ? `<div class="q-feedback right"><b>上次批阅意见：</b>${UI.esc(a.grader_comment)}</div>` : ''}
            <div class="row mt10">
              <div class="field" style="max-width:160px"><label>本题得分（0~${a.max_score}）</label>
                <input class="score-input essay-score" type="number" min="0" max="${a.max_score}" step="0.5"
                  value="${a.awarded_score == null ? '' : a.awarded_score}" data-maxv="${a.max_score}" data-eq="${a.eq_id}"></div>
              <div class="field" style="flex:1"><label>批阅意见（可选）</label><input class="essay-comment" value="${UI.esc(a.grader_comment || '')}"></div>
            </div></div>`).join('')}
        <div class="field"><label>总评意见（可选）</label><textarea id="gradeComment">${UI.esc(view.grading_comment || '')}</textarea></div>
        ${view.graded ? '<p class="muted">该答卷已完成批阅与归档。重新提交将更新成绩与档案。</p>' : ''}
        <button class="btn" id="submitGrade" style="padding:9px 24px">${view.graded ? '更新批阅结果' : '提交批阅并归档'}</button>
        ${view.graded ? `<a class="btn secondary" href="#/summary/${view.exam_id}">查看本场汇总</a>` : '<a class="btn ghost" href="#/grade/' + view.exam_id + '">返回列表</a>'}
      </div>`;

    function recalc() {
      let sub = 0;
      root.querySelectorAll('.essay-score').forEach((i) => { sub += Number(i.value || 0); });
      document.getElementById('subTotal').textContent = sub;
      document.getElementById('grandTotal').textContent = (view.objective_score || 0) + sub;
    }
    root.querySelectorAll('.essay-score').forEach((i) => i.oninput = recalc);

    document.getElementById('submitGrade').onclick = () => UI.handler(async () => {
      const scores = {};
      for (const i of root.querySelectorAll('.essay-score')) {
        const v = Number(i.value);
        if (!(v >= 0) || v > Number(i.dataset.maxv)) throw new Error('主观题评分必须在 0 到满分之间');
        const wrap = i.closest('.exam-q');
        const comment = wrap.querySelector('.essay-comment').value;
        scores[i.dataset.eq] = { score: v, comment };
      }
      if (!Object.keys(scores).length) throw new Error('没有需要提交的主观题评分');
      await Api.post(`/attempts/${attemptId}/grade`, { scores, comment: document.getElementById('gradeComment').value });
      UI.toast('批阅完成：总分已计算、培训档案已归档', 'ok');
      location.hash = '#/grade/' + view.exam_id;
    });
  }

  // ---------- 科室考试（列表） ----------
  async function exams(root) {
    const list = await Api.get('/exams');
    root.innerHTML = `<h2 class="page-title">科室考试</h2><p class="page-desc">涉及本科室的三基考试</p>
      <div class="card"><table><thead><tr><th>考试</th><th>岗位</th><th>截止时间</th><th>状态</th><th>操作</th></tr></thead>
      <tbody>${list.map((e) => `<tr><td>${UI.esc(e.title)}</td><td>${UI.jobLabel(e.job_type)}</td>
        <td>${UI.fmtTime(e.end_time)}</td><td>${UI.statusBadge(e.status)}</td>
        <td><a href="#/summary/${e.id}">汇总（仅本科室）</a> · <a href="#/grade/${e.id}">批阅</a></td></tr>`).join('')
        || '<tr><td colspan="5" class="muted">暂无</td></tr>'}</tbody></table></div>`;
  }

  // ---------- 补考名单（本科室） ----------
  async function makeup(root) {
    const rows = await Api.get('/makeup');
    root.innerHTML = `<h2 class="page-title">本科室补考名单</h2>
      <p class="page-desc">可对缺考/不合格人员进行补考通知；补考专场由护理部统一安排</p>
      <div class="card"><table><thead><tr><th>人员</th><th>原考试</th><th>原因</th><th>状态</th><th>操作</th></tr></thead>
      <tbody>${rows.map((m) => `<tr>
        <td>${UI.esc(m.real_name)}（${UI.jobLabel(m.job_type)}）</td><td>${UI.esc(m.exam_title)}</td>
        <td>${UI.statusBadge(m.reason + '_reason')}</td><td>${UI.statusBadge(m.status)}</td>
        <td>${m.status === 'pending' ? `<button class="btn small secondary" data-id="${m.id}">标记已通知</button>` : '—'}</td></tr>`).join('')
        || '<tr><td colspan="5" class="muted">本科室暂无补考人员</td></tr>'}</tbody></table></div>`;
    root.querySelectorAll('button[data-id]').forEach((b) => b.onclick = () => UI.handler(async () => {
      await Api.post(`/makeup/${b.dataset.id}/status`, { status: 'notified' });
      UI.toast('已通知本人', 'ok'); makeup(root);
    }));
  }

  // ---------- 科室档案 ----------
  async function archive(root) {
    const users = await Api.get('/users?role=examinee');
    root.innerHTML = `<h2 class="page-title">科室培训档案</h2>
      <p class="page-desc">点击姓名查看该考生历次三基考试成绩（仅本科室人员）</p>
      <div class="card"><table><thead><tr><th>姓名</th><th>岗位</th><th>操作</th></tr></thead>
      <tbody>${users.map((u) => `<tr><td>${UI.esc(u.real_name)}</td><td>${UI.jobLabel(u.job_type)}</td>
        <td><a href="#/record/${u.id}">查看培训档案</a></td></tr>`).join('')}</tbody></table></div>`;
  }

  async function record(root, params) {
    const d = await Api.get(`/training-records/${params[0]}`);
    root.innerHTML = `<h2 class="page-title">${UI.esc(d.user.real_name)} 的培训档案</h2>
      <p class="page-desc">${UI.jobLabel(d.user.job_type)}</p>
      <div class="grid grid-3">
        <div class="stat"><div class="num">${d.stat.total || 0}</div><div class="lbl">归档考试</div></div>
        <div class="stat ok"><div class="num">${d.stat.pass_count || 0}</div><div class="lbl">合格次数</div></div>
        <div class="stat"><div class="num">${d.stat.avg_score ?? '—'}</div><div class="lbl">平均分</div></div></div>
      <div class="card"><table><thead><tr><th>考试</th><th>成绩</th><th>结果</th><th>归档时间</th></tr></thead>
      <tbody>${d.records.map((r) => `<tr><td>${UI.esc(r.title)}</td><td><b>${r.total_score}</b>（客 ${r.objective_score}/主 ${r.subjective_score}）</td>
        <td>${UI.statusBadge(r.result)}</td><td>${UI.fmtTime(r.archived_at)}</td></tr>`).join('')
        || '<tr><td colspan="4" class="muted">暂无归档</td></tr>'}</tbody></table></div>
      <a class="btn secondary" href="#/archive">返回</a>`;
  }

  return { grading, gradeList, gradeDetail, exams, makeup, archive, record };
})();

window.ViewRegistry = window.ViewRegistry || {};
window.ViewRegistry.dept_teacher = {
  grading: TeacherView.grading,
  grade: TeacherView.gradeList,
  'grade-detail': TeacherView.gradeDetail,
  summary: window.NursingShared.summary,
  exams: TeacherView.exams,
  makeup: TeacherView.makeup,
  archive: TeacherView.archive,
  record: TeacherView.record,
};
