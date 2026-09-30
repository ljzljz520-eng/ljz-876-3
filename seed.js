/**
 * 三基考试管理系统 —— 种子数据
 * 运行: node seed.js  (会重置 data/db.json)
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const hashPw = (p) => crypto.createHash('sha256').update('sanji::' + p).digest('hex');

const now = Date.now();
const ISO = (offsetMs) => new Date(now + offsetMs).toISOString();
const D = (n) => n * 24 * 3600 * 1000;

const password = hashPw('123456');

/* ---------- 用户 ---------- */
const users = [
  { id: 'u-admin', username: 'admin', name: '院级管理员', role: 'admin', post: null, dept: '医务处', password },
  { id: 'u-hulibu', username: 'hulibu', name: '王主任', role: 'nursing', post: null, dept: '护理部', password },
  // 科室老师
  { id: 't-neike', username: 'teacher_nei', name: '陈建华', role: 'teacher', post: 'doctor', dept: '内科', password },
  { id: 't-waike', username: 'teacher_wai', name: '刘建军', role: 'teacher', post: 'doctor', dept: '外科', password },
  { id: 't-huli', username: 'teacher_hu', name: '林雅琴', role: 'teacher', post: 'nurse', dept: '护理部', password },
  { id: 't-jishu', username: 'teacher_ji', name: '赵德海', role: 'teacher', post: 'technician', dept: '医技科', password },
  // 护士
  { id: 'e-wangxue', username: 'wangxue', name: '王雪', role: 'examinee', post: 'nurse', dept: '内科', password },
  { id: 'e-lina', username: 'lina', name: '李娜', role: 'examinee', post: 'nurse', dept: '外科', password },
  { id: 'e-liuting', username: 'liuting', name: '刘婷', role: 'examinee', post: 'nurse', dept: '急诊科', password },
  { id: 'e-zhaomin', username: 'zhaomin', name: '赵敏', role: 'examinee', post: 'nurse', dept: '内科', password },
  { id: 'e-chenxi', username: 'chenxi', name: '陈曦', role: 'examinee', post: 'nurse', dept: '外科', password },
  { id: 'e-sunli', username: 'sunli', name: '孙丽', role: 'examinee', post: 'nurse', dept: '急诊科', password },
  { id: 'e-zhoujing', username: 'zhoujing', name: '周静', role: 'examinee', post: 'nurse', dept: '儿科', password },
  { id: 'e-wufang', username: 'wufang', name: '吴芳', role: 'examinee', post: 'nurse', dept: '儿科', password },
  { id: 'e-zhengli', username: 'zhengli', name: '郑丽', role: 'examinee', post: 'nurse', dept: '妇产科', password },
  // 医生
  { id: 'e-zhangqiang', username: 'zhangqiang', name: '张强', role: 'examinee', post: 'doctor', dept: '内科', password },
  { id: 'e-haolei', username: 'haolei', name: '郝磊', role: 'examinee', post: 'doctor', dept: '外科', password },
  { id: 'e-malin', username: 'malin', name: '马琳', role: 'examinee', post: 'doctor', dept: '急诊科', password },
  // 技师
  { id: 'e-sunyao', username: 'sunyao', name: '孙瑶', role: 'examinee', post: 'technician', dept: '检验科', password },
  { id: 'e-hujun', username: 'hujun', name: '胡军', role: 'examinee', post: 'technician', dept: '放射科', password },
];

