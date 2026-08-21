/* ============================================================
   时间管理大师 · 原型 Mock 数据源（唯一数据来源）
   对齐设计方案 v0.3 §6 数据模型；今日 = 2026-08-21（周五，北京，小雨）
   ============================================================ */

// ---------- 天气（高德天气 API 缓存，按小时刷新） ----------
export const weather = {
  city: '北京',
  date: '2026-08-21',
  weekday: '周五',
  cond: '小雨',
  tempNow: 26,
  tempRange: '24~28°',
  rainProb: 70,
  wind: '东北风 3 级',
  aqi: 42,
  updatedAt: '08:00',
  // 天气因子：雨雪天骑行/摩托车评分降权（设计 §5.3，已确认接入）
  impact: '天气因子生效：骑行、摩托车评分权重 −50%',
  hours: [
    { t: '08:00', cond: '小雨', temp: 24 },
    { t: '11:00', cond: '阴', temp: 26 },
    { t: '14:00', cond: '小雨', temp: 27 },
    { t: '17:00', cond: '多云', temp: 27 },
    { t: '20:00', cond: '多云', temp: 25 },
  ],
};

// ---------- 常去地点别名库（places 表） ----------
// mapX/mapY 为原型模拟地图的 SVG 坐标（viewBox 520x420）
export const places = [
  { id: 'p-home', alias: '家', address: '回龙观东大街 · 龙泽苑东区', mapX: 82, mapY: 88, hits: 96 },
  { id: 'p-office', alias: '公司', address: '望京 SOHO T3 · 2206', mapX: 308, mapY: 138, hits: 132 },
  { id: 'p-sbux', alias: '星巴克（国贸店）', address: '国贸商城北区 B1 · NB-107', mapX: 428, mapY: 306, hits: 14 },
  { id: 'p-dental', alias: '瑞尔齿科（中关村店）', address: '中关村大街 27 号 · 中关村大厦 3F', mapX: 150, mapY: 330, hits: 3 },
  { id: 'p-gym', alias: '乐刻运动（望京店）', address: '望京街 10 号 · 望京西园 411', mapX: 336, mapY: 216, hits: 21 },
];

// ---------- 今日日程（events 表本地副本） ----------
// status: ok 地点已解析 | pending 地点待补全 | online 线上日程（原位停留）
export const events = [
  { id: 'e1', title: '产品周会', start: '09:00', end: '10:00', locationRaw: '3 号会议室', placeId: 'p-office', status: 'ok', type: 'meeting' },
  { id: 'e2', title: '客户需求评审', start: '10:30', end: '11:30', locationRaw: '星巴克（国贸店）', placeId: 'p-sbux', status: 'ok', type: 'visit', note: '别名库自动命中 · 历史确认 14 次' },
  { id: 'e3', title: '与 Lisa 午餐', start: '12:00', end: '13:00', locationRaw: '', placeId: null, status: 'pending', type: 'personal' },
  { id: 'e4', title: 'Q3 规划讨论', start: '14:00', end: '15:30', locationRaw: '5 号会议室', placeId: 'p-office', status: 'ok', type: 'meeting' },
  { id: 'e5', title: '牙医复诊', start: '15:40', end: '16:40', locationRaw: '瑞尔齿科（中关村店）', placeId: 'p-dental', status: 'ok', type: 'personal', bufferMin: 25, note: '医院类地点缓冲 25 分钟' },
  { id: 'e6', title: '燃脂健身课', start: '18:30', end: '19:30', locationRaw: '乐刻运动（望京店）', placeId: 'p-gym', status: 'ok', type: 'personal' },
];

// ---------- 地点待补全队列（设计 §5.1 地点字段兜底流程） ----------
export const pendingLocations = [
  {
    eventId: 'e3',
    title: '与 Lisa 午餐',
    time: '12:00–13:00',
    guess: { alias: '粤食堂（望京店）', address: '望京南湖南路 9 号 · 金隅丽港城底商', confidence: 62 },
    candidates: [
      { alias: '粤食堂（望京店）', address: '望京南湖南路 9 号 · 金隅丽港城底商', distance: '距公司 900m' },
      { alias: '粤食堂（国贸店）', address: '建国门外大街 1 号 · 国贸写字楼 2 座 2F', distance: '距星巴克 350m' },
      { alias: '湄洲东坡（国贸店）', address: '光华路 8 号 · 和乔大厦 B1', distance: '距星巴克 500m' },
    ],
  },
];

