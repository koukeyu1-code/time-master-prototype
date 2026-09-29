/* ========================================================
   青甘大环线核心 POI
   字段说明：
   - name, alias: 显示名 / 别名（用于搜索）
   - lng, lat:  WGS84→GCJ-02 坐标，取自高德
   - altitude:  海拔（米），来源于公开地理数据
   - type:      city | scenic | town
   - stayMin:   建议停留时长（分钟），仅 scenic 类型有效
   - note:      自驾相关备注（海拔提示 / 门票 / 加油 / 路况）
   ======================================================== */

export const POIS = {
  // ========== 城市/县城（出发 / 住宿点）==========
  xining: {
    key: 'xining', name: '西宁', type: 'city',
    lng: 101.778, lat: 36.623, altitude: 2260,
    adcode: '630100',
    note: '青海省省会，青甘大环线默认起点；海拔低，适合高原适应；机场高铁通达',
  },
  huzhu: {
    key: 'huzhu', name: '互助', type: 'town',
    lng: 102.433, lat: 36.842, altitude: 2560, adcode: '630223',
  },
  qinghaihu_ertan: {
    key: 'qinghaihu_ertan', name: '青海湖二郎剑', type: 'town',
    lng: 100.512, lat: 36.654, altitude: 3200, adcode: '632521',
    note: '青海湖主景区所在地；有加油站；晚间住宿选择较多',
  },
  chaka: {
    key: 'chaka', name: '茶卡镇', type: 'town',
    lng: 99.080, lat: 36.792, altitude: 3100, adcode: '632821',
    note: '茶卡盐湖出口镇，加油站 2 座，住宿多',
  },
  dachaidan: {
    key: 'dachaidan', name: '大柴旦', type: 'town',
    lng: 95.371, lat: 37.860, altitude: 3180, adcode: '632875',
    note: '本线中转重镇；只有 1 个中石化；旺季住宿紧张',
  },
  lenghu: {
    key: 'lenghu', name: '冷湖镇', type: 'town',
    lng: 93.354, lat: 38.754, altitude: 2760, adcode: '632879',
    note: '去水上雅丹与火星营地的分叉点；加油站 1 个，务必加油',
  },
  dunhuang: {
    key: 'dunhuang', name: '敦煌', type: 'city',
    lng: 94.663, lat: 40.142, altitude: 1140, adcode: '620982',
    note: '甘肃侧大城；机场/高铁站；餐饮住宿完善；莫高窟需提前 15 天 A 类票',
  },
  jiayuguan: {
    key: 'jiayuguan', name: '嘉峪关', type: 'city',
    lng: 98.290, lat: 39.773, altitude: 1660, adcode: '620200',
  },
  zhangye: {
    key: 'zhangye', name: '张掖', type: 'city',
    lng: 100.455, lat: 38.932, altitude: 1480, adcode: '620700',
    note: '丹霞地质公园主入口城市；餐饮住宿多',
  },
  qilian: {
    key: 'qilian', name: '祁连县', type: 'town',
    lng: 100.252, lat: 38.180, altitude: 2770, adcode: '632222',
    note: '卓尔山景区脚下；海拔较高；路况以山路为主',
  },
  menyuan: {
    key: 'menyuan', name: '门源', type: 'town',
    lng: 101.626, lat: 37.386, altitude: 2880, adcode: '632221',
    note: '七月油菜花景观；达坂山山口海拔 3940m，常遇雨雪',
  },
  wulan: {
    key: 'wulan', name: '乌兰县', type: 'town',
    lng: 98.472, lat: 36.948, altitude: 2960, adcode: '632821',
    note: '茶卡西 70km，住宿比茶卡更安静；有中石油',
  },
  akesai: {
    key: 'akesai', name: '阿克塞', type: 'town',
    lng: 94.253, lat: 39.634, altitude: 1700, adcode: '620924',
    note: '出当金山后的甘肃第一个县城；加油+补给，海拔骤降利于休整',
  },
  guazhou: {
    key: 'guazhou', name: '瓜州', type: 'town',
    lng: 95.773, lat: 40.568, altitude: 1180, adcode: '620922',
    note: '敦煌→嘉峪关途中的加油+吃瓜重镇；瓜州蜜瓜免费尝',
  },
  dangjinshan_pass: {
    key: 'dangjinshan_pass', name: '当金山口', type: 'scenic',
    lng: 94.158, lat: 39.456, altitude: 3649, adcode: '632879',
    stayMin: 30,
    note: '当金山垭口 3649m；215 国道坡陡弯急，摩托需注意制动与冷却',
  },
  dachaidan_feicui: {
    key: 'dachaidan_feicui', name: '大柴旦翡翠湖', type: 'scenic',
    lng: 95.237, lat: 37.868, altitude: 3150, adcode: '632875',
    stayMin: 180,
    note: '网红盐湖；清晨/傍晚倒影最佳；免费但需自行开车入内找湖',
  },
  xiqianfodong: {
    key: 'xiqianfodong', name: '西千佛洞', type: 'scenic',
    lng: 94.635, lat: 39.977, altitude: 1220, adcode: '620982',
    stayMin: 120,
    note: '莫高窟姊妹窟；人少票好买；与阳关顺路',
  },
  yumen: {
    key: 'yumen', name: '玉门关遗址', type: 'scenic',
    lng: 93.858, lat: 40.356, altitude: 1420, adcode: '620982',
    stayMin: 150,
    note: '与阳关成一南一北两角；距敦煌 100km，需与魔鬼城二选一',
  },

  // ========== 景区 ==========
  kumbum: {
    key: 'kumbum', name: '塔尔寺', type: 'scenic',
    lng: 101.569, lat: 36.497, altitude: 2680, adcode: '630100',
    stayMin: 150,
    note: '藏传佛教格鲁派六大寺之一；建议 2.5 小时',
  },
  qinghaihu_erlangjian: {
    key: 'qinghaihu_erlangjian', name: '青海湖二郎剑景区', type: 'scenic',
    lng: 100.490, lat: 36.620, altitude: 3200, adcode: '632521',
    stayMin: 180,
    note: '青海湖主景区；湖边风大；海拔 3200 切勿剧烈运动',
  },
  chaka_salt_lake: {
    key: 'chaka_salt_lake', name: '茶卡盐湖天空壹号', type: 'scenic',
    lng: 99.090, lat: 36.800, altitude: 3100, adcode: '632821',
    stayMin: 240,
    note: '拍倒影必去；晴天上午出片；景区内小火车单程 40 分钟',
  },
  charhan_salt_lake: {
    key: 'charhan_salt_lake', name: '察尔汗盐湖', type: 'scenic',
    lng: 95.287, lat: 36.658, altitude: 2680, adcode: '632801',
    stayMin: 180,
    note: '分支点，比茶卡大 56 倍但商业化低；从格尔木方向绕路',
  },
  xiaochaidan: {
    key: 'xiaochaidan', name: '小柴旦湖', type: 'scenic',
    lng: 95.372, lat: 37.485, altitude: 3180, adcode: '632875',
    stayMin: 60,
    note: '路边免费湖景，停车拍照',
  },
  uvs_south_danxia: {
    key: 'uvs_south_danxia', name: '乌素特水上雅丹', type: 'scenic',
    lng: 93.819, lat: 37.413, altitude: 2810, adcode: '632879',
    stayMin: 210,
    note: 'G315 边；必看日出日落；距离大柴旦 210km 单程，来回约 5 小时',
  },
  south_baxian: {
    key: 'south_baxian', name: '南八仙雅丹', type: 'scenic',
    lng: 94.469, lat: 38.246, altitude: 2900, adcode: '632875',
    stayMin: 90,
    note: '免费雅丹地貌；G3011 路边可停',
  },
  mogao_caves: {
    key: 'mogao_caves', name: '莫高窟', type: 'scenic',
    lng: 94.808, lat: 40.043, altitude: 1250, adcode: '620982',
    stayMin: 270,
    note: '必须提前 15 天在「莫高窟参观预约网」抢 A 类票（8 洞窟数字展）',
  },
  mingsha_shan: {
    key: 'mingsha_shan', name: '鸣沙山月牙泉', type: 'scenic',
    lng: 94.682, lat: 40.089, altitude: 1150, adcode: '620982',
    stayMin: 240,
    note: '建议傍晚进入避开高温；摩托车停车区距主入口 800m',
  },
  yangguan: {
    key: 'yangguan', name: '阳关遗址', type: 'scenic',
    lng: 94.087, lat: 39.937, altitude: 1300, adcode: '620982',
    stayMin: 150,
    note: '西出阳关无故人；沙漠段注意沙尘',
  },
  jiayuguan_fort: {
    key: 'jiayuguan_fort', name: '嘉峪关关城', type: 'scenic',
    lng: 98.243, lat: 39.806, altitude: 1700, adcode: '620200',
    stayMin: 180,
  },
  zhangye_danxia: {
    key: 'zhangye_danxia', name: '张掖七彩丹霞', type: 'scenic',
    lng: 99.966, lat: 38.959, altitude: 1550, adcode: '620700',
    stayMin: 240,
    note: '必看日落；西门入（北门人少），4 号观景台拍丹霞',
  },
  ping_shan_hug: {
    key: 'ping_shan_hug', name: '平山湖大峡谷', type: 'scenic',
    lng: 100.494, lat: 39.262, altitude: 1860, adcode: '620702',
    stayMin: 240,
    note: '可选；距张掖市区 60km 单程；体验好但费时间',
  },
  qilian_zhuori: {
    key: 'qilian_zhuori', name: '卓尔山', type: 'scenic',
    lng: 100.260, lat: 38.187, altitude: 2930, adcode: '632222',
    stayMin: 210,
    note: '祁连县北麓；日出日落方向各不同，适合一早一晚',
  },
  biandukou: {
    key: 'biandukou', name: '扁都口', type: 'scenic',
    lng: 100.883, lat: 38.253, altitude: 3530, adcode: '620722',
    stayMin: 60,
    note: '翻越祁连山的垭口；常遇横风',
  },
  dabanshan_pass: {
    key: 'dabanshan_pass', name: '达坂山隧道', type: 'scenic',
    lng: 101.606, lat: 37.350, altitude: 3940, adcode: '632221',
    stayMin: 30,
    note: '全线最高点 3940m；冬季常结冰；是返程必经之路',
  },
};