/* ---------- 题库（按岗位）----------
   type: single 单选 / multi 多选 / judge 判断 / blank 填空 / short 简答 / essay 论述
   answer: 客观题标准答案；主观题含 reference 参考要点
*/
const questions = [
  /* ===== 护士 ===== */
  { id: 'q-n1', post: 'nurse', type: 'single', score: 5, stem: '为昏迷患者进行口腔护理时，下列操作正确的是？',
    options: ['协助患者漱口后再擦拭', '使用开口器时从门齿处放入', '血管钳夹紧棉球，每次一个，挤出多余液体', '协助患者取平卧位头偏向对侧'],
    answer: 'C', kp: '基础护理学-口腔护理', status: 'active' },
  { id: 'q-n2', post: 'nurse', type: 'single', score: 5, stem: '成人心肺复苏时，胸外心脏按压的正确频率为？',
    options: ['60~80次/分', '80~100次/分', '100~120次/分', '120~140次/分'],
    answer: 'C', kp: '急救护理学-心肺复苏', status: 'active' },
  { id: 'q-n3', post: 'nurse', type: 'multi', score: 10, stem: '无菌技术操作中，下列哪些属于无菌区域污染？',
    options: ['无菌持物钳触及容器口边缘', '无菌包受潮后继续使用', '操作者手臂跨越无菌区上方', '无菌手套破损后立即更换并重新操作'],
    answer: 'ABC', kp: '基础护理学-无菌技术', status: 'active' },
  { id: 'q-n4', post: 'nurse', type: 'judge', score: 5, stem: '静脉输液时茂菲滴管内液面过低，可挤压滴管上端输液管使液体流入滴管。',
    options: ['正确', '错误'], answer: 'B', kp: '基础护理学-静脉输液', status: 'active' },
  { id: 'q-n5', post: 'nurse', type: 'blank', score: 10, stem: '成人肌内注射常选用的部位是____；长期注射者应____更换注射部位。（每空5分）',
    blanks: 2, answer: ['臀大肌', '交替'], kp: '基础护理学-注射技术', status: 'active' },
  { id: 'q-n6', post: 'nurse', type: 'short', score: 25, stem: '简述青霉素过敏性休克的抢救要点。',
    reference: '①立即停药、平卧、就地抢救，报告医生；②首选0.1%盐酸肾上腺素皮下/静脉注射；③给予氧气吸入，必要时气管切开；④抗过敏：地塞米松/氢化可的松静脉给药；⑤扩容、纠正酸中毒，使用升压药；⑥心跳呼吸骤停行心肺复苏；⑦密切观察生命体征、尿量并记录。',
    kp: '急救护理学-过敏性休克', status: 'active' },
  { id: 'q-n7', post: 'nurse', type: 'essay', score: 40, stem: '试述护理分级（特级、一级、二级、三级护理）的适用对象及巡视要求，并结合临床说明护理分级管理对患者安全的意义。',
    reference: '特级：病情危重随时需抢救者，安排专人24h护理；一级：病情趋向稳定的重症患者、大手术后等，每1h巡视一次；二级：病情稳定仍需卧床者，每2h巡视一次；三级：生活基本自理者，每3h巡视一次。意义：合理配置护理人力、及早发现病情变化、落实基础护理与安全管理、提高护理质量。',
    kp: '护理管理学-分级护理', status: 'active' },

  /* ===== 医生 ===== */
  { id: 'q-d1', post: 'doctor', type: 'single', score: 5, stem: '成人高血压的诊断标准（非同日3次测量）为？',
    options: ['收缩压≥130mmHg和/或舒张压≥85mmHg', '收缩压≥140mmHg和/或舒张压≥90mmHg', '收缩压≥150mmHg和/或舒张压≥95mmHg', '收缩压≥160mmHg和/或舒张压≥100mmHg'],
    answer: 'B', kp: '内科学-高血压', status: 'active' },
  { id: 'q-d2', post: 'doctor', type: 'single', score: 5, stem: '急性心肌梗死最具诊断价值的心电图改变是？',
    options: ['T波高尖', 'ST段弓背向上抬高伴病理性Q波', 'QT间期延长', '窦性心动过速'],
    answer: 'B', kp: '内科学-冠心病', status: 'active' },
  { id: 'q-d3', post: 'doctor', type: 'multi', score: 10, stem: '下列哪些是糖尿病的慢性并发症？',
    options: ['糖尿病肾病', '糖尿病视网膜病变', '糖尿病酮症酸中毒', '周围神经病变'],
    answer: 'ABD', kp: '内科学-糖尿病', status: 'active' },
  { id: 'q-d4', post: 'doctor', type: 'judge', score: 5, stem: '外科手消毒后，双手应保持指尖朝上、肘部朝下，使水由指尖流向肘部。',
    options: ['正确', '错误'], answer: 'B', kp: '外科学-无菌术', status: 'active' },
  { id: 'q-d5', post: 'doctor', type: 'blank', score: 10, stem: '休克患者微循环障碍的本质是组织____灌注不足；临床判断休克最简便的指标之一是____量。（每空5分）',
    blanks: 2, answer: ['血液（有效循环）', '尿'], kp: '外科学-外科休克', status: 'active' },
  { id: 'q-d6', post: 'doctor', type: 'short', score: 25, stem: '简述心力衰竭的常见诱因。',
    reference: '①感染（呼吸道感染最常见）；②心律失常（房颤最常见）；③血容量增加，如输液过多过快、摄盐过多；④过度体力劳累或情绪激动；⑤治疗不当，如不恰当停用洋地黄或降压药；⑥原有心脏病变加重或并发其他疾病（贫血、肺栓塞、甲亢等）。',
    kp: '内科学-心力衰竭', status: 'active' },
  { id: 'q-d7', post: 'doctor', type: 'essay', score: 40, stem: '试述急腹症的鉴别诊断思路（内科、外科、妇科急腹症）及处理原则。',
    reference: '外科急腹症多起病急、腹痛先于发热呕吐、腹膜刺激征明显、腹痛部位固定；内科急腹症腹痛多无明确定位、常伴发热等前驱症状、腹膜刺激征轻或无；妇科急腹症多见于育龄女性，与月经、阴道出血、停经史相关（宫外孕破裂、卵巢囊肿蒂扭转、盆腔炎）。处理原则：快速评估生命体征，边抢救边检查；禁食、胃肠减压、补液抗休克、合理使用抗生素；诊断未明禁用强烈镇痛剂与泻药；有手术指征及时手术探查。',
    kp: '外科学-急腹症', status: 'active' },

  /* ===== 技师 ===== */
  { id: 'q-t1', post: 'technician', type: 'single', score: 5, stem: '静脉采血时，真空采血管的正确采血顺序（先→后）是？',
    options: ['红帽→蓝帽→紫帽', '蓝帽→红帽→紫帽', '血培养瓶→蓝帽(凝血管)→红帽(血清管)→紫帽(EDTA)', '紫帽→红帽→蓝帽'],
    answer: 'C', kp: '检验基础-静脉采血', status: 'active' },
  { id: 'q-t2', post: 'technician', type: 'single', score: 5, stem: '成年人进行胸部后前位X线摄影时，合适的管电压通常为？',
    options: ['40~50kV', '60~70kV', '100~125kV', '150kV以上'],
    answer: 'C', kp: '放射技术-X线摄影', status: 'active' },
  { id: 'q-t3', post: 'technician', type: 'multi', score: 10, stem: '下列属于医学检验危急值的有？',
    options: ['血钾 6.8 mmol/L', '血糖 2.2 mmol/L', '血红蛋白 130 g/L', '血气pH 7.10'],
    answer: 'ABD', kp: '检验管理-危急值报告', status: 'active' },
  { id: 'q-t4', post: 'technician', type: 'judge', score: 5, stem: 'CT增强检查使用碘对比剂前，应常规询问患者过敏史并评估肾功能。',
    options: ['正确', '错误'], answer: 'A', kp: '放射技术-对比剂安全', status: 'active' },
  { id: 'q-t5', post: 'technician', type: 'blank', score: 10, stem: '尿液常规标本应在采集后____小时内完成检验；血培养标本应在患者使用____之前采集。（每空5分）',
    blanks: 2, answer: ['2（两）', '抗菌药物（抗生素）'], kp: '检验基础-标本管理', status: 'active' },
  { id: 'q-t6', post: 'technician', type: 'short', score: 25, stem: '简述碘对比剂不良反应的预防措施。',
    reference: '①检查前询问过敏史、哮喘史，评估肾功能（eGFR）；②高危患者使用等渗对比剂、减少用量、必要时预防性用药；③检查前后充分水化；④备齐抢救药品与设备，注射过程中及检查后留观30分钟；⑤向患者说明注意事项并签署知情同意书。',
    kp: '放射技术-对比剂安全', status: 'active' },
  { id: 'q-t7', post: 'technician', type: 'essay', score: 40, stem: '试述检验前（分析前）阶段质量控制的主要环节及对检验结果准确性的意义。',
    reference: '环节：检验申请（项目合理、信息准确）、患者准备（饮食、运动、药物、生理节律、采血体位）、标本采集（时间、部位、容器、采血量、顺序、止血带时间）、标本运送与接收（时效、避光、温度、防震、信息核对）、标本处理与保存（离心、拒收不合格标本）。意义：分析前误差占检验全过程误差约60%~70%，直接影响结果真实性，可误导临床诊断与治疗；规范化分析前管理是保证检验质量、保障医疗安全的基础。',
    kp: '检验管理-分析前质控', status: 'active' },
];