// ---------- 今日出行方案（plans 表 · legs JSONB） ----------
// mode: car 私家车 | moto 摩托车 | transit 公交 | bike 骑行 | walk 步行 | rail 城际
// scores 四项因子：time 时效 / cost 成本 / park 停车便利 / scene 场景约束（0-100，加权得 total）
export const plan = {
  date: '2026-08-21',
  generatedAt: '08:32',
  legs: [
    {
      id: 'leg1', eventId: 'e1', from: 'p-home', to: 'p-office',
      departAt: '07:55', arriveAt: '08:45', durationMin: 50,
      mode: 'transit', modeLabel: '公交地铁',
      summary: '13 号线 → 15 号线 · 4 元',
      transitSteps: [
        { kind: 'walk', text: '步行 6 分钟至 回龙观东大街站', min: 6 },
        { kind: 'subway', line: '13 号线', text: '回龙观东大街 → 望京西（5 站）', min: 24 },
        { kind: 'transfer', text: '望京西换乘 15 号线', min: 4 },
        { kind: 'subway', line: '15 号线', text: '望京西 → 望京（1 站）', min: 3 },
        { kind: 'walk', text: '步行 8 分钟至公司', min: 8 },
      ],
      scores: {
        transit: { time: 68, cost: 92, park: 100, scene: 80, total: 82 },
        car: { time: 78, cost: 48, park: 42, scene: 55, total: 65, penalty: '全天多点移动 · 国贸区域停车不便' },
        moto: { time: 92, cost: 70, park: 88, scene: 60, total: 60, penalty: '小雨 · 权重 −50%' },
        bike: { time: 45, cost: 95, park: 90, scene: 40, total: 35, penalty: '小雨 · 权重 −50%' },
        walk: { time: 8, cost: 100, park: 100, scene: 20, total: 10 },
      },
      alternatives: ['car', 'moto'],
      reminder: { triggerAt: '07:40', channel: 'bot', channelLabel: 'Bot 卡片', status: 'sent', statusLabel: '已推送' },
    },
    {
      id: 'leg2', eventId: 'e2', from: 'p-office', to: 'p-sbux',
      departAt: '10:02', arriveAt: '10:28', durationMin: 26,
      mode: 'transit', modeLabel: '公交地铁',
      summary: '14 号线 → 1 号线 · 5 元',
      transitSteps: [
        { kind: 'walk', text: '步行 8 分钟至 望京南站', min: 8 },
        { kind: 'subway', line: '14 号线', text: '望京南 → 大望路（7 站）', min: 18 },
        { kind: 'transfer', text: '大望路换乘 1 号线', min: 3 },
        { kind: 'subway', line: '1 号线', text: '大望路 → 国贸（1 站）', min: 2 },
        { kind: 'walk', text: '国贸站 C 口出，步行 5 分钟', min: 5 },
      ],
      scores: {
        transit: { time: 74, cost: 90, park: 100, scene: 85, total: 84 },
        car: { time: 70, cost: 45, park: 18, scene: 40, total: 62, penalty: '国贸停车难 · 约 15 元/时' },
        moto: { time: 90, cost: 68, park: 85, scene: 55, total: 58, penalty: '小雨 · 权重 −50%' },
        bike: { time: 60, cost: 95, park: 88, scene: 35, total: 45, penalty: '小雨 · 权重 −50%' },
        walk: { time: 20, cost: 100, park: 100, scene: 25, total: 30 },
      },
      alternatives: ['car', 'bike'],
      reminder: { triggerAt: '09:47', channel: 'bot', channelLabel: 'Bot 卡片', status: 'sent', statusLabel: '已推送' },
    },
    {
      id: 'leg3', eventId: 'e3', from: 'p-sbux', to: null,
      departAt: null, arriveAt: null, durationMin: null,
      mode: null, modeLabel: '待补全',
      summary: '午餐地点缺失，补全后自动生成路线',
      pending: true,
      transitSteps: [], scores: {}, alternatives: [],
      reminder: null,
    },
    {
      id: 'leg4', eventId: 'e4', from: null, to: 'p-office',
      departAt: null, arriveAt: null, durationMin: null,
      mode: null, modeLabel: '待补全',
      summary: '依赖午餐地点，补全后自动生成',
      pending: true,
      transitSteps: [], scores: {}, alternatives: [],
      reminder: null,
    },
    {
      id: 'leg5', eventId: 'e5', from: 'p-office', to: 'p-dental',
      departAt: '15:30', arriveAt: '16:04', durationMin: 34,
      mode: 'transit', modeLabel: '公交地铁',
      summary: '15 号线 → 10 号线 · 5 元',
      transitSteps: [
        { kind: 'walk', text: '步行 8 分钟至 望京站', min: 8 },
        { kind: 'subway', line: '15 号线', text: '望京 → 奥林匹克公园（3 站）', min: 10 },
        { kind: 'transfer', text: '奥林匹克公园换乘 8 号线 → 北土城换 10 号线', min: 6 },
        { kind: 'subway', line: '10 号线', text: '北土城 → 苏州街（5 站）', min: 12 },
        { kind: 'walk', text: '步行 7 分钟至诊所', min: 7 },
      ],
      scores: {
        transit: { time: 62, cost: 90, park: 100, scene: 75, total: 74 },
        car: { time: 55, cost: 45, park: 60, scene: 50, total: 66, penalty: '晚高峰前路况波动' },
        moto: { time: 88, cost: 68, park: 85, scene: 45, total: 52, penalty: '小雨 · 权重 −50%' },
        bike: { time: 50, cost: 95, park: 88, scene: 30, total: 40, penalty: '小雨 · 权重 −50%' },
        walk: { time: 6, cost: 100, park: 100, scene: 15, total: 8 },
      },
      alternatives: ['car'],
      alert: {
        kind: 'conflict',
        level: 'danger',
        title: '通勤时间不足',
        message: '上一场 15:30 结束，下一场 15:40 开始，间隙仅 10 分钟；公交需 34 分钟 + 医院缓冲 25 分钟，按当前安排将迟到约 49 分钟。',
        suggestions: [
          { id: 's1', text: '提前 15 分钟离场：15:15 出发，公交 34 分钟，15:49 到达（迟到 9 分钟，建议同步电话告知诊所）' },
          { id: 's2', text: '打车前往：约 21 分钟，费用约 35 元，15:30 出发可提前 9 分钟到达' },
          { id: 's3', text: '与诊所协商改约，或申请线上复诊咨询' },
        ],
        resolved: false,
      },
      reminder: { triggerAt: '15:00', channel: 'sms', channelLabel: '短信加急（红色预警）', status: 'scheduled', statusLabel: '待触发' },
    },
    {
      id: 'leg6', eventId: 'e6', from: 'p-dental', to: 'p-gym',
      departAt: '17:00', arriveAt: '17:52', durationMin: 52,
      mode: 'transit', modeLabel: '公交地铁',
      summary: '10 号线 → 13 号线 · 5 元',
      transitSteps: [
        { kind: 'walk', text: '步行 7 分钟至 苏州街站', min: 7 },
        { kind: 'subway', line: '10 号线', text: '苏州街 → 芍药居（7 站）', min: 18 },
        { kind: 'transfer', text: '芍药居换乘 13 号线', min: 5 },
        { kind: 'subway', line: '13 号线', text: '芍药居 → 望京西（2 站）', min: 6 },
        { kind: 'walk', text: '步行 12 分钟至健身房（到店后更衣，距开课 38 分钟）', min: 12 },
      ],
      scores: {
        transit: { time: 66, cost: 90, park: 100, scene: 80, total: 78 },
        car: { time: 60, cost: 42, park: 55, scene: 40, total: 58, penalty: '晚高峰 · 场馆周边车位紧张' },
        moto: { time: 85, cost: 68, park: 85, scene: 50, total: 55, penalty: '小雨 · 权重 −50%' },
        bike: { time: 55, cost: 95, park: 88, scene: 35, total: 42, penalty: '小雨 · 权重 −50%' },
        walk: { time: 8, cost: 100, park: 100, scene: 15, total: 10 },
      },
      alternatives: ['bike', 'car'],
      reminder: { triggerAt: '16:45', channel: 'bot+app', channelLabel: 'Bot 卡片 + 应用内加急', status: 'scheduled', statusLabel: '待触发' },
    },
    {
      id: 'leg7', eventId: null, from: 'p-gym', to: 'p-home',
      departAt: '19:35', arriveAt: '20:20', durationMin: 45,
      mode: 'transit', modeLabel: '公交地铁',
      summary: '15 号线 → 13 号线 · 4 元 · 回家',
      transitSteps: [
        { kind: 'walk', text: '步行 10 分钟至 望京站', min: 10 },
        { kind: 'subway', line: '15 号线', text: '望京 → 望京西（1 站）', min: 3 },
        { kind: 'transfer', text: '望京西换乘 13 号线', min: 5 },
        { kind: 'subway', line: '13 号线', text: '望京西 → 回龙观东大街（5 站）', min: 24 },
        { kind: 'walk', text: '步行 6 分钟到家', min: 6 },
      ],
      scores: {
        transit: { time: 64, cost: 92, park: 100, scene: 82, total: 80 },
        car: { time: 75, cost: 48, park: 90, scene: 35, total: 61, penalty: '车辆未随行至健身房' },
        moto: { time: 88, cost: 70, park: 88, scene: 45, total: 56, penalty: '小雨 · 权重 −50%' },
        bike: { time: 52, cost: 95, park: 90, scene: 40, total: 44, penalty: '小雨 · 权重 −50%' },
        walk: { time: 10, cost: 100, park: 100, scene: 18, total: 12 },
      },
      alternatives: ['bike'],
      reminder: { triggerAt: '19:20', channel: 'bot', channelLabel: 'Bot 卡片', status: 'scheduled', statusLabel: '待触发' },
    },
  ],
};

