'use strict';
const NursingView = (() => {
  // ---------- 工作概览 ----------
  async function dashboard(root) {
    const [exams, makeup, kps] = await Promise.all([Api.get('/exams'), Api.get('/makeup'), Api.get('/analytics/weak-points')]);
    const active = exams.filter((e) => e.status === 'published').length;
    const absentCnt = makeup.filter((m) => m.reason === 'absent' && ['pending', 'notified'].includes(m.status)).length;
    const failCnt = makeup.filter((m) => m.reason === 'fail' && ['pending', 'notified'].includes(m.status)).length;
    root.innerHTML = `
      <h2 class="page-title">护理部工作概览</h2>
      <p class="page-desc">全院三基考试发布、批阅进度、补考闭环与培训薄弱环节总览</p>
      <div class="grid grid-4">
        <div class="stat"><div class="num">${exams.length}</div><div class="lbl">累计发布考试</div></div>
        <div class="stat"><div class="num">${active}</div><div class="lbl">进行中考试</div></div>
        <div class="stat danger"><div class="num">${absentCnt}</div><div class="lbl">缺考待补考</div></div>
        <div class="stat warn"><div class="num">${failCnt}</div><div class="lbl">不合格待补考</div></div>
      </div>
      <div class="grid grid-2">
        <div class="card"><h3>📈 近期考试通过率 / 出勤率</h3>${UI.bars(exams.slice(0, 8).map((e) => {
          const [a] = [0];
          const graded = e.roster_count;
          return { label: e.title.length > 16 ? e.title.slice(0, 16) + '…' : e.title,
            value: e.pass_rate ?? 0, display: (e.pass_rate == null ? '批阅中' : '通过率' + e.pass_rate + '%'),
            sub: '出勤率 ' + (e.attendance_rate == null ? '—' : e.attendance_rate + '%') };
        }))}</div>
        <div class="card"><h3>🎯 最薄弱知识点 TOP6（得分率升序）</h3>${UI.bars(kps.slice(0, 6).map((k) => ({
          label: `[${UI.jobLabel(k.job_type)}] ${k.kp_name}`, value: k.mastery_rate,
          display: '掌握率 ' + k.mastery_rate + '%', sub: k.answer_count + ' 人次作答 · 人均失分 ' + k.avg_loss + ' 分',
        })))}</div>
      </div>
      <div class="card"><h3>考试列表</h3><a class="btn small" href="#/create">➕ 发布新考试</a>
        ${await examTableHtml(exams)}</div>`;
  }

  async function examTableHtml(exams) {
    return `<table class="mt10"><thead><tr><th>考试</th><th>岗位</th><th>面向科室</th><th>时间</th><th>状态</th><th>操作</th></tr></thead>
      <tbody>${exams.map((e) => `<tr>
        <td>${UI.esc(e.title)}</td><td>${UI.jobLabel(e.job_type)}</td>
        <td>${(e.target_depts || []).map((d) => UI.esc(d.name)).join('、')}</td>
        <td>${UI.fmtTime(e.start_time)}<br><span class="muted">至 ${UI.fmtTime(e.end_time)}</span></td>
        <td>${UI.statusBadge(e.status)}<br><span class="pill-note">名册 ${e.roster_count} 人</span></td>
        <td>
          <a class="btn small secondary" href="#/summary/${e.id}">汇总</a>
          ${e.status === 'published' ? `<button class="btn small ghost" data-close="${e.id}">提前截止</button>` : ''}
        </td></tr>`).join('') || '<tr><td colspan="6" class="muted">暂无考试</td></tr>'}</tbody></table>`;
  }

  // ---------- 考试管理 ----------
  async function exams(root) {
    const exams = await Api.get('/exams');
    root.innerHTML = `<h2 class="page-title">考试管理</h2>
      <p class="page-desc">按科室与岗位发布三基考试；考试截止后未交卷者自动判定缺考</p>
      <div class="card"><a class="btn" href="#/create">➕ 发布新考试</a>${await examTableHtml(exams)}</div>`;
    root.querySelectorAll('[data-close]').forEach((b) => b.onclick = () => UI.handler(async () => {
      if (!confirm('确定提前截止该考试？截止后所有未交卷考生将被记为缺考并进入补考名单。')) return;
      await Api.post(`/exams/${b.dataset.close}/close`);
      UI.toast('考试已截止，缺考名单已生成', 'ok');
      exams(root);
    }));
  }

  // ---------- 考试汇总明细 ----------
  async function summary(root, params) {
    const examId = params[0];
    const [s, kps] = await Promise.all([
      Api.get(`/exams/${examId}/summary`),
      Api.get(`/analytics/weak-points?exam_id=${examId}`),
    ]);
    const c = s.counts;
    root.innerHTML = `
      <h2 class="page-title">${UI.esc(s.exam.title)}</h2>
      <p class="page-desc">${UI.jobLabel(s.exam.job_type)} 岗位 · 满分 ${s.exam.total_score} · 合格线 ${s.exam.pass_score} · ${UI.fmtTime(s.exam.start_time)} 至 ${UI.fmtTime(s.exam.end_time)}</p>
      <div class="grid grid-4">
        <div class="stat"><div class="num">${c.total}</div><div class="lbl">应考人数（出勤率 ${c.attendance_rate ?? '—'}%）</div></div>
        <div class="stat danger"><div class="num">${c.absent}</div><div class="lbl">缺考（自动入补考）</div></div>
        <div class="stat warn"><div class="num">${c.pending_grade}</div><div class="lbl">主观题待批阅</div></div>
        <div class="stat ok"><div class="num">${c.pass_rate ?? '—'}%</div><div class="lbl">合格率（${c.pass}/${c.graded}，均分 ${c.avg_score ?? '—'}）</div></div>
      </div>
      <div class="card"><h3>🎯 本场考试薄弱知识点</h3>${UI.bars(kps.map((k) => ({
        label: k.kp_name, value: k.mastery_rate, display: '掌握率 ' + k.mastery_rate + '%', sub: k.answer_count + ' 人次作答',
      })))}</div>
      <div class="card"><h3>考生成绩明细</h3><table><thead><tr>
        <th>科室</th><th>姓名</th><th>状态</th><th>客观分</th><th>主观分</th><th>总分</th><th>结果</th><th>操作</th></tr></thead>
        <tbody>${s.roster.map((r) => `<tr>
          <td>${UI.esc(r.dept_name || '—')}</td><td>${UI.esc(r.real_name)}</td>
          <td>${UI.statusBadge(r.status)}</td>
          <td>${r.objective_score == null ? '—' : r.objective_score}</td>
          <td>${r.subjective_score == null ? '—' : r.subjective_score}</td>
          <td>${r.total_score == null ? '—' : '<b>' + r.total_score + '</b>'}</td>
          <td>${r.result ? UI.statusBadge(r.result) : '—'}</td>
          <td>${r.status === 'submitted' || r.status === 'graded'
            ? `<a class="btn small secondary" href="#/grade/${examId}">批阅/查看</a>` : '—'}</td>
        </tr>`).join('')}</tbody></table></div>
      <a class="btn secondary" href="#/exams">返回列表</a>`;
  }

  return { dashboard, exams, summary, examTableHtml };
})();

window.NursingShared = { summary: NursingView.summary };
var NursingShared = window.NursingShared;
window.ViewRegistry = window.ViewRegistry || {};
window.ViewRegistry.nursing_admin = {
  dashboard: NursingView.dashboard,
  exams: NursingView.exams,
  summary: NursingView.summary,
};