/* ---------- 考试 ---------- */
const exams = [
  {
    id: 'ex-2026q2',
    title: '2026年第二季度三基理论考试',
    intro: '覆盖基础理论、基本知识与基本技能，满分100分，60分合格。成绩计入个人培训档案。',
    posts: ['nurse', 'doctor', 'technician'],
    deptScope: 'all',
    status: 'closed',
    startTime: ISO(D(-20)),
    endTime: ISO(D(-18)),
    durationMin: 60,
    passScore: 60,
    credits: 2,
    createdBy: 'u-hulibu',
    createdAt: ISO(D(-25)),
    publishedAt: ISO(D(-24)),
    closedAt: ISO(D(-17)),
  },
  {
    id: 'ex-makeup-q2',
    title: '2026年第二季度三基考试·补考',
    intro: '面向第二季度三基考试缺考及不合格人员，请准时参加。',
    posts: ['nurse', 'doctor', 'technician'],
    deptScope: 'all',
    status: 'published',
    startTime: ISO(D(3)),
    endTime: ISO(D(5)),
    durationMin: 60,
    passScore: 60,
    credits: 1,
    createdBy: 'u-hulibu',
    createdAt: ISO(D(-15)),
    publishedAt: ISO(D(-14)),
    closedAt: null,
    sourceExamId: 'ex-2026q2',
  },
  {
    id: 'ex-emergency',
    title: '急诊急救护理专项考试',
    intro: '急诊相关科室护士专项考核，重点考查急救护理知识与技能。',
    posts: ['nurse'],
    deptScope: ['急诊科'],
    status: 'published',
    startTime: ISO(D(2)),
    endTime: ISO(D(4)),
    durationMin: 45,
    passScore: 60,
    credits: 1.5,
    createdBy: 'u-hulibu',
    createdAt: ISO(D(-6)),
    publishedAt: ISO(D(-5)),
    closedAt: null,
  },
  {
    id: 'ex-draft',
    title: '2026年度三基基本技能操作考核（拟）',
    intro: '草稿：拟于第四季度组织全院技能操作考核。',
    posts: ['nurse', 'doctor', 'technician'],
    deptScope: 'all',
    status: 'draft',
    startTime: ISO(D(30)),
    endTime: ISO(D(32)),
    durationMin: 90,
    passScore: 70,
    credits: 3,
    createdBy: 'u-hulibu',
    createdAt: ISO(D(-1)),
    publishedAt: null,
    closedAt: null,
  },
];