/* 经典 7 日青甘大环线：每天的停留顺序
   每个 day.stops 是 key -> POIS[key]
   lastStop 必为住宿点（city/town 类型）
*/
export const CLASSIC_7DAY = [
  {
    day: 1, title: 'Day 1 · 西宁→塔尔寺→青海湖',
    stops: ['xining', 'kumbum', 'qinghaihu_erlangjian', 'qinghaihu_ertan'],
    theme: '高原适应 + 青海湖日落',
  },
  {
    day: 2, title: 'Day 2 · 青海湖→茶卡盐湖→大柴旦',
    stops: ['qinghaihu_ertan', 'chaka_salt_lake', 'chaka', 'dachaidan'],
    theme: '天空壹号 + G3011 长距离驾驶',
  },
  {
    day: 3, title: 'Day 3 · 大柴旦一日（南八仙 + 水上雅丹）',
    stops: ['dachaidan', 'south_baxian', 'uvs_south_danxia', 'lenghu', 'dachaidan'],
    theme: '雅丹地貌集中日；往返水上雅丹 400km',
  },
  {
    day: 4, title: 'Day 4 · 大柴旦→敦煌',
    stops: ['dachaidan', 'xiaochaidan', 'dunhuang'],
    theme: '跨越当金山；当金山路段坡陡弯急，摩托需注意冷却',
  },
  {
    day: 5, title: 'Day 5 · 敦煌一日',
    stops: ['dunhuang', 'mogao_caves', 'yangguan', 'mingsha_shan', 'dunhuang'],
    theme: '莫高窟 A 票上午；傍晚鸣沙山',
  },
  {
    day: 6, title: 'Day 6 · 敦煌→嘉峪关→张掖',
    stops: ['dunhuang', 'jiayuguan_fort', 'jiayuguan', 'zhangye_danxia', 'zhangye'],
    theme: '长城+丹霞；全天里程最高（约 620km）',
  },
  {
    day: 7, title: 'Day 7 · 张掖→祁连→门源→西宁',
    stops: ['zhangye', 'qilian_zhuori', 'qilian', 'biandukou', 'dabanshan_pass', 'menyuan', 'xining'],
    theme: '祁连草原 + 达坂山高海拔返程',
  },
];

