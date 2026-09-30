'use strict';
const HospitalView = (() => {
  // ---------- 全院汇总驾驶舱（只有汇总，没有个人明细） ----------
  async function overview(root) {
    const o = await Api.get('/admin/overview');
    const a = o.agg || {};
    root.innerHTML = `
      <h2 class="page-title">全院三基考试汇总驾驶舱</h2>
      <p class="page-desc">院级视角：仅呈现全院级汇总指标与趋势，不含题库与个人成绩明细；考点级薄弱分析见"薄弱知识点"</p>
      <div class="grid grid-4">
        <div class="stat"><div class="num">${a.exam_count || 0}</div><div class="lbl">已完成批阅考试</div></div>
        <div class="stat"><div class="num">${a.graded_count || 0}</div><div class="lbl">已出分人次</div></div>
        <div class="stat ok"><div class="num">${a.pass_count || 0}</div><div class="lbl">合格人次（均${a.avg_score ?? '—'}分）</div></div>
        <div class="stat warn"><div class="num">${o.pending_makeup}</div><div class="lbl">待处理补考人数</div></div>
      </div>
      <div class="card"><h3>📊 各场次通过率 / 出勤率</h3>${UI.bars(o.exams.map((e) => ({
        label: `[${UI.jobLabel(e.job_type)}] ` + (e.title.length > 15 ? e.title.slice(0, 15) + '…' : e.title),
        value: e.pass_rate ?? 0,
        display: e.pass_rate == null ? '批阅中' : '通过率 ' + e.pass_rate + '%',
        sub: `出勤 ${e.attendance_rate ?? '—'}% · 缺考 ${e.absent}/${e.total} · 合格 ${e.pass}/${e.graded || 0}`,
      })))}</div>
      <div class="card"><h3>📋 全院考试台账（汇总口径）</h3><table><thead><tr>
        <th>考试</th><th>岗位</th><th>状态</th><th>应考</th><th>缺考</th><th>已出分</th><th>合格</th><th>通过率</th><th>出勤率</th></tr></thead>
        <tbody>${o.exams.map((e) => `<tr>
          <td>${UI.esc(e.title)}</td><td>${UI.jobLabel(e.job_type)}</td>
          <td>${UI.statusBadge(e.status)}</td>
          <td>${e.total}</td><td>${e.absent}</td><td>${e.graded}</td><td>${e.pass}</td>
          <td>${e.pass_rate == null ? '—' : e.pass_rate + '%'}</td>
          <td>${e.attendance_rate == null ? '—' : e.attendance_rate + '%'}</td></tr>`).join('')}
        </tbody></table></div>`;
  }

  // ---------- 薄弱知识点（全院口径，可按岗位/科室过滤） ----------
  async function weak(root) {
    const depts = await Api.get('/departments');
    async function render() {
      const jt = document.getElementById('hJob').value;
      const did = document.getElementById('hDept').value;
      const qs = new URLSearchParams();
      if (jt) qs.set('job_type', jt);
      if (did) qs.set('dept_id', did);
      const rows = await Api.get('/analytics/weak-points?' + qs.toString());
      document.getElementById('hChart').innerHTML = UI.bars(rows.map((k) => ({
        label: `[${UI.jobLabel(k.job_type)}] ${k.kp_name}`, value: k.mastery_rate,
        display: '掌握率 ' + k.mastery_rate + '%', sub: k.answer_count + ' 人次 · 人均失分 ' + k.avg_loss,
      })));
    }
    root.innerHTML = `<h2 class="page-title">全院薄弱知识点</h2>
      <p class="page-desc">从知识点维度掌握全院三基培训薄弱环节，为院级培训计划提供依据（不下钻个人成绩）</p>
      <div class="card filter-bar">
        <div class="field"><label>岗位</label><select id="hJob"><option value="">全部岗位</option>
          <option value="nurse">护士</option><option value="doctor">医生</option><option value="technician">技师</option></select></div>
        <div class="field"><label>科室（可选）</label><select id="hDept"><option value="">全院</option>
          ${depts.map((d) => `<option value="${d.id}">${UI.esc(d.name)}</option>`).join('')}</select></div>
        <button class="btn" id="hBtn">分析</button></div>
      <div class="card"><h3>🎯 知识点掌握率排行（薄弱者在前）</h3><div id="hChart">${UI.loading()}</div></div>`;
    document.getElementById('hBtn').onclick = () => UI.handler(render);
    render();
  }

  // ---------- 补考跟踪（只看汇总状态，不做安排） ----------
  async function makeup(root) {
    const rows = await Api.get('/makeup');
    const byReason = { absent: rows.filter((r) => r.reason === 'absent'), fail: rows.filter((r) => r.reason === 'fail') };
    const pending = rows.filter((r) => ['pending', 'notified', 'scheduled'].includes(r.status));
    root.innerHTML = `<h2 class="page-title">补考执行跟踪</h2>
      <p class="page-desc">院级仅跟踪补考闭环执行情况，具体通知与安排由护理部、科室老师完成</p>
      <div class="grid grid-4">
        <div class="stat danger"><div class="num">${byReason.absent.length}</div><div class="lbl">缺考入单</div></div>
        <div class="stat warn"><div class="num">${byReason.fail.length}</div><div class="lbl">不合格入单</div></div>
        <div class="stat"><div class="num">${pending.length}</div><div class="lbl">闭环处理中</div></div>
        <div class="stat ok"><div class="num">${rows.length - pending.length}</div><div class="lbl">已完成/豁免</div></div>
      </div>
      <div class="card"><table><thead><tr><th>科室</th><th>人员</th><th>岗位</th><th>原考试</th><th>原因</th><th>状态</th></tr></thead>
      <tbody>${rows.map((m) => `<tr><td>${UI.esc(m.dept_name)}</td><td>${UI.esc(m.real_name)}</td>
        <td>${UI.jobLabel(m.job_type)}</td><td>${UI.esc(m.exam_title)}</td>
        <td>${UI.statusBadge(m.reason + '_reason')}</td><td>${UI.statusBadge(m.status)}</td></tr>`).join('')
        || '<tr><td colspan="6" class="muted">暂无补考记录</td></tr>'}</tbody></table></div>`;
  }

  return { overview, weak, makeup };
})();

window.ViewRegistry = window.ViewRegistry || {};
window.ViewRegistry.hospital_admin = {
  overview: HospitalView.overview,
  analytics: HospitalView.weak,
  makeup: HospitalView.makeup,
};