/* ---------- 已结考试的作答记录 ---------- */
// 客观题判分
const norm = (s) => String(s == null ? '' : s).replace(/[\s，。、；;.]/g, '').toLowerCase();
function objective(q, ans) {
  if (q.type === 'single' || q.type === 'judge')
    return norm(ans) === norm(q.answer) ? q.score : 0;
  if (q.type === 'multi')
    return norm((ans || '').split('').sort().join('')) === norm(q.answer.split('').sort().join('')) ? q.score : 0;
  if (q.type === 'blank') {
    const a = Array.isArray(ans) ? ans : [];
    let get = 0;
    q.answer.forEach((x, i) => { if (norm(a[i]) === norm(x)) get += q.score / q.answer.length; });
    return Math.round(get * 100) / 100;
  }
  return 0;
}
const byId = Object.fromEntries(questions.map((q) => [q.id, q]));
function buildAttempt(opt) {
  const { id, userId, examId, post, answers = {}, status, subAt, gradedBy, gradedAt, subjScores, comment } = opt;
  const postQs = questions.filter((q) => q.post === post);
  const items = postQs.map((q) => {
    const given = answers[q.id];
    if (['single', 'multi', 'judge', 'blank'].includes(q.type)) {
      const score = objective(q, given);
      return { qid: q.id, type: q.type, kp: q.kp, given: given == null ? null : given, awarded: score, max: q.score, objective: true, correct: score >= q.score };
    }
    return { qid: q.id, type: q.type, kp: q.kp, given: given || '', awarded: subjScores?.[q.id] ?? null, max: q.score, objective: false };
  });
  const total = Math.round(items.reduce((s, i) => s + (i.awarded || 0), 0) * 100) / 100;
  const done = items.every((i) => i.awarded !== null && i.awarded !== undefined);
  return {
    id, userId, examId, post,
    status: status === 'absent' ? 'absent' : (done ? 'graded' : 'submitted'),
    startedAt: subAt ? new Date(new Date(subAt).getTime() - 40 * 60000).toISOString() : null,
    submittedAt: subAt || null,
    gradedBy: done ? gradedBy : null,
    gradedAt: done ? gradedAt : null,
    comment: comment || '',
    items,
    objectiveTotal: Math.round(items.filter((i) => i.objective).reduce((s, i) => s + (i.awarded || 0), 0) * 100) / 100,
    total,
  };
}