/* 宽松 10 日青甘大环线（针对摩托自驾）
 * 重点：嘉峪关前放慢节奏（占 8 天），茶卡/大柴旦/敦煌各拆多一天；
 * 最长 13 天额度内只用 10 天，留机动。
 * 起始日期：2026-09-26（周六），终点 2026-10-05（周一）。
 */
export const RELAXED_10DAY = [
  {
    day: 1, title: 'Day 1 · 西宁→塔尔寺→青海湖',
    stops: ['xining', 'kumbum', 'qinghaihu_erlangjian', 'qinghaihu_ertan'],
    theme: '高原适应；湖边日落',
  },
  {
    day: 2, title: 'Day 2 · 青海湖日出→茶卡盐湖深度游',
    stops: ['qinghaihu_ertan', 'chaka_salt_lake', 'chaka', 'wulan'],
    theme: '给茶卡 4h+；不再赶路去大柴旦',
  },
  {
    day: 3, title: 'Day 3 · 乌兰→小柴旦→翡翠湖→大柴旦',
    stops: ['wulan', 'xiaochaidan', 'dachaidan_feicui', 'dachaidan'],
    theme: '路边湖景 + 翡翠湖傍晚倒影',
  },
  {
    day: 4, title: 'Day 4 · 大柴旦→水上雅丹→冷湖（日落）',
    stops: ['dachaidan', 'uvs_south_danxia', 'lenghu'],
    theme: '雅丹地貌核心日；走 G315 直达，避开绕路；傍晚水上雅丹日落+住冷湖',
  },
  {
    day: 5, title: 'Day 5 · 冷湖→南八仙→当金山→阿克塞→敦煌',
    stops: ['lenghu', 'south_baxian', 'dangjinshan_pass', 'akesai', 'dunhuang'],
    theme: '南八仙顺路再翻当金山；海拔骤降，住敦煌好好休整',
  },
  {
    day: 6, title: 'Day 6 · 莫高窟 + 鸣沙山日落',
    stops: ['dunhuang', 'mogao_caves', 'mingsha_shan', 'dunhuang'],
    theme: 'A 票+数字展 4.5h；傍晚鸣沙山看星空',
  },
  {
    day: 7, title: 'Day 7 · 敦煌西线：西千佛洞→阳关→玉门关',
    stops: ['dunhuang', 'xiqianfodong', 'yangguan', 'yumen', 'dunhuang'],
    theme: '一天走完丝路两关+小众石窟，里程短适合休闲',
  },
  {
    day: 8, title: 'Day 8 · 敦煌→瓜州→嘉峪关关城',
    stops: ['dunhuang', 'guazhou', 'jiayuguan_fort', 'jiayuguan'],
    theme: '瓜州吃瓜歇脚；下午逛嘉峪关，住嘉峪关',
  },
  {
    day: 9, title: 'Day 9 · 嘉峪关→张掖七彩丹霞',
    stops: ['jiayuguan', 'zhangye_danxia', 'zhangye'],
    theme: '丹霞 4 号观景台看日落',
  },
  {
    day: 10, title: 'Day 10 · 张掖→祁连→门源→西宁',
    stops: ['zhangye', 'qilian_zhuori', 'qilian', 'biandukou', 'dabanshan_pass', 'menyuan', 'xining'],
    theme: '草原+达坂山高海拔返程；达坂山 3940m 注意天气',
  },
];