// ---------- 偏好设置（users.preferences JSONB） ----------
export const settings = {
  vehicles: {
    car: { owned: true, note: '蓝色 SUV · 目的地可停车' },
    moto: {
      owned: true, note: '踏板摩托车',
      storageSeason: { enabled: true, from: 11, to: 3, desc: '封车季 11 月 – 次年 3 月，期间从候选方式移除，4 月自动解禁' },
    },
  },
  weights: { time: 70, cost: 40, parking: 60 },
  buffer: {
    defaultMin: 10,
    byPlaceType: [
      { type: '医院 / 诊所', min: 25 },
      { type: '机场 / 车站', min: 40 },
    ],
  },
  reminderLeadMin: 15,
  weatherRule: '雨雪天骑行、摩托车评分 −50%（权重降权模式）',
  notify: {
    bot: true,
    appUrgent: true,
    smsUrgent: true,
    phoneUrgent: false,
    quota: { used: 3, total: 50, resetAt: '2026-09-01' },
  },
  sync: {
    mode: 'polling', // polling | webhook
    intervalMin: 5,
    lastSyncAt: '08:32',
    note: 'NAS 无公网入口，默认零暴露轮询；配置 frp / Cloudflare Tunnel 后可切换 Webhook 秒级同步',
  },
  profile: { nickname: 'Jasper K', feishuConnected: true, home: 'p-home', work: 'p-office' },
};

