'use strict';
/* 初始化演示数据：node server/src/seed.js --force */
const { getDb } = require('./db');
const { hashPassword } = require('./auth');
const svc = require('./services/examService');

const force = process.argv.includes('--force');
const db = getDb();

const exists = db.prepare('SELECT COUNT(*) c FROM users').get().c;
if (exists && !force) {
  console.log('数据库已有数据，如需重置请使用: npm run seed');
  process.exit(0);
}

const JOB_LABEL = { doctor: '医生', nurse: '护士', technician: '技师' };

const KNOWLEDGE = {
  nurse: ['无菌技术', '生命体征评估', '给药护理', '心肺复苏', '院感防控'],
  doctor: ['心肺复苏', '水电解质紊乱', '抗菌药物合理使用', '常见急症处理', '病历书写规范'],
  technician: ['检验标本采集', '影像质控', '危急值报告', '设备安全操作', '生物安全防护'],
};

// 每个岗位：单选5、多选3、判断3、简答2
const QUESTIONS = {
  nurse: {
    single: [
      ['无菌技术', '无菌持物钳的正确使用方法是？', ['A. 可夹取任何无菌物品', 'B. 到远处夹取物品应速去速回', 'C. 无菌持物钳及容器一般每周消毒一次', 'D. 使用时持物钳端向上'], 'C'],
      ['生命体征评估', '成人正常腋温范围是？', ['A. 35.5~36.0℃', 'B. 36.0~37.0℃', 'C. 37.0~37.5℃', 'D. 37.5~38.0℃'], 'B'],
      ['给药护理', '青霉素注射液需现用现配的主要目的是？', ['A. 防止失效', 'B. 防止污染', 'C. 减少过敏物质产生', 'D. 减轻疼痛'], 'C'],
      ['心肺复苏', '成人心肺复苏胸外按压深度为？', ['A. 3~4cm', 'B. 4~5cm', 'C. 5~6cm', 'D. 至少7cm'], 'C'],
      ['院感防控', '手卫生"七步洗手法"每步揉搓时间至少？', ['A. 5秒', 'B. 10秒', 'C. 15秒', 'D. 30秒'], 'C'],
    ],
    multi: [
      ['无菌技术', '下列属于无菌操作原则的有？', ['A. 无菌区物品疑有污染即更换', 'B. 一份无菌物品仅供一位患者使用', 'C. 操作者身体与无菌区保持一定距离', 'D. 无菌包潮湿后烘干可继续使用'], ['A', 'B', 'C']],
      ['生命体征评估', '影响血压测量值的因素包括？', ['A. 袖带过窄', 'B. 肱动脉低于心脏水平', 'C. 测量前剧烈活动', 'D. 坐位时手臂置于第四肋间'], ['A', 'B', 'C']],
      ['院感防控', '标准预防措施包括？', ['A. 手卫生', 'B. 使用个人防护用品', 'C. 呼吸卫生/咳嗽礼仪', 'D. 患者安置与环境清洁'], ['A', 'B', 'C', 'D']],
    ],
    judge: [
      ['给药护理', '为患者注射两种以上药物时，应先确认无配伍禁忌。', true],
      ['心肺复苏', '心肺复苏按压与通气比为30:2。', true],
      ['院感防控', '摘除手套后可以不进行手卫生。', false],
    ],
    essay: [
      ['心肺复苏', '简述成人心肺复苏的操作要点。', '环境评估、判断意识与呼吸、呼救、胸外按压部位（两乳头连线中点）、深度5~6cm、频率100~120次/分、按压通气比30:2、尽量减少按压中断、尽早电除颤。'],
      ['给药护理', '简述青霉素过敏性休克的抢救配合要点。', '立即停药平卧、就地抢救；首选盐酸肾上腺素皮下/肌注；吸氧、保持呼吸道通畅；遵医嘱使用抗过敏及升压药物；心跳骤停行CPR；记录与密切观察生命体征。'],
    ],
  },
  doctor: {
    single: [
      ['心肺复苏', '成人基础生命支持中，首次电除颤能量（双相波）通常选择？', ['A. 50~100J', 'B. 120~200J', 'C. 300J', 'D. 360J'], 'B'],
      ['水电解质紊乱', '等渗性脱水患者首先应补充的液体是？', ['A. 5%葡萄糖', 'B. 平衡盐溶液', 'C. 10%氯化钠', 'D. 5%碳酸氢钠'], 'B'],
      ['抗菌药物合理使用', '清洁手术（Ⅰ类切口）预防用药通常在何时给药？', ['A. 术前1天', 'B. 术前0.5~1小时', 'C. 术后回病房', 'D. 术后24小时'], 'B'],
      ['常见急症处理', '急性心肌梗死最具诊断价值的早期检查是？', ['A. 心电图动态改变', 'B. 血常规', 'C. 胸部CT', 'D. 腹部B超'], 'A'],
      ['病历书写规范', '入院记录应在患者入院后多长时间内完成？', ['A. 8小时', 'B. 12小时', 'C. 24小时', 'D. 48小时'], 'C'],
    ],
    multi: [
      ['常见急症处理', '过敏性休克的处理包括？', ['A. 立即脱离过敏原', 'B. 肾上腺素肌注', 'C. 快速补液', 'D. 必要时气管插管'], ['A', 'B', 'C', 'D']],
      ['抗菌药物合理使用', '抗菌药物联合应用的指征包括？', ['A. 病因未明的严重感染', 'B. 单一药物不能控制的混合感染', 'C. 需长疗程且易耐药者', 'D. 病毒性上呼吸道感染'], ['A', 'B', 'C']],
      ['病历书写规范', '书写病历应做到？', ['A. 客观真实', 'B. 准确及时', 'C. 完整规范', 'D. 使用自创符号缩写'], ['A', 'B', 'C']],
    ],
    judge: [
      ['心肺复苏', '判断颈动脉搏动时间不应超过10秒。', true],
      ['水电解质紊乱', '低钾血症患者静脉补钾时可直接静脉推注10%氯化钾。', false],
      ['抗菌药物合理使用', '氟喹诺酮类药物可影响软骨发育，18岁以下患者原则上不宜使用。', true],
    ],
    essay: [
      ['常见急症处理', '简述急性左心衰的处理原则。', '坐位双腿下垂、高流量吸氧（必要时酒精湿化）、镇静（吗啡）、快速利尿（呋塞米）、扩血管（硝酸甘油/硝普钠）、强心（西地兰）、平喘及诱因治疗。'],
      ['病历书写规范', '简述首次病程记录应包含的主要内容。', '病例特点、拟诊讨论（诊断依据及鉴别诊断）、诊疗计划，应在入院8小时内完成并由经治医师签名。'],
    ],
  },
  technician: {
    single: [
      ['检验标本采集', '空腹采血通常要求禁食时间为？', ['A. 4小时', 'B. 6小时', 'C. 8~12小时', 'D. 24小时'], 'C'],
      ['影像质控', 'CT检查中减少运动伪影最有效的措施是？', ['A. 增大mAs', 'B. 训练患者屏气配合', 'C. 减小层厚', 'D. 提高窗宽'], 'B'],
      ['危急值报告', '检验科发现危急值后，报告应在多长时间内通知临床？', ['A. 立即', 'B. 30分钟内', 'C. 1小时内', 'D. 当班内'], 'A'],
      ['设备安全操作', '生物安全柜的日常维护不包括？', ['A. 定期检测气流', 'B. 更换高效过滤器', 'C. 紫外消毒', 'D. 在柜内存放私人食品'], 'D'],
      ['生物安全防护', '处理含病原体溅洒物时，消毒剂作用足够时间后应？', ['A. 直接擦干', 'B. 由污染区向清洁区擦拭', 'C. 由清洁区向污染区擦拭并按医废处置', 'D. 自然晾干即可'], 'C'],
    ],
    multi: [
      ['检验标本采集', '导致标本溶血的原因有？', ['A. 穿刺处酒精未干即采血', 'B. 采血后用力震荡', 'C. 注射器与针头连接不紧产生泡沫', 'D. 标本及时送检'], ['A', 'B', 'C']],
      ['危急值报告', '危急值报告登记内容应包括？', ['A. 患者信息与检验结果', 'B. 报告时间', 'C. 报告人与接收人', 'D. 复核情况'], ['A', 'B', 'C', 'D']],
      ['生物安全防护', '下列属于一级防护用品的有？', ['A. 工作服', 'B. 工作帽', 'C. 医用外科口罩', 'D. 正压防护头套'], ['A', 'B', 'C']],
    ],
    judge: [
      ['检验标本采集', '采集血培养标本时应严格执行皮肤消毒与无菌操作。', true],
      ['影像质控', '受检者无需任何防护即可反复接受X线检查。', false],
      ['设备安全操作', '离心机运行中发现异常声响应立即打开盖子检查。', false],
    ],
    essay: [
      ['危急值报告', '简述检验危急值的报告流程。', '复核确认结果→立即电话通知临床并记录→双方复述核对（患者信息、项目、结果）→登记报告时间/报告人/接收人→必要时报告科主任，保留原始记录可追溯。'],
      ['生物安全防护', '简述实验台发生感染性材料溢洒的处置要点。', '人员撤离、设置警示；穿戴手套口罩防护服；用吸附材料覆盖后由外向内倾倒消毒剂，作用30分钟以上；按医废清理；再次消毒并记录暴露情况，必要时医学观察。'],
    ],
  },
};