/* 西宁→敦煌单向 5 日（摩托自驾，单程 1900~2100km）
 * 不返程、不走嘉峪关：茶卡→大柴旦→水上雅丹→当金山→阿克塞→敦煌
 */
export const XN2DH_5DAY = [
  {
    day: 1, title: 'Day 1 · 西宁→塔尔寺→青海湖',
    stops: ['xining', 'kumbum', 'qinghaihu_erlangjian', 'qinghaihu_ertan'],
    theme: '高原适应 + 青海湖日落',
  },
  {
    day: 2, title: 'Day 2 · 青海湖日出→茶卡盐湖深度游',
    stops: ['qinghaihu_ertan', 'chaka_salt_lake', 'chaka', 'wulan'],
    theme: '给茶卡留 4 小时；傍晚住宿乌兰',
  },
  {
    day: 3, title: 'Day 3 · 乌兰→小柴旦湖→翡翠湖→大柴旦',
    stops: ['wulan', 'xiaochaidan', 'dachaidan_feicui', 'dachaidan'],
    theme: 'G3011 沿路湖景；傍晚翡翠湖倒影',
  },
  {
    day: 4, title: 'Day 4 · 大柴旦→水上雅丹→冷湖',
    stops: ['dachaidan', 'uvs_south_danxia', 'lenghu'],
    theme: '水上雅丹日落 + 冷湖石油小镇；住冷湖省掉次日返程 200km',
  },
  {
    day: 5, title: 'Day 5 · 冷湖→南八仙→当金山→阿克塞→敦煌',
    stops: ['lenghu', 'south_baxian', 'dangjinshan_pass', 'akesai', 'dunhuang'],
    theme: '摩托翻越当金山（3649m）；海拔骤降到敦煌 1139m 入住。可续购 Day6「莫高窟/鸣沙山」',
  },
];