const exam1 = 'ex-2026q2';
const gradeTime = ISO(D(-17) + 3600000);
const attempts = [
  // 护士
  buildAttempt({ id: 'a-1', userId: 'e-wangxue', examId: exam1, post: 'nurse', status: 'graded', subAt: ISO(D(-19)),
    gradedBy: 't-huli', gradedAt: gradeTime,
    answers: { 'q-n1': 'C', 'q-n2': 'C', 'q-n3': 'ABC', 'q-n4': 'B', 'q-n5': ['臀大肌', '交替'],
      'q-n6': '立即停药平卧，皮下注射肾上腺素，给氧，抗过敏，扩容，心肺复苏，观察记录。',
      'q-n7': '特级24h专人守护，一级每1h巡视，二级每2h，三级每3h。分级护理可以合理分配护士，及时发现病情，保障安全。' },
    subjScores: { 'q-n6': 22, 'q-n7': 30 } }),
  buildAttempt({ id: 'a-2', userId: 'e-lina', examId: exam1, post: 'nurse', status: 'graded', subAt: ISO(D(-19)),
    gradedBy: 't-huli', gradedAt: gradeTime,
    answers: { 'q-n1': 'A', 'q-n2': 'C', 'q-n3': 'AB', 'q-n4': 'B', 'q-n5': ['臀大肌', '轮流'],
      'q-n6': '先停药，打肾上腺素，吸氧，送抢救室。',
      'q-n7': '特级护理最重，一级护理一小时看一次，二级二级时看一次，三级病人自己能活动。' },
    subjScores: { 'q-n6': 10, 'q-n7': 20 }, comment: '要点不全，分级护理巡视时间需再记牢。' }),
  buildAttempt({ id: 'a-3', userId: 'e-zhangqiang', examId: exam1, post: 'doctor', status: 'graded', subAt: ISO(D(-19)),
    gradedBy: 't-neike', gradedAt: gradeTime,
    answers: { 'q-d1': 'B', 'q-d2': 'B', 'q-d3': 'ABD', 'q-d4': 'B', 'q-d5': ['血液', '尿'],
      'q-d6': '感染、心律失常、血容量增加、劳累激动、治疗不当、原有心脏病加重。',
      'q-d7': '外科腹痛剧烈、有腹膜炎体征；内科腹痛较轻、先发热；妇科问月经史。处理：抗休克、禁食、必要时手术，未明确诊断前不用强镇痛剂。' },
    subjScores: { 'q-d6': 23, 'q-d7': 35 } }),
  buildAttempt({ id: 'a-4', userId: 'e-liuting', examId: exam1, post: 'nurse', status: 'graded', subAt: ISO(D(-19)),
    gradedBy: 't-huli', gradedAt: gradeTime,
    answers: { 'q-n1': 'C', 'q-n2': 'B', 'q-n3': 'ABC', 'q-n4': 'A', 'q-n5': ['臀中肌', '交替'],
      'q-n6': '立即停药平卧就地抢救，肾上腺素注射，吸氧，激素抗过敏，补液升压，必要时心肺复苏，记录病情。',
      'q-n7': '特级：专人24小时；一级：每小时巡视，用于重症和术后；二级：每2小时，病情稳定需卧床；三级：每3小时，基本自理。意义：优化人力配置、及时发现病情变化、保证护理安全。' },
    subjScores: { 'q-n6': 24, 'q-n7': 38 } }),
  // 已提交，待科室老师批阅（主观题）
  buildAttempt({ id: 'a-5', userId: 'e-zhaomin', examId: exam1, post: 'nurse', status: 'submitted', subAt: ISO(D(-18)),
    answers: { 'q-n1': 'C', 'q-n2': 'C', 'q-n3': 'AC', 'q-n4': 'B', 'q-n5': ['臀大肌', '交替'],
      'q-n6': '停药平卧，注射肾上腺素，吸氧，用抗过敏药，心跳停了就按压，观察生命体征。',
      'q-n7': '特级护理最严重的病人；一级护理一小时巡视；二级两小时；三级三小时。分级护理对安全很重要。' } }),
  buildAttempt({ id: 'a-6', userId: 'e-zhoujing', examId: exam1, post: 'nurse', status: 'graded', subAt: ISO(D(-19)),
    gradedBy: 't-huli', gradedAt: gradeTime,
    answers: { 'q-n1': 'C', 'q-n2': 'C', 'q-n3': 'ABC', 'q-n4': 'B', 'q-n5': ['臀大肌', '交替'],
      'q-n6': '①立即停药平卧报告医生；②0.1%肾上腺素；③吸氧；④地塞米松抗过敏；⑤补液升压纠酸；⑥必要时气管切开、心肺复苏；⑦观察记录。',
      'q-n7': '特级：24h专人；一级：1h巡视，危重/大手术后；二级：2h巡视，稳定卧床；三级：3h巡视，生活自理。意义：按需配置人力，早期发现病情变化，落实基础护理，降低风险。' },
    subjScores: { 'q-n6': 25, 'q-n7': 36 } }),
  // 医生：郝磊已提交待批阅
  buildAttempt({ id: 'a-7', userId: 'e-haolei', examId: exam1, post: 'doctor', status: 'submitted', subAt: ISO(D(-18)),
    answers: { 'q-d1': 'B', 'q-d2': 'B', 'q-d3': 'ABD', 'q-d4': 'A', 'q-d5': ['有效循环', '尿'],
      'q-d6': '感染特别是呼吸道感染，房颤，输液多，生气累着了，停药不当，贫血甲亢。',
      'q-d7': '外科肚子痛有压痛反跳痛要开刀；内科一般先发烧肚子痛不固定；女病人要问月经排除宫外孕。先抢救休克，诊断不清不能打止痛针。' } }),
  // 技师
  buildAttempt({ id: 'a-8', userId: 'e-hujun', examId: exam1, post: 'technician', status: 'graded', subAt: ISO(D(-19)),
    gradedBy: 't-jishu', gradedAt: gradeTime,
    answers: { 'q-t1': 'C', 'q-t2': 'C', 'q-t3': 'ABD', 'q-t4': 'A', 'q-t5': ['2', '抗生素'],
      'q-t6': '问过敏史、查肾功能，用等渗对比剂，多喝水水化，准备抢救设备，留观半小时。',
      'q-t7': '分析前包括申请、患者准备、采血、运送、接收、离心保存。分析前误差占比很高，控制不好结果不准会误导诊断，必须规范流程、拒收不合格标本。' },
    subjScores: { 'q-t6': 22, 'q-t7': 34 } }),
  // 缺考
  buildAttempt({ id: 'a-9', userId: 'e-chenxi', examId: exam1, post: 'nurse', status: 'absent' }),
  buildAttempt({ id: 'a-10', userId: 'e-malin', examId: exam1, post: 'doctor', status: 'absent' }),
  buildAttempt({ id: 'a-11', userId: 'e-sunyao', examId: exam1, post: 'technician', status: 'absent' }),
];

/* ---------- 补考名单关联：按缺考/实际成绩推导，补考安排记录在 makeup 表 ---------- */
const attemptByUser = Object.fromEntries(attempts.map((a) => [a.userId, a]));
const makeupRoster = [
  ['e-lina', true], ['e-chenxi', true], ['e-malin', true], ['e-sunyao', false], ['e-zhaomin', false],
].map(([userId, notified], i) => {
  const a = attemptByUser[userId];
  const reason = a.status === 'absent' ? '缺考'
    : a.status === 'submitted' ? '主观题批阅中，待定'
    : `不合格（${a.total}分）`;
  return { id: 'mk-' + (i + 1), examId: 'ex-makeup-q2', sourceExamId: exam1, userId, reason, notified, createdAt: ISO(D(-14)) };
});

const db = {
  meta: { version: 1, seededAt: new Date().toISOString() },
  users,
  questions,
  exams,
  attempts,
  makeupRoster,
  tokens: [],
};

const target = path.join(__dirname, 'data', 'db.json');
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, JSON.stringify(db, null, 2));
console.log('种子数据已生成:', target);
console.log('用户数:', users.length, '| 题目数:', questions.length, '| 考试数:', exams.length, '| 作答数:', attempts.length);