function offsetMinutes(min) {
  const d = new Date(Date.now() + min * 60000);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

db.transaction(() => {
  if (force) {
    ['training_records', 'makeup_list', 'answers', 'attempts', 'exam_questions', 'exam_roster', 'exam_depts', 'exams', 'questions', 'knowledge_points', 'users', 'departments'].forEach((t) => db.prepare(`DELETE FROM ${t}`).run());
    db.prepare("DELETE FROM sqlite_sequence WHERE name IN ('training_records','makeup_list','answers','attempts','exam_questions','exam_roster','exams','questions','knowledge_points','users','departments')").run();
  }

  // 科室
  const deptNames = ['心内科', '呼吸内科', '普外科', '急诊科', '检验科', '放射科'];
  const deptId = {};
  const insDept = db.prepare('INSERT INTO departments(name) VALUES (?)');
  deptNames.forEach((n) => { deptId[n] = insDept.run(n).lastInsertRowid; });

  // 用户
  const insUser = db.prepare('INSERT INTO users(username,password_hash,salt,real_name,role,job_type,dept_id) VALUES (?,?,?,?,?,?,?)');
  const P = (pwd) => hashPassword(pwd);
  function addUser(username, pwd, realName, role, jobType, dept) {
    const { salt, hash } = P(pwd);
    return insUser.run(username, hash, salt, realName, role, jobType, dept).lastInsertRowid;
  }
  addUser('nursing', 'admin123', '王护长（护理部）', 'nursing_admin', null, null);
  addUser('hospital', 'admin123', '周院长（院级管理员）', 'hospital_admin', null, null);
  addUser('teacher_xnk', 'admin123', '李老师（心内科）', 'dept_teacher', null, deptId['心内科']);
  addUser('teacher_hxk', 'admin123', '张老师（呼吸内科）', 'dept_teacher', null, deptId['呼吸内科']);
  addUser('teacher_jyk', 'admin123', '赵老师（检验科）', 'dept_teacher', null, deptId['检验科']);

  const examinees = [];
  function addExaminee(un, name, jt, dept) {
    examinees.push({ uid: addUser(un, '123456', name, 'examinee', jt, deptId[dept]), username: un, name, jt, dept });
  }
  addExaminee('n1', '护士-刘敏', 'nurse', '心内科');
  addExaminee('n2', '护士-陈静', 'nurse', '心内科');
  addExaminee('n3', '护士-孙悦', 'nurse', '心内科');
  addExaminee('n4', '护士-吴芳', 'nurse', '呼吸内科');
  addExaminee('n5', '护士-郑楠', 'nurse', '呼吸内科');
  addExaminee('d1', '医生-王强', 'doctor', '心内科');
  addExaminee('d2', '医生-林峰', 'doctor', '心内科');
  addExaminee('d3', '医生-赵磊', 'doctor', '普外科');
  addExaminee('t1', '技师-钱进', 'technician', '检验科');
  addExaminee('t2', '技师-孙莉', 'technician', '检验科');
  addExaminee('t3', '技师-周洁', 'technician', '放射科');

  // 知识点
  const kpId = {};
  const insKp = db.prepare('INSERT INTO knowledge_points(job_type,name) VALUES (?,?)');
  for (const [jt, list] of Object.entries(KNOWLEDGE)) {
    kpId[jt] = {};
    list.forEach((name) => { kpId[jt][name] = insKp.run(jt, name).lastInsertRowid; });
  }

  // 题目
  const insQ = db.prepare(`INSERT INTO questions(job_type,type,kp_id,stem,options_json,answer_json,reference_answer,score,created_by)
    VALUES (?,?,?,?,?,?,?,?,?)`);
  for (const [jt, groups] of Object.entries(QUESTIONS)) {
    groups.single.forEach(([kp, stem, options, ans]) =>
      insQ.run(jt, 'single', kpId[jt][kp], stem, JSON.stringify(options), JSON.stringify(ans), null, 2, 1));
    groups.multi.forEach(([kp, stem, options, ans]) =>
      insQ.run(jt, 'multi', kpId[jt][kp], stem, JSON.stringify(options), JSON.stringify(ans), null, 3, 1));
    groups.judge.forEach(([kp, stem, ans]) =>
      insQ.run(jt, 'judge', kpId[jt][kp], stem, null, JSON.stringify(ans), null, 2, 1));
    groups.essay.forEach(([kp, stem, ref]) =>
      insQ.run(jt, 'essay', kpId[jt][kp], stem, null, JSON.stringify(''), ref, 4, 1));
  }
})();

// ---------- 构造考试场景 ----------
const usersByUsername = Object.fromEntries(db.prepare('SELECT * FROM users').all().map((u) => [u.username, u]));
const fakeUser = (u) => ({ id: u.id, role: 'examinee', job_type: u.job_type, dept_id: u.dept_id });
const teacher = { id: usersByUsername['teacher_xnk'].id, role: 'dept_teacher', dept_id: usersByUsername['teacher_xnk'].dept_id };

function examQuestions(id) {
  return db.prepare('SELECT eq.id AS eq_id, eq.type, eq.question_id FROM exam_questions eq WHERE eq.exam_id=? ORDER BY seq').all(id);
}
function responsesFor(examId, perfect) {
  const out = [];
  for (const eq of examQuestions(examId)) {
    const q = db.prepare('SELECT answer_json FROM questions WHERE id=?').get(eq.question_id);
    const correct = JSON.parse(q.answer_json);
    if (eq.type === 'essay') { out.push({ eq_id: eq.eq_id, response: perfect ? '考生按要点完整作答：评估、呼救、按压、通气、早期除颤并持续观察。' : '只记得按压，其他不清楚。' }); continue; }
    if (perfect) { out.push({ eq_id: eq.eq_id, response: correct }); continue; }
    if (eq.type === 'single') out.push({ eq_id: eq.eq_id, response: 'X' });
    else if (eq.type === 'multi') out.push({ eq_id: eq.eq_id, response: [] });
    else out.push({ eq_id: eq.eq_id, response: !correct });
  }
  return out;
}

// 已结束：护理三基（含主观题）
const nurseExamId = svc.createExam({
  title: '2026年9月护理三基理论考试（心内科/呼吸内科）',
  level: 'sanji', job_type: 'nurse',
  dept_ids: [usersByUsername['n1'].dept_id, usersByUsername['n4'].dept_id],
  start_time: offsetMinutes(-120), end_time: offsetMinutes(60), duration_minutes: 30, pass_score: 12,
  composition: [
    { type: 'single', count: 3, score_each: 2 },
    { type: 'multi', count: 2, score_each: 3 },
    { type: 'judge', count: 2, score_each: 2 },
    { type: 'essay', count: 1, score_each: 4 },
  ],
}, usersByUsername['nursing'].id);

function takeAndSubmit(username, perfect) {
  const u = usersByUsername[username];
  svc.startAttempt(nurseExamId, fakeUser(u));
  svc.submitAttempt(nurseExamId, fakeUser(u), responsesFor(nurseExamId, perfect));
}
takeAndSubmit('n1', true);
takeAndSubmit('n2', true);  // 留待科室老师批阅
takeAndSubmit('n3', false);

const attemptId = (un) => db.prepare('SELECT id FROM attempts WHERE exam_id=? AND user_id=?').get(nurseExamId, usersByUsername[un].id).id;
const essayEq = examQuestions(nurseExamId).filter((q) => q.type === 'essay');
svc.gradeAttempt(attemptId('n1'), teacher, { [essayEq[0].eq_id]: 4 }, '要点完整，操作规范');
svc.gradeAttempt(attemptId('n3'), teacher, { [essayEq[0].eq_id]: 1 }, '知识点掌握薄弱，需加强心肺复苏培训');

// 已结束：技师三基（全客观题，自动判分）
const techExamId = svc.createExam({
  title: '2026年9月医技三基理论考试（检验科/放射科）',
  level: 'sanji', job_type: 'technician',
  dept_ids: [usersByUsername['t1'].dept_id, usersByUsername['t3'].dept_id],
  start_time: offsetMinutes(-120), end_time: offsetMinutes(60), duration_minutes: 30, pass_score: 10,
  composition: [
    { type: 'single', count: 3, score_each: 2 },
    { type: 'multi', count: 2, score_each: 3 },
    { type: 'judge', count: 2, score_each: 2 },
  ],
}, usersByUsername['nursing'].id);
function takeTech(username, perfect) {
  const u = usersByUsername[username];
  svc.startAttempt(techExamId, fakeUser(u));
  svc.submitAttempt(techExamId, fakeUser(u), responsesFor(techExamId, perfect));
}
takeTech('t1', true);
takeTech('t2', false);

// 进行中：医生三基（含主观题，尚未交卷）
const doctorExamId = svc.createExam({
  title: '2026年9月医师三基理论考试（心内科/普外科·进行中）',
  level: 'basic', job_type: 'doctor',
  dept_ids: [usersByUsername['d1'].dept_id, usersByUsername['d3'].dept_id],
  start_time: offsetMinutes(-5), end_time: offsetMinutes(60 * 24), duration_minutes: 45, pass_score: 12,
  composition: [
    { type: 'single', count: 3, score_each: 2 },
    { type: 'multi', count: 2, score_each: 3 },
    { type: 'judge', count: 2, score_each: 2 },
    { type: 'essay', count: 1, score_each: 4 },
  ],
}, usersByUsername['nursing'].id);

// 将两场考试回溯为已结束，触发缺考判定与补考名单
db.prepare("UPDATE exams SET start_time=?, end_time=?, status='published' WHERE id IN (?,?)")
  .run(offsetMinutes(-180), offsetMinutes(-10), nurseExamId, techExamId);
svc.closeExam(nurseExamId);
svc.closeExam(techExamId);

// 科室老师已通知一名缺考人员
const notified = db.prepare("SELECT id FROM makeup_list WHERE reason='absent' ORDER BY id LIMIT 1").get();
if (notified) db.prepare("UPDATE makeup_list SET status='notified' WHERE id=?").run(notified.id);

console.log('✅ 演示数据初始化完成');
console.log('账号（护理部/院级/老师密码 admin123，考生密码 123456）：');
console.log('  nursing      护理部管理员（发布考试/维护题库/安排补考）');
console.log('  hospital     院级管理员（仅汇总与薄弱知识点）');
console.log('  teacher_xnk  心内科科室老师（批阅主观题）');
console.log('  n1~n5 护士 / d1~d3 医生 / t1~t3 技师');
console.log(`考试: 护理#${nurseExamId}(已结束) 技师#${techExamId}(已结束) 医生#${doctorExamId}(进行中)`);
