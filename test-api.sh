#!/bin/bash
# 可重复执行：重建种子 + 重启服务 + 全链路测试
cd "$(dirname "$0")"
BASE=http://localhost:3000

# 停掉所有 server.js 进程（严格匹配 cmdline 恰为 node\0server.js，绝不误伤本脚本）
for p in /proc/[0-9]*; do
  pid=${p#/proc/}
  [ -r "$p/cmdline" ] || continue
  args=$(tr '\0' '\n' < "$p/cmdline" 2>/dev/null | grep -c .)
  first=$(tr '\0' '\n' < "$p/cmdline" 2>/dev/null | head -1)
  second=$(tr '\0' '\n' < "$p/cmdline" 2>/dev/null | sed -n 2p)
  if [ "$args" = "2" ] && [ "$first" = "node" ] && [ "$second" = "server.js" ]; then kill "$pid" 2>/dev/null; fi
done
for i in $(seq 1 20); do
  curl -s -o /dev/null http://localhost:3000/api/auth/me 2>/dev/null || break
  sleep 0.3
done
node seed.js >/dev/null
setsid node server.js > /tmp/server.log 2>&1 < /dev/null &
echo $! > /tmp/sanji.pid
for i in $(seq 1 40); do
  curl -s -X POST $BASE/api/auth/login -H 'Content-Type: application/json' \
    -d '{"username":"admin","password":"123456"}' | grep -q token && break
  sleep 0.3
done
curl -s -X POST $BASE/api/auth/login -H 'Content-Type: application/json' -d '{"username":"admin","password":"123456"}' | grep -q token || { echo "服务启动失败"; cat /tmp/server.log; exit 2; }

pass=0; fail=0
check(){ if printf '%s' "$2" | grep -qE "$3"; then echo "✅ $1"; pass=$((pass+1)); else echo "❌ $1 -> $(printf '%s' "$2" | head -c 140)"; fail=$((fail+1)); fi; }
# api METHOD PATH TOKEN [JSON BODY]
api(){ local m="$1" p="$2" t="$3" b="$4";
  if [ -n "$b" ]; then curl -s -X "$m" "$BASE$p" -H "X-Auth-Token: $t" -H 'Content-Type: application/json' -d "$b";
  else curl -s -X "$m" "$BASE$p" -H "X-Auth-Token: $t"; fi
}
jstr(){ node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{let f=process.argv[1].split(".");let v=JSON.parse(s);for(const k of f){if(k==="")continue;v=v[k]}process.stdout.write(v==null?"":String(v))})' "$1"; }
jlen(){ node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{let v=JSON.parse(s);const f=process.argv[1].split(".");for(const k of f){v=k===""?v:v[k]}process.stdout.write(Array.isArray(v)?String(v.length):"NA")})' "$1"; }
tok(){ curl -s -X POST $BASE/api/auth/login -H 'Content-Type: application/json' -d "{\"username\":\"$1\",\"password\":\"123456\"}" | jstr data.token; }

TA=$(tok admin); TH=$(tok hulibu); TT=$(tok teacher_hu); TTN=$(tok teacher_nei); TTJ=$(tok teacher_ji)
TW=$(tok wangxue); TS=$(tok sunyao); TLT=$(tok liuting)
[ -z "$TA$TH$TT$TW" ] && { echo "token 获取失败 TA=$TA TH=$TH TT=$TT TW=$TW"; exit 3; }

echo "--- 1. 角色权限边界 ---"
check "考生不能看题库" "$(api GET /api/questions "$TW")" "考生不能直接查看题库"
check "院级管理员不能看人员" "$(api GET /api/users "$TA")" "无权限"
check "院级管理员不能看题库" "$(api GET /api/questions "$TA")" "院级视图仅提供汇总数据"
check "院级管理员不能看待批阅" "$(api GET /api/grading/pending "$TA")" "无权限"
check "院级管理员不能看补考名单" "$(api GET /api/makeup "$TA")" "无权限"
check "院级管理员可看汇总看板" "$(api GET /api/dashboard/hospital "$TA")" '"ok":true'
check "护理老师题库7道且全是护士题" "$(api GET /api/questions "$TT" | jstr data.0.postLabel)" "护士"
check "护理老师题库数量=7" "$(api GET /api/questions "$TT" | jlen data)" "^7$"

echo "--- 2. 按岗位+科室进入不同考试与题库 ---"
check "王雪(内科护士)2场(正考+补考)" "$(api GET /api/my/exams "$TW" | jlen data)" "^2$"
check "王雪试卷7题满分100" "$(api GET /api/my/exams "$TW" | jstr data.0.fullScore)" "100"
check "孙瑶(技师)无急诊护理专场" "$(api GET /api/my/exams "$TS" | grep -c 急诊)" "^0$"
check "刘婷(急诊护士)有急诊专场" "$(api GET /api/my/exams "$TLT" | grep -c 急诊)" "^1$"
check "刘婷可见3场" "$(api GET /api/my/exams "$TLT" | jlen data)" "^3$"
check "张强(医生)不考急诊护理" "$(api GET /api/my/exams "$(tok zhangqiang)" | grep -c 急诊)" "^0$"

echo "--- 3. 科室老师批阅主观题 ---"
PEND_T=$(api GET /api/grading/pending "$TT")
check "护理老师待批含赵敏" "$(printf '%s' "$PEND_T" | grep -o e-zhaomin | head -1)" "e-zhaomin"
check "护理老师待批无医生" "$(printf '%s' "$PEND_T" | grep -c '\"post\":\"doctor\"')" "^0$"
A5=$(printf '%s' "$PEND_T" | node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{let v=JSON.parse(s).data.find(x=>x.userId==="e-zhaomin");process.stdout.write(v.attemptId)})')
G5=$(api POST /api/grading/$A5 "$TT" '{"scores":{"q-n6":20,"q-n7":30},"comment":"流程完整"}')
check "赵敏总分75(客观25+主观50)" "$(printf '%s' "$G5" | jstr data.total)" "^75$"
check "赵敏合格" "$(printf '%s' "$G5" | jstr data.passed)" "true"
check "重复批阅被拒" "$(api POST /api/grading/$A5 "$TT" '{"scores":{"q-n6":20,"q-n7":30}}')" "已批阅"
PEND_N=$(api GET /api/grading/pending "$TTN")
A7=$(printf '%s' "$PEND_N" | node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{let v=JSON.parse(s).data.find(x=>x.userId==="e-haolei");process.stdout.write(v.attemptId)})')
check "评分超满分被拒" "$(api POST /api/grading/$A7 "$TTN" '{"scores":{"q-d6":999,"q-d7":25}}')" "分数须在"
check "缺项评分被拒" "$(api POST /api/grading/$A7 "$TTN" '{"scores":{"q-d6":15}}')" "请完成全部"
G7=$(api POST /api/grading/$A7 "$TTN" '{"scores":{"q-d6":15,"q-d7":25}}')
check "郝磊总分65合格" "$(printf '%s' "$G7" | jstr data.total)" "^65$"
check "护理老师越权批医生卷被拒" "$(api POST /api/grading/$A7 "$TT" '{"scores":{"q-d6":15,"q-d7":25}}')" "仅可批阅本岗位"

echo "--- 4. 缺考/不合格自动进入补考名单 ---"
MK=$(api GET /api/makeup "$TH")
check "名单含缺考陈曦" "$(printf '%s' "$MK" | grep -o '陈曦' | head -1)" "陈曦"
check "名单含缺考马琳" "$(printf '%s' "$MK" | grep -o '马琳' | head -1)" "马琳"
check "名单含缺考孙瑶(技师)" "$(printf '%s' "$MK" | grep -o '孙瑶' | head -1)" "孙瑶"
check "李娜原因为不合格45分(按实际成绩)" "$(printf '%s' "$MK" | grep -o '不合格（45分）' | head -1)" "45"
MK_TJ=$(api GET /api/makeup "$TTJ")
check "技师老师只见孙瑶" "$(printf '%s' "$MK_TJ" | grep -o '\"userName\":\"[^\"]*\"' | tr -d ' ' | sort -u)" "孙瑶"
check "技师老师看不到陈曦" "$(printf '%s' "$MK_TJ" | grep -c 陈曦)" "^0$"

echo "--- 5. 成绩归入培训档案 ---"
ARC=$(api GET /api/my/archive "$TW")
check "王雪均分87" "$(printf '%s' "$ARC" | jstr data.avgScore)" "^87$"
check "王雪学分2" "$(printf '%s' "$ARC" | jstr data.totalCredits)" "^2$"
check "王雪合格率100" "$(printf '%s' "$ARC" | jstr data.passRate)" "^100$"
check "王雪只有1条已出分记录" "$(printf '%s' "$ARC" | jlen data.records)" "^1$"
check "李娜档案含不合格" "$(api GET /api/my/archive "$(tok lina)" | grep -c 'passed.:false')" "^[1-9]"
check "陈曦档案含缺考记录" "$(api GET /api/my/archive "$(tok chenxi)" | grep -o '"status":"absent"' | head -1)" "absent"

echo "--- 6. 院级视图仅聚合，无个人/题库明细 ---"
DASH=$(api GET /api/dashboard/hospital "$TA")
check "看板不含任何考生姓名" "$(printf '%s' "$DASH" | grep -c '王雪\|李娜\|陈曦\|孙瑶\|马琳\|郝磊')" "^0$"
check "看板不含缺考人员明细字段" "$(printf '%s' "$DASH" | grep -c absentUsers)" "^0$"
check "看板含薄弱知识点聚合" "$(printf '%s' "$DASH" | grep -o weakTop | head -1)" "weakTop"
check "管理员薄弱点无人数明细" "$(api GET /api/weakpoints "$TA" | grep -c 'people')" "^0$"
check "护理部薄弱点有人数明细" "$(api GET /api/weakpoints "$TH" | grep -c 'people')" "^[1-9]"
check "管理员不能看单场考试缺考名单" "$(api GET /api/exams/ex-2026q2/summary "$TA")" "无权限"

echo "--- 7. 考试发布/结考闭环（自动登记缺考）---"
EID=$(api POST /api/exams "$TH" '{"title":"接口临时考试","posts":["nurse"],"deptScope":["内科"],"startTime":"2099-01-01T00:00","endTime":"2099-01-02T00:00","passScore":60,"credits":1}' | jstr data.id)
check "草稿考生不可见" "$(api GET /api/my/exams "$TW" | grep -c "$EID")" "^0$"
check "发布成功" "$(api POST /api/exams/$EID/publish "$TH" | jstr data.status)" "^published$"
check "非开考时间禁止进入" "$(api POST /api/exams/$EID/start "$TW")" "不在考试时间段"
check "结考成功" "$(api POST /api/exams/$EID/close "$TH" | jstr data.status)" "^closed$"
SUM=$(api GET /api/exams/$EID/summary "$TH")
check "结考自动登记缺考(内科2名护士)" "$(printf '%s' "$SUM" | jstr data.absentCount)" "^2$"
check "汇总名单含王雪赵敏" "$(printf '%s' "$SUM" | grep -o '王雪\|赵敏' | sort -u | tr '\n' ',')" "王雪,赵敏,"

echo "--- 8. 在线答题：客观自动判分→主观批阅→试卷解析 ---"
LID=$(api POST /api/exams "$TH" '{"title":"实时答题测试","posts":["nurse"],"deptScope":["内科"],"startTime":"2020-01-01T00:00","endTime":"2099-01-01T00:00","passScore":60,"credits":1}' | jstr data.id)
api POST /api/exams/$LID/publish "$TH" >/dev/null
check "开始考试成功" "$(api POST /api/exams/$LID/start "$TW")" "attemptId"
SUB=$(api POST /api/exams/$LID/submit "$TW" '{"answers":{"q-n1":"C","q-n2":"C","q-n3":"ABC","q-n4":"B","q-n5":["臀大肌","交替"],"q-n6":"待批","q-n7":"待批"}}')
check "客观题自动判35分" "$(printf '%s' "$SUB" | jstr data.objectiveTotal)" "^35$"
check "交卷后为待批阅状态" "$(printf '%s' "$SUB" | jstr data.status)" "^submitted$"
check "提示等待科室批阅" "$(printf '%s' "$SUB" | grep -o '科室老师批阅' | head -1)" "科室老师批阅"
check "重复交卷被拒" "$(api POST /api/exams/$LID/submit "$TW" '{"answers":{}}')" "不能重复交卷"
check "批阅前无参考答案" "$(api GET /api/exams/$LID/paper "$TW" | grep -c 参考要点)" "^0$"
NP=$(api GET /api/grading/pending "$TT" | node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{let v=JSON.parse(s).data.find(x=>x.examId==="'$LID'");process.stdout.write(v?v.attemptId:"")})')
GN=$(api POST /api/grading/$NP "$TT" '{"scores":{"q-n6":25,"q-n7":40},"comment":"优秀"}')
check "主观批阅后总分100" "$(printf '%s' "$GN" | jstr data.total)" "^100$"
check "出分后考生可见2道主观题参考要点" "$(api GET /api/exams/$LID/paper "$TW" | node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{let q=JSON.parse(s).data.questions;process.stdout.write(String(q.filter(x=>x.type==="short"||x.type==="essay").every(x=>x.reference&&x.reference.length>5)))})')" "^true$"
check "出分后主观题得分已回传" "$(api GET /api/exams/$LID/paper "$TW" | node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{let q=JSON.parse(s).data.questions;let sub=q.filter(x=>!["single","multi","judge","blank"].includes(x.type));process.stdout.write(String(sub.length===2&&sub.every(x=>x.awarded>0)))})')" "^true$"

echo "--- 9. 一键创建补考 ---"
check "未结考考试不能安排补考" "$(api POST /api/exams/ex-emergency/makeup "$TH" '{"startTime":"2099-03-01T00:00","endTime":"2099-03-02T00:00"}')" "结考后"
check "对已结考正考可创建补考" "$(api POST /api/exams/ex-2026q2/makeup "$TH" '{"title":"接口创建补考A","startTime":"2099-03-01T00:00","endTime":"2099-03-02T00:00"}' | jstr data.sourceExamId)" "^ex-2026q2$"
MK2=$(api POST /api/exams/$EID/makeup "$TH" '{"title":"接口创建补考B","startTime":"2099-04-01T00:00","endTime":"2099-04-02T00:00"}')
check "科室场也可创建补考" "$(printf '%s' "$MK2" | jstr data.sourceExamId)" "^$EID$"
check "补考自动发布" "$(printf '%s' "$MK2" | jstr data.status)" "^published$"
check "新缺考人员自动关联到新补考" "$(api GET "/api/makeup?source=$EID" "$TH" | node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{let v=JSON.parse(s).data;process.stdout.write(String(v.length===2&&v.every(x=>x.makeupTitle==="接口创建补考B")))})')" "^true$"

echo ""
echo "===== 通过 $pass / 失败 $fail ====="
[ $fail -eq 0 ]