// ---------- 差旅多日规划（P2 模块 · 按天分片） ----------
export const trip = {
  id: 'trip-sh-09',
  title: '上海 · 客户签约拜访',
  range: '09-15 ~ 09-17',
  days: [
    {
      date: '09-15', weekday: '周二', city: '北京 → 上海',
      segments: [
        { kind: 'rail', train: 'G7', from: '北京南', to: '上海虹桥', depart: '09:00', arrive: '13:28', conn: '家 → 北京南：地铁 45 分钟，最晚 07:50 出发（出发提醒 07:35 已注册）' },
        { kind: 'anchor', name: '上海环球港凯悦酒店', time: '14:15 入住', note: '住宿锚点 · 后续日程以此为基地' },
        { kind: 'event', title: '客户总部拜访', time: '15:30 – 17:30', place: '月星环球港 B 座 18F', mode: 'walk', conn: '酒店出发步行 6 分钟' },
        { kind: 'event', title: '团队晚餐', time: '18:30 – 20:00', place: '外滩 · Mercato', mode: 'transit', conn: '3 号线 → 10 号线 · 38 分钟 · 提醒 17:55' },
      ],
    },
    {
      date: '09-16', weekday: '周三', city: '上海',
      segments: [
        { kind: 'event', title: '方案宣讲会', time: '09:30 – 11:30', place: '客户总部 12F', mode: 'walk', conn: '酒店出发步行 6 分钟 · 提醒 09:00' },
        { kind: 'event', title: '技术对接工作坊', time: '14:00 – 17:00', place: '客户总部 6F', mode: 'walk', conn: '酒店出发步行 6 分钟 · 提醒 13:35' },
        { kind: 'alert', level: 'warning', text: '工作坊历史上平均延时 20 分钟结束，晚餐类日程建议预留弹性。' },
      ],
    },
    {
      date: '09-17', weekday: '周四', city: '上海 → 北京',
      segments: [
        { kind: 'event', title: '复盘与签约', time: '09:00 – 12:00', place: '客户总部 12F', mode: 'walk', conn: '酒店出发步行 6 分钟 · 提醒 08:35' },
        { kind: 'anchor', name: '酒店退房 · 取行李', time: '12:20' },
        { kind: 'rail', train: 'G14', from: '上海虹桥', to: '北京南', depart: '13:30', arrive: '17:58', conn: '酒店 → 虹桥：3 号线直达 50 分钟' },
        { kind: 'alert', level: 'danger', text: '衔接风险：12:00 结束 → 13:30 发车，取行李 + 通勤 50 分钟后缓冲仅 40 分钟。建议改签 14:00 后车次，或会前将行李寄存至车站。' },
      ],
    },
  ],
};

// ---------- 工具 ----------
export const MODE_META = {
  car: { label: '私家车', icon: 'Car' },
  moto: { label: '摩托车', icon: 'Bike' },
  transit: { label: '公交地铁', icon: 'TrainFront' },
  bike: { label: '骑行', icon: 'Bicycle' },
  walk: { label: '步行', icon: 'Footprints' },
  rail: { label: '城际高铁', icon: 'TrainTrack' },
};

export function placeById(id) {
  return places.find((p) => p.id === id) || null;
}
export function eventById(id) {
  return events.find((e) => e.id === id) || null;
}
