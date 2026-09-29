/* ============================================================
   种子数据：首次启动写入
   与原型 src/mock/data.js 对齐，便于平滑切换
   ============================================================ */
export const seedPlaces = [
  { id: 'p-home', alias: '家', address: '回龙观东大街 · 龙泽苑东区', mapX: 82, mapY: 88, hits: 96, location: { lng: 116.334, lat: 40.072 } },
  { id: 'p-office', alias: '公司', address: '望京 SOHO T3 · 2206', mapX: 308, mapY: 138, hits: 132, location: { lng: 116.481, lat: 39.996 } },
  { id: 'p-sbux', alias: '星巴克(国贸店)', address: '国贸商城北区 B1 · NB-107', mapX: 428, mapY: 306, hits: 14, location: { lng: 116.463, lat: 39.909 } },
  { id: 'p-dental', alias: '瑞尔齿科(中关村店)', address: '中关村大街 27 号 · 中关村大厦 3F', mapX: 150, mapY: 330, hits: 3, location: { lng: 116.317, lat: 39.984 } },
  { id: 'p-gym', alias: '乐刻运动(望京店)', address: '望京街 10 号 · 望京西园 411', mapX: 336, mapY: 216, hits: 21, location: { lng: 116.474, lat: 40.004 } },
];

export const seedSettings = {
  vehicles: {
    car: { owned: true, note: '蓝色 SUV · 目的地可停车' },
    moto: {
      owned: true,
      note: '踏板摩托车',
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
    mode: 'polling',
    intervalMin: 5,
    lastSyncAt: null,
    note: 'NAS 无公网入口，默认零暴露轮询；配置 frp / Cloudflare Tunnel 后可切换 Webhook 秒级同步',
  },
  profile: {
    nickname: 'Jasper K',
    feishuConnected: true,
    home: 'p-home',
    work: 'p-office',
  },
};