/* 对外导出模板元信息，routes/trip.js 用来渲染模板列表 */
export const TEMPLATES = [
  {
    key: 'classic7',
    name: '经典青甘大环线 7 日',
    description: '西宁→青海湖→茶卡→大柴旦→敦煌→嘉峪关→张掖→门源→西宁，全程约 2400km，紧凑快节奏。',
    startCity: '西宁',
    defaultDays: 7,
    vehicle: 'motorcycle',
    relaxed: false,
  },
  {
    key: 'relaxed10',
    name: '宽松青甘大环线 10 日（推荐摩托）',
    description: '嘉峪关前放慢节奏：茶卡深度、水上雅丹住冷湖、敦煌西线、丝路两关拆分游览；2026-09-26 起，13 天额度内留有 3 天机动。',
    startCity: '西宁',
    defaultDays: 10,
    vehicle: 'motorcycle',
    relaxed: true,
    recommendStartDate: '2026-09-26',
  },
  {
    key: 'xining2dunhuang',
    name: '西宁→敦煌单向 5 日（摩托）',
    description: '单向直达：西宁→青海湖→茶卡→大柴旦→水上雅丹→冷湖→当金山→阿克塞→敦煌。不返程、不走嘉峪关；5 天节奏适中，适合飞抵西宁租车还车在敦煌。',
    startCity: '西宁',
    endCity: '敦煌',
    defaultDays: 5,
    vehicle: 'motorcycle',
    relaxed: true,
    oneway: true,
  },
];

/* 动态 POI：来自高德周边搜索的 amap:xxx，运行时写入（不持久化到 POIS 常量） */
const DYNAMIC_POIS = new Map();
/* 登记动态 POI（来自 placeAround 或 poiSearch），返回规范化后的 poi 对象 */
export function registerDynamicPoi({ key, name, lng, lat, altitude, adcode, stayMin, note, type = 'scenic', address, rating, photos }) {
  if (!key) return null;
  const normalized = {
    key, name, type: type || 'scenic',
    lng: Number(lng), lat: Number(lat),
    altitude: altitude || 0, // 未知海拔设 0，风险系统会忽略高度极值
    adcode: adcode || '',
    stayMin: stayMin || 120,
    note: note || address || '',
    source: 'amap',
    rating: rating || 0,
    photos: photos || [],
  };
  DYNAMIC_POIS.set(key, normalized);
  return normalized;
}
export function clearDynamicPois() { DYNAMIC_POIS.clear(); }

/* 快捷查找：key -> poi；优先查静态 POIS，再查动态登记项 */
export function getPoi(key) { return POIS[key] || DYNAMIC_POIS.get(key) || null; }
