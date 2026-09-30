'use strict';
const ExamineeView = (() => {
  let timerHandle = null;

  // ---------- 我的考试 ----------
  async function exams(root) {
    const list = await Api.get('/exams');
    root.innerHTML = `
      <h2 class="page-title">我的考试</h2>
      <p class="page-desc">仅显示面向你所在科室、与你岗位（${UI.jobLabel(Api.user().job_type)}）匹配的三基考试</p>
      <div class="card"><table>
        <thead><tr><th>考试名称</th><th>时间窗口</th><th>时长</th><th>卷面/合格</th><th>我的状态</th><th>操作</th></tr></thead>
        <tbody>${list.map((e) => {
          const now = new Date().toISOString();
          let action = '';
          if (e.my_attempt && e.my_attempt.graded) action = `<a href="#/result/${e.id}">查看成绩</a>`;
          else if (e.my_attempt && e.my_attempt.submitted_at) action = `<span class="muted">等待主观题批阅</span>`;
          else if (e.my_attempt) action = `<a href="#/take/${e.id}">继续考试</a>`;
          else if (e.status === 'closed' && e.my_status === 'absent') action = `<span class="badge red">缺考·等待补考</span>`;
          else if (e.status === 'published') action = `<a href="#/take/${e.id}"><b>进入考试</b></a>`;
          else action = '<span class="muted">未开始</span>';
          return `<tr>
            <td>${UI.esc(e.title)}<br><span class="pill-note">${UI.jobLabel(e.job_type)} · ${(e.target_depts || []).map((d) => UI.esc(d.name)).join('、')}</span></td>
            <td>${UI.fmtTime(e.start_time)}<br>至 ${UI.fmtTime(e.end_time)}</td>
            <td>${e.duration_minutes} 分钟</td>
            <td>${e.total_score} 分 / ${e.pass_score} 分</td>
            <td>${UI.statusBadge(e.my_status || 'assigned')}</td>
            <td>${action}</td>
          </tr>`;
        }).join('') || '<tr><td colspan="6" class="muted">暂无可参加的考试</td></tr>'}</tbody>
      </table></div>`;
  }

  // ---------- 在线答题 ----------
  async function take(root, params) {
    const examId = params[0];
    await Api.post(`/exams/${examId}/start`).catch((e) => { if (e.status !== 409) throw e; });
    const data = await Api.get(`/exams/${examId}/paper`);
    const answers = {};

    function questionHtml(q, idx) {
      const name = 'q' + q.eq_id;
      let input = '';
      if (q.type === 'single') {
        input = '<div class="opts">' + q.options.map((op) => {
          const v = op[0];
          return `<label><input type="radio" name="${name}" value="${v}"> ${UI.esc(op)}</label>`;
        }).join('') + '</div>';
      } else if (q.type === 'multi') {
        input = '<div class="opts">' + q.options.map((op) => {
          const v = op[0];
          return `<label><input type="checkbox" name="${name}" value="${v}"> ${UI.esc(op)}</label>`;
        }).join('') + '</div>';
      } else if (q.type === 'judge') {
        input = `<div class="opts"><label><input type="radio" name="${name}" value="true"> 正确</label>
          <label><input type="radio" name="${name}" value="false"> 错误</label></div>`;
      } else {
        input = `<textarea name="${name}" placeholder="请输入主观题作答，由科室老师批阅"></textarea>
          <p class="pill-note mt10">📝 参考答案要点（批阅依据）：${UI.esc(q.score)} 分；客观题提交后立即判分</p>`;
      }
      return `<div class="exam-q" data-eq="${q.eq_id}" data-type="${q.type}">
        <div class="q-head"><span class="muted">${idx + 1}.</span> ${UI.qtypeBadge(q.type)}
          <span style="flex:1">${UI.esc(q.stem)}<span class="muted">（${q.score} 分）</span></span></div>
        ${input}</div>`;
    }

    root.innerHTML = `
      <div class="timer" id="examTimer">剩余 --:--</div>
      <h2 class="page-title">${UI.esc(data.exam.title)}</h2>
      <p class="page-desc">满分 ${data.exam.total_score} 分　合格线 ${data.exam.pass_score} 分　限时 ${data.exam.duration_minutes} 分钟，交卷后客观题立即判分，主观题待科室老师批阅</p>
      <form id="paperForm">${data.questions.map(questionHtml).join('')}
        <button class="btn" type="submit" style="padding:10px 28px">确认交卷</button>
        <span class="pill-note">交卷截止：${UI.fmtTime(data.exam.end_time)}</span>
      </form>`;

    // 倒计时（取"开考+时长"与"考试截止"的较早者）
    const start = Date.now();
    const deadlineByDuration = start + data.exam.duration_minutes * 60000;
    const deadlineByWindow = new Date(data.exam.end_time.replace(' ', 'T')).getTime();
    const deadline = Math.min(deadlineByDuration, deadlineByWindow);
    clearInterval(timerHandle);
    timerHandle = setInterval(() => {
      const left = deadline - Date.now();
      const el = document.getElementById('examTimer');
      if (!el) return clearInterval(timerHandle);
      if (left <= 0) { el.textContent = '时间到，正在交卷…'; doSubmit(true); return; }
      const mm = String(Math.floor(left / 60000)).padStart(2, '0');
      const ss = String(Math.floor((left % 60000) / 1000)).padStart(2, '0');
      el.textContent = `剩余 ${mm}:${ss}`;
    }, 500);

    async function doSubmit(auto) {
      const responses = data.questions.map((q) => {
        if (q.type === 'single' || q.type === 'judge') {
          const checked = document.querySelector(`input[name="q${q.eq_id}"]:checked`);
          let response = checked ? checked.value : null;
          if (q.type === 'judge' && response !== null) response = response === 'true';
          return { eq_id: q.eq_id, response };
        }
        if (q.type === 'multi') {
          return { eq_id: q.eq_id, response: [...document.querySelectorAll(`input[name="q${q.eq_id}"]:checked`)].map((i) => i.value) };
        }
        const ta = document.querySelector(`textarea[name="q${q.eq_id}"]`);
        return { eq_id: q.eq_id, response: ta ? ta.value.trim() : '' };
      });
      clearInterval(timerHandle);
      const r = await Api.post(`/exams/${examId}/submit`, { responses });
      UI.toast(auto ? '时间到，已自动交卷' : '交卷成功', 'ok');
      if (r.graded) UI.toast(`客观题判分完成：${r.total_score} 分（${r.result === 'pass' ? '合格' : '不合格'}）`, 'ok');
      else UI.toast('已交卷，主观题等待科室老师批阅', 'ok');
      location.hash = '#/result/' + examId;
    }

    document.getElementById('paperForm').onsubmit = async (e) => {
      e.preventDefault();
      await UI.handler(() => doSubmit(false));
    };
  }

  // ---------- 成绩与批阅反馈 ----------
  async function result(root, params) {
    const examId = params[0];
    const r = await Api.get(`/exams/${examId}/my-result`);
    if (!r.id) {
      root.innerHTML = `<h2 class="page-title">考试状态</h2><div class="card">${UI.statusBadge(r.status)}</div>`;
      return;
    }
    const graded = r.graded;
    root.innerHTML = `
      <h2 class="page-title">成绩详情</h2>
      <p class="page-desc">${UI.esc(r.real_name)} · ${UI.esc(r.dept_name || '')}</p>
      <div class="grid grid-4">
        <div class="stat"><div class="num">${r.total_score == null ? '—' : r.total_score}</div><div class="lbl">总得分</div></div>
        <div class="stat"><div class="num">${r.objective_score || 0}</div><div class="lbl">客观题（自动判分）</div></div>
        <div class="stat"><div class="num">${r.subjective_score ?? '—'}</div><div class="lbl">主观题（老师批阅）</div></div>
        <div class="stat ${r.result === 'pass' ? 'ok' : r.result === 'fail' ? 'danger' : ''}">
          <div class="num">${graded ? (r.result === 'pass' ? '合格' : '不合格') : '批阅中'}</div><div class="lbl">结果</div></div>
      </div>
      ${r.grading_comment ? `<div class="card"><h3>📝 批阅总评</h3><div>${UI.esc(r.grading_comment)}</div></div>` : ''}
      <div class="card"><h3>答题与反馈</h3>${r.answers.map((a, i) => {
        let given = '';
        if (a.response != null) {
          const v = JSON.parse(a.response);
          if (a.type === 'multi') given = (v || []).join('、') || '（未作答）';
          else if (a.type === 'essay') given = UI.esc(v);
          else given = a.type === 'judge' ? (v ? '正确' : '错误') : UI.esc(v);
        } else given = '<span class="muted">未作答</span>';
        let feedback = '';
        if (a.type === 'essay') {
          feedback = graded
            ? `<div class="q-feedback ${a.awarded_score > 0 ? 'right' : 'wrong'}">得分：<b>${a.awarded_score ?? 0}</b> / ${a.max_score} 分
               ${a.grader_comment ? '<br>批阅意见：' + UI.esc(a.grader_comment) : ''}
               <br><span class="muted">参考答案：${UI.esc(a.reference_answer)}</span></div>`
            : `<div class="q-feedback pending">主观题等待科室老师批阅中…</div>`;
        } else {
          const right = a.awarded_score > 0;
          feedback = `<div class="q-feedback ${right ? 'right' : 'wrong'}">${right ? '✔ 回答正确' : '✘ 回答错误'}，得分 ${a.awarded_score} / ${a.max_score} 分</div>`;
        }
        return `<div class="exam-q"><div class="q-head"><span class="muted">${i + 1}.</span>${UI.qtypeBadge(a.type)}
          <span style="flex:1">${UI.esc(a.stem)}</span></div>
          <div>你的作答：${given}</div>${feedback}</div>`;
      }).join('')}</div>
      <a class="btn secondary" href="#/exams">返回考试列表</a>`;
  }

  // ---------- 我的补考 ----------
  async function makeup(root) {
    const rows = await Api.get('/makeup');
    root.innerHTML = `
      <h2 class="page-title">我的补考名单</h2>
      <p class="page-desc">缺考或成绩不合格的场次将自动进入补考名单，由护理部安排补考专场</p>
      <div class="card"><table><thead><tr><th>原考试</th><th>原因</th><th>状态</th><th>补考专场</th><th>登记时间</th></tr></thead>
      <tbody>${rows.map((m) => `<tr>
        <td>${UI.esc(m.exam_title)}</td>
        <td>${UI.statusBadge(m.reason + '_reason')}</td>
        <td>${UI.statusBadge(m.status)}</td>
        <td>${m.makeup_exam_title ? UI.esc(m.makeup_exam_title) : '<span class="muted">待安排</span>'}</td>
        <td>${UI.fmtTime(m.created_at)}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">你目前没有补考记录</td></tr>'}</tbody></table></div>`;
  }

  // ---------- 培训档案 ----------
  async function archive(root) {
    const u = Api.user();
    const d = await Api.get(`/training-records/${u.id}`);
    root.innerHTML = `
      <h2 class="page-title">我的培训档案</h2>
      <p class="page-desc">考试成绩（含补考合格成绩）计入个人培训档案，作为岗位培训与考核依据</p>
      <div class="grid grid-3">
        <div class="stat"><div class="num">${d.stat.total || 0}</div><div class="lbl">归档考试数</div></div>
        <div class="stat ok"><div class="num">${d.stat.pass_count || 0}</div><div class="lbl">合格次数</div></div>
        <div class="stat"><div class="num">${d.stat.avg_score ?? '—'}</div><div class="lbl">平均分</div></div>
      </div>
      <div class="card"><table><thead><tr><th>考试名称</th><th>类别</th><th>成绩</th><th>结果</th><th>归档时间</th></tr></thead>
      <tbody>${d.records.map((r) => `<tr>
        <td>${UI.esc(r.title)}</td><td>${UI.jobLabel(r.job_type)}</td>
        <td><b>${r.total_score}</b>（客观 ${r.objective_score} + 主观 ${r.subjective_score}）</td>
        <td>${UI.statusBadge(r.result)}</td><td>${UI.fmtTime(r.archived_at)}</td></tr>`).join('')
        || '<tr><td colspan="5" class="muted">暂无归档记录（考试结束并完成批阅后自动归档）</td></tr>'}</tbody></table></div>`;
  }

  return { exams, take, result, makeup, archive };
})();

window.ViewRegistry = window.ViewRegistry || {};
window.ViewRegistry.examinee = {
  exams: ExamineeView.exams, take: ExamineeView.take, result: ExamineeView.result,
  makeup: ExamineeView.makeup, archive: ExamineeView.archive,
};
