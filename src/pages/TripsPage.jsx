import { useEffect, useMemo, useState } from 'react';
import {
  Bike, AlertTriangle, BellPlus, Hotel, MapPin, CalendarDays, RefreshCw,
  Mountain, CloudRain, Droplets, Fuel, Clock, Compass, Sparkles,
} from 'lucide-react';
import ModeIcon from '../components/ModeIcon';
import { useToast, Toasts, Skeleton } from '../components/Feedback';
import {
  fetchTrip, fetchTripTemplates, buildTrip, recalcTripDay, fetchTripDayPOIs, updateTripDayStops,
} from '../api/client';
import './TripsPage.css';

/* ========== 小工具 ========== */
const weekdayZh = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
function ymd(d) { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`; }
function alertCSS(lv) {
  if (lv === 'severe') return 'danger';
  if (lv === 'warn') return 'warning';
  return 'info';
}
function alertTagClass(lv) {
  if (lv === 'severe') return 'tag-red';
  if (lv === 'warn') return 'tag-amber';
  return 'tag-blue';
}

/* ========== 海拔迷你折线（纯 SVG，内联不引库） ========== */
function AltitudeSparkline({ legs, peak }) {
  const pts = legs.length
    ? legs.map(l => [l.from.altitude, l.to.altitude]).flat()
    : [peak, peak];
  const W = 520, H = 70, pad = 10;
  const min = Math.min(...pts) - 50;
  const max = Math.max(...pts, peak) + 50;
  const span = Math.max(1, max - min);
  const xs = pts.map((_, i) => pad + (i / (pts.length - 1 || 1)) * (W - 2 * pad));
  const ys = pts.map(v => H - pad - ((v - min) / span) * (H - 2 * pad));
  const d = xs.map((x, i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${ys[i].toFixed(1)}`).join(' ');
  const peakPts = [...pts, peak];
  const pMin = Math.min(...peakPts), pMax = Math.max(...peakPts), pSpan = Math.max(1, pMax - pMin);
  const peakX = W - pad;
  const peakY = H - pad - ((peak - min) / span) * (H - 2 * pad);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="none" className="tr-alt-svg">
      <defs>
        <linearGradient id="alt-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#22c55e" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L ${peakX} ${H-pad} L ${pad} ${H-pad} Z`} fill="url(#alt-fill)" />
      <path d={d} fill="none" stroke="#16a34a" strokeWidth="2" />
      <circle cx={peakX} cy={peakY} r="3.5" fill="#e11d48" />
      <text x={peakX - 4} y={peakY - 6} fontSize="10" textAnchor="end" fill="#e11d48" fontWeight="600">{peak}m 最高</text>
      <line x1={pad} x2={W-pad} y1={H-pad} y2={H-pad} stroke="#e5e7eb" />
    </svg>
  );
}

/* ========== 行程路线投影图（纯 SVG，lng/lat 归一化） ========== */
const DAY_COLORS = ['#7c4cff', '#22c55e', '#f59e0b', '#ef4444', '#0ea5e9', '#8b5cf6', '#14b8a6', '#f97316', '#64748b', '#be185d', '#6366f1', '#84cc16', '#a855f7'];
function RouteMap({ trip }) {
  if (!trip?.days) return null;
  /* 收集所有点：按 day 分段，每段是 [(from,to), ...] */
  const segs = []; // {day, color, points:[{lng,lat,name,alt,scenic}]}
  trip.days.forEach(d => {
    if (!d.legs?.length) return;
    const color = DAY_COLORS[(d.day - 1) % DAY_COLORS.length];
    const pts = [];
    d.legs.forEach((l, i) => {
      if (i === 0) pts.push({ lng: l.from.lng, lat: l.from.lat, name: l.from.name, alt: l.from.altitude, scenic: l.from.type === 'scenic', type: l.from.type });
      pts.push({ lng: l.to.lng, lat: l.to.lat, name: l.to.name, alt: l.to.altitude, scenic: l.to.type === 'scenic', type: l.to.type });
    });
    segs.push({ day: d.day, color, points: pts });
  });
  /* 计算 lng/lat 范围并留 6% padding */
  const all = segs.flatMap(s => s.points);
  if (!all.length) return null;
  const lngMin = Math.min(...all.map(p => p.lng)), lngMax = Math.max(...all.map(p => p.lng));
  const latMin = Math.min(...all.map(p => p.lat)), latMax = Math.max(...all.map(p => p.lat));
  const W = 720, H = 260, pad = 36;
  const xScale = (v) => pad + ((v - lngMin) / Math.max(1e-6, lngMax - lngMin)) * (W - 2 * pad);
  const yScale = (v) => H - pad - ((v - latMin) / Math.max(1e-6, latMax - latMin)) * (H - 2 * pad); /* 纬度越大越北→y越小 */

  return (
    <div className="card card-pad tr-routemap">
      <div className="tr-routemap-head">
        <div className="tr-routemap-title"><Compass size={16} /> 路线图 · 经纬度投影</div>
        <div className="tr-routemap-legend">
          {segs.map(s => (
            <span key={s.day} className="legend-dot"><i style={{ background: s.color }} />Day {s.day}</span>
          ))}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="auto" className="tr-routemap-svg">
        <defs>
          <marker id="route-arr" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" markerUnits="userSpaceOnUse" orient="auto">
            <path d="M1 1 L7 4 L1 7 Z" />
          </marker>
        </defs>
        {/* 淡网格 */}
        {[0.25, 0.5, 0.75].map(t => (
          <g key={`g${t}`} stroke="#eee" strokeDasharray="3 4">
            <line x1={pad} x2={W - pad} y1={pad + t * (H - 2 * pad)} y2={pad + t * (H - 2 * pad)} />
            <line x1={pad + t * (W - 2 * pad)} x2={pad + t * (W - 2 * pad)} y1={pad} y2={H - pad} />
          </g>
        ))}
        {/* 每天折线 */}
        {segs.map(s => {
          const d = s.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xScale(p.lng).toFixed(1)} ${yScale(p.lat).toFixed(1)}`).join(' ');
          const last = s.points[s.points.length - 1];
          const prev = s.points[Math.max(0, s.points.length - 2)];
          const ex = xScale(last.lng), ey = yScale(last.lat);
          const sx = xScale(prev.lng), sy = yScale(prev.lat);
          return (
            <g key={`s${s.day}`}>
              <path d={d} fill="none" stroke={s.color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" markerEnd="url(#route-arr)" />
              {/* 节点：scenic ⭕/ anchor 方/ town 圆 */}
              {s.points.map((p, i) => {
                const x = xScale(p.lng), y = yScale(p.lat);
                const isStart = i === 0;
                const isEnd = i === s.points.length - 1;
                if (p.scenic) return <circle key={`p${s.day}-${i}`} cx={x} cy={y} r="5.5" fill="#fff" stroke={s.color} strokeWidth="2" />;
                if (p.type === 'town' || p.type === 'city') return <rect key={`p${s.day}-${i}`} x={x-4} y={y-4} width="8" height="8" rx="2" fill={s.color} opacity={isStart || isEnd ? 1 : 0.5} />;
                return <circle key={`p${s.day}-${i}`} cx={x} cy={y} r="3" fill={s.color} />;
              })}
              {/* 起点终点标注 */}
              {s.points.length > 0 && (
                <>
                  <text x={xScale(s.points[0].lng)} y={yScale(s.points[0].lat) - 10} fontSize="11" fill={s.color} fontWeight="600">{s.points[0].name}</text>
                  <text x={xScale(last.lng)} y={yScale(last.lat) + 18} fontSize="11" fill={s.color} fontWeight="600" textAnchor="end">{last.name}</text>
                </>
              )}
              {/* Day 标签（第一个点左上角小药丸） */}
              <g transform={`translate(${xScale(s.points[0].lng) - 8}, ${yScale(s.points[0].lat) - 28})`}>
                <rect rx="9" ry="9" width="36" height="18" fill={s.color} />
                <text x="18" y="12.5" fontSize="10.5" textAnchor="middle" fill="#fff" fontWeight="700">D{s.day}</text>
              </g>
              {/* 箭头颜色继承 marker */}
              <style>{`#route-arr{fill:${s.color}}`}</style>
            </g>
          );
        })}
        {/* 坐标范围文字 */}
        <g fontSize="10" fill="#94a3b8">
          <text x={pad} y={H - 8}>lng {lngMin.toFixed(1)}°</text>
          <text x={W - pad} y={H - 8} textAnchor="end">lng {lngMax.toFixed(1)}°</text>
          <text x={14} y={pad + 4} textAnchor="start">lat {latMax.toFixed(1)}°</text>
          <text x={14} y={H - pad - 4} textAnchor="start">lat {latMin.toFixed(1)}°</text>
        </g>
      </svg>
    </div>
  );
}

/* ========== 风险横幅 ========== */
function RiskBanner({ kind, level, title, text }) {
  const c = alertCSS(level);
  const icon = {
    altitude: <Mountain size={15} strokeWidth={1.9} />,
    fatigue:  <Clock size={15} strokeWidth={1.9} />,
    rest:     <Clock size={15} strokeWidth={1.9} />,
    weather:  <CloudRain size={15} strokeWidth={1.9} />,
  }[kind] || <AlertTriangle size={15} strokeWidth={1.9} />;
  return (
    <div className={`tr-risk ${c}`}>
      {icon}
      <span className={`tag ${alertTagClass(level)}`}>{title}</span>
      <span className="tr-risk-text">{text}</span>
    </div>
  );
}

/* ========== Segment 渲染：drive / scenic / fuel / anchor / risk ========== */
function DriveSeg({ leg }) {
  return (
    <div className="card card-pad tr-drive-card">
      <div className="tr-drive-head">
        <span className="tr-anchor-ic"><Compass size={15} strokeWidth={1.9} /></span>
        <b>{leg.from.name}</b>
        <span className="muted">→</span>
        <b>{leg.to.name}</b>
        <span className="tr-drive-spacer" />
        <span className="mono">{leg.distanceKm} km</span>
        <span className="mono">{Math.round(leg.durationMin/60*10)/10} h</span>
        {leg.estimated && <span className="tag tag-amber" title="QPS 限流时使用经纬度估算">估算值</span>}
      </div>
      <div className="muted tr-drive-sub">
        海拔 {leg.from.altitude}m → {leg.to.altitude}m
      </div>
      {leg.steps && leg.steps.length > 0 && (
        <details className="tr-drive-steps">
          <summary>查看导航步骤（{leg.steps.length} 步）</summary>
          <ol>
            {leg.steps.map((s, i) => (
              <li key={i}><span className="mono tr-step-min">{s.min}分</span> <ModeIcon mode={s.kind} size={11} /> {s.text}</li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}

function ScenicSeg({ s }) {
  return (
    <div className="card card-pad tr-scenic-card">
      <div className="tr-drive-head">
        <span className="tr-anchor-ic"><Sparkles size={15} strokeWidth={1.9} /></span>
        <b>{s.poi.name}</b>
        <span className="tr-drive-spacer" />
        <span className="tag tag-scenic">景区</span>
        <span className="mono">停留 {Math.round(s.stayMin/60*10)/10} h</span>
        <span className="mono">海拔 {s.poi.altitude}m</span>
      </div>
      {s.note && <div className="muted tr-anchor-note">{s.note}</div>}
    </div>
  );
}

function FuelSeg({ s }) {
  return (
    <div className="card card-pad tr-fuel-card">
      <div className="tr-drive-head">
        <span className="tr-anchor-ic"><Fuel size={15} strokeWidth={1.9} /></span>
        <b>{s.label}</b>
      </div>
      <div className="muted tr-anchor-note">{s.note}</div>
    </div>
  );
}

function AnchorSeg({ s }) {
  return (
    <div className="card card-pad tr-anchor-card">
      <div className="tr-anchor-head">
        <span className="tr-anchor-ic"><Hotel size={15} strokeWidth={1.9} /></span>
        <b>{s.poi.name}</b>
        <span className="mono tr-anchor-time">{s.label}</span>
      </div>
      {s.poi.note && <div className="muted tr-anchor-note">{s.poi.note}</div>}
    </div>
  );
}

/* 把 stop 列表 + 前后 leg 合并成长轴（交替插入 leg 与 stop） */
function buildTimeline(day) {
  const out = [];
  // stop 顺序与 legs 对应： stops[0] 起点; then leg0→stops[1]; ... legs[-1]→stops[-1]
  for (let i = 0; i < (day.stops?.length || 0); i++) {
    const s = day.stops[i];
    // 如果前面还有 leg，先插 leg (i > 0 才插, stop 0 是起点)
    if (i > 0 && day.legs?.[i - 1]) {
      out.push({ key: `leg-${i-1}`, kind: 'drive', data: day.legs[i - 1] });
    }
    if (s.type === 'scenic') out.push({ key: `s-${i}`, kind: 'scenic', data: s });
    else if (s.type === 'fuel') out.push({ key: `s-${i}`, kind: 'fuel', data: s });
    else if (s.type === 'anchor') out.push({ key: `s-${i}`, kind: 'anchor', data: s });
  }
  // alerts 作为 top-level，不进 timeline
  return out;
}

/* ========== 主组件 ========== */
/* 从 day.legs 派生 stops key 数组：所有 leg.from + 最后 leg.to（顺序即路线） */
function deriveStopKeysFromDay(day) {
  if (!day?.legs?.length) return [];
  const keys = day.legs.map(l => l.from.key);
  keys.push(day.legs.at(-1).to.key);
  return keys;
}

export default function TripsPage() {
  const [trip, setTrip] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dayIdx, setDayIdx] = useState(0);
  const [building, setBuilding] = useState(false);
  const [recalcDay, setRecalcDay] = useState(null);
  const [startDate, setStartDate] = useState('2026-09-26'); /* 用户指定：宽松 10 日 9月26日出发 */
  const [preset, setPreset] = useState('relaxed10');  /* 默认选宽松摩托 10 日 */
  const [templates, setTemplates] = useState([]);
  const [nearbyPOIs, setNearbyPOIs] = useState([]);
  const [loadingPOIs, setLoadingPOIs] = useState(false);
  const [savingStopKey, setSavingStopKey] = useState(null); /* poi.key 正在保存 */
  const { toasts, push } = useToast();

  /* 首次加载：先取模板列表 + 已有行程 */
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const [tpl, existing] = await Promise.allSettled([
        fetchTripTemplates().then(r => r.data).catch(() => []),
        fetchTrip().then(r => r.data).catch(() => null),
      ]);
      if (!alive) return;
      if (tpl.status === 'fulfilled') setTemplates(tpl.value || []);
      if (existing.status === 'fulfilled' && existing.value) setTrip(existing.value);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  /* 切换 Day 或 trip 变化 → 拉取附近景点候选 */
  useEffect(() => {
    if (!trip?.days?.length) { setNearbyPOIs([]); return; }
    const d = trip.days[dayIdx] || trip.days[0];
    if (!d) return;
    let alive = true;
    setLoadingPOIs(true);
    fetchTripDayPOIs(d.day, 50000)
      .then(r => { if (alive) setNearbyPOIs(r.data.items || []); })
      .catch(e => { if (alive) push('加载景点失败：' + e.message, 'error'); })
      .finally(() => { if (alive) setLoadingPOIs(false); });
    return () => { alive = false; };
  }, [trip?.id, dayIdx]);

  /* 勾选/取消 POI 到指定 Day 的 stops：插入到终点住宿前（或直接删除） */
  const toggleStop = async (poi, isAdd) => {
    if (!trip) return;
    const d = trip.days[dayIdx] || trip.days[0];
    if (!d) return;
    setSavingStopKey(poi.key);
    try {
      const keys = deriveStopKeysFromDay(d);
      let newStops = [...keys];
      if (isAdd) {
        // 动态 amap:* POI：把完整对象作为 stop 项提交，让后端自动登记
        if (poi.key.startsWith('amap:')) {
          if (!newStops.includes(poi.key)) {
            newStops.splice(Math.max(1, newStops.length - 1), 0, poi);
          }
        } else {
          if (!newStops.includes(poi.key)) {
            newStops.splice(Math.max(1, newStops.length - 1), 0, poi.key);
          }
        }
      } else {
        newStops = newStops.filter(k => (typeof k === 'string' ? k !== poi.key : k.key !== poi.key));
        if (newStops.length < 2) { push('至少保留起点 + 终点 2 个节点', 'error'); return; }
      }
      const r = await updateTripDayStops(d.day, newStops);
      setTrip(r.data);
      push(isAdd ? `已加入「${poi.name}」并重新计算路线` : `已移除「${poi.name}」并重新计算路线`);
      // 刷新 pois 的 inStops 标记（不必重新 fetch，服务端返回的 trip 有最新 stops，本地 nextTick 会触发上面 effect 重拉 pois 时自然刷新）
    } catch (e) {
      push('保存失败：' + e.message, 'error');
    } finally {
      setSavingStopKey(null);
    }
  };

  const onCreate = async () => {
    setBuilding(true);
    try {
      const r = await buildTrip({ startDate, preset });
      setTrip(r.data);
      setDayIdx(0);
      push(`行程已生成：${r.data.name}，共 ${r.data.totalDays} 天`);
    } catch (e) {
      push('生成失败：' + e.message, 'error');
    } finally {
      setBuilding(false);
    }
  };

  const onRecalcDay = async (n) => {
    setRecalcDay(n);
    try {
      const r = await recalcTripDay(n);
      setTrip(r.data);
      push(`第 ${n} 天已重算（最新路况/天气/风险）`);
    } catch (e) {
      push('重算失败：' + e.message, 'error');
    } finally {
      setRecalcDay(null);
    }
  };

  /* 行程视图派生数据（注意：必须位于所有 early-return 之前，遵守 Rules of Hooks） */
  const day = trip?.days?.[dayIdx] || trip?.days?.[0] || null;
  const alerts = useMemo(() => (day?.alerts || []), [day]);
  const timeline = useMemo(() => buildTimeline(day || {}), [day]);
  const scenicCount = trip ? trip.days.reduce((a, d) => a + (d.stops?.filter(s => s.type === 'scenic').length || 0), 0) : 0;
  const alertCount = trip ? trip.days.reduce((a, d) => a + (d.alerts?.length || 0), 0) : 0;
  const fuelCount = trip ? trip.days.reduce((a, d) => a + (d.stops?.filter(s => s.type === 'fuel').length || 0), 0) : 0;

  /* 未生成行程：显示「创建行程」落地页 */
  if (loading && !trip) {
    return (
      <div className="page">
        <Skeleton lines={3} />
        <Skeleton lines={5} />
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="page">
        <Toasts toasts={toasts} />
        <div className="card card-pad tr-empty">
          <div className="row">
            <span className="mode-badge mode-moto"><Bike size={18} strokeWidth={1.9} /></span>
            <div>
              <div className="tr-title">摩托自驾规划中心</div>
              <div className="muted tr-sub">当前还没有行程。选择模板、设置出发日期即可一键生成路线 + 天气 + 加油站 + 风险预警。</div>
            </div>
          </div>
          <div className="tr-empty-form">
            <label>可用模板：
              <select
                className="select"
                value={preset}
                onChange={(e) => {
                  const key = e.target.value;
                  setPreset(key);
                  const t = templates.find(x => x.key === key);
                  if (t?.recommendStartDate) setStartDate(t.recommendStartDate);
                }}
              >
                {templates.length > 0 ? templates.map(t => (
                  <option key={t.key} value={t.key}>
                    {t.name}（{t.defaultDays} 天 · {t.relaxed ? '摩托宽松节奏' : '紧凑经典'}）
                  </option>
                )) : (
                  <>
                    <option value="relaxed10">宽松青甘大环线 10 日（推荐摩托）</option>
                    <option value="classic7">经典青甘大环线 7 日</option>
                  </>
                )}
              </select>
            </label>
            <label>出发日期：
              <input type="date" className="input" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </label>
            <button
              type="button"
              className="btn btn-primary"
              disabled={building}
              onClick={onCreate}
            >
              {building ? <>
                <RefreshCw size={14} className="spin" strokeWidth={1.9} />
                规划中（约 30 秒，10 日行程 API 调用更多）
              </> : <>
                <Bike size={14} strokeWidth={1.9} />
                生成{preset === 'relaxed10' ? '青甘大环线 10 日宽松' : '青甘大环线 7 日经典'}行程
              </>}
            </button>
          </div>
          {templates.length > 0 && (() => {
            const t = templates.find(x => x.key === preset);
            if (!t) return null;
            return <div className="tr-empty-hint muted" style={{ marginTop: 6 }}><b>模板说明：</b>{t.description}</div>;
          })()}
          <div className="tr-empty-hint muted">
            <div><b>规划项说明：</b></div>
            <ul>
              <li>路线距离 & 时长：调用高德真实驾车路径（摩托沿用驾车数据）</li>
              <li>海拔 & 高反风险：基于青甘 30+ 核心 POI 的内置海拔表</li>
              <li>天气：每日终点城市真实天气（免费版 API 取今日 + 3 日预报）</li>
              <li>加油站：单程 leg &gt; 240km 自动插入加油提醒</li>
              <li>疲劳提醒：单日 &gt; 420km 或连续驾驶 &gt; 3h 提醒休息</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <Toasts toasts={toasts} />

      {/* 行程头卡 */}
      <div className="card card-pad tr-head">
        <div className="row">
          <span className="mode-badge mode-moto"><Bike size={18} strokeWidth={1.9} /></span>
          <div>
            <div className="tr-title">{trip.name}</div>
            <div className="muted tr-sub">{trip.startDate} → {trip.endDate} · {trip.totalDays} 天 · 模式 {trip.mode === 'motorcycle' ? '🏍️ 摩托自驾' : trip.mode}</div>
          </div>
        </div>
        <div className="tr-head-right">
          <span className="tag tag-blue">总里程 {trip.summary.totalKm} km</span>
          <span className="tag tag-green">驾驶 {trip.summary.drivingHours} h</span>
          <span className="tag tag-teal">景点 {scenicCount} 处</span>
          <span className="tag tag-amber">⛽ 加油 {fuelCount} 次</span>
          <span className="tag tag-red">⚠️ 风险 {alertCount} 条</span>
          <span className="tag tag-outline">最高海拔 {trip.summary.highestAlt} m</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onCreate} disabled={building}>
            <RefreshCw size={14} className={building ? 'spin' : ''} strokeWidth={1.9} />
            重建行程
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => push(`已推送：${trip.name} 出发提醒到 Bot`)}>
            <BellPlus size={14} strokeWidth={1.9} /> 通知我出发
          </button>
        </div>
      </div>

      {/* 统计摘要小卡 */}
      <div className="tr-summary">
        <div className="card card-pad tr-sum-item"><span className="muted">平均每日</span><b>{trip.summary.averageDailyKm} km</b></div>
        <div className="card card-pad tr-sum-item"><span className="muted">停留总时长</span><b>{trip.summary.stayHours} h</b></div>
        <div className="card card-pad tr-sum-item"><span className="muted">平均每日驾驶</span><b>{Math.round(trip.summary.drivingHours / trip.totalDays * 10)/10} h</b></div>
        <div className="card card-pad tr-sum-item"><span className="muted">创建时间</span><b className="mono">{new Date(trip.createdAt).toLocaleString('zh-CN')}</b></div>
      </div>

      {/* SVG 路线图（lng/lat 投影） */}
      <RouteMap trip={trip} />

      {/* 日分片 tabs */}
      <div className="tr-tabs">
        {trip.days.map((d, i) => {
          const hasSevere = (d.alerts || []).some(a => a.level === 'severe');
          const hasWarn = (d.alerts || []).some(a => a.level === 'warn');
          const week = weekdayZh[new Date(d.date).getDay()];
          return (
            <button
              key={d.date}
              type="button"
              className={`tr-tab ${i === dayIdx ? 'active' : ''}`}
              onClick={() => setDayIdx(i)}
            >
              <span className="tr-tab-top">
                <span className="mono tr-tab-date">{d.date}</span>
                <span className="tr-tab-week">{week}</span>
              </span>
              <span className="tr-tab-city">{d.title.replace(/^Day \d+ · /, '').slice(0, 24)}</span>
              <span className="tr-tab-sub">
                <span className="mono">{Math.round(d.totalKm)}km</span>
                <span className="mono">⛰{d.altitudePeak}m</span>
                {hasSevere && <span className="dot dot-red" title="严重风险" />}
                {hasWarn && !hasSevere && <span className="dot dot-amber" title="警告" />}
              </span>
            </button>
          );
        })}
      </div>

      {/* 当日 双栏：左=详情+时间轴 右=可选景点复选面板 */}
      {day && (
        <div className="tr-grid">
          <div className="tr-grid-main">
            {/* 当日总览 */}
            <div className="card card-pad tr-day-head">
              <div className="row row-start">
                <div>
                  <div className="tr-day-title"><CalendarDays size={17} /> {day.title}</div>
                  <div className="muted">主题：{day.theme || '—'}</div>
                </div>
                <div className="tr-day-right">
                  {day.weather && (
                    <div className="tr-weather">
                      <div className="tr-weather-top">
                        <Droplets size={14} /> {day.weather.city} · {day.weather.cond} · {day.weather.tempRange}
                      </div>
                      <div className="muted">{day.weather.wind} · 更新 {day.weather.updatedAt}</div>
                      {day.weather.impact && <div className="tr-weather-impact">{day.weather.impact}</div>}
                    </div>
                  )}
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => onRecalcDay(day.day)} disabled={recalcDay === day.day}>
                    <RefreshCw size={13} className={recalcDay === day.day ? 'spin' : ''} strokeWidth={1.9} />
                    重算当天
                  </button>
                </div>
              </div>
              <div className="tr-day-stats">
                <span><MapPin size={13} /> 出发 <b>{day.startCity?.name}</b> → 入住 <b>{day.endCity?.name}</b></span>
                <span><Compass size={13} /> 驾驶 <b>{Math.round(day.totalDriveMin/60*10)/10} h</b> · <b>{Math.round(day.totalKm)} km</b> · {day.legs.length} 段</span>
                <span><Clock size={13} /> 景区停留 <b>{Math.round(day.totalStayMin/60*10)/10} h</b></span>
                <span><Mountain size={13} /> 当日最高海拔 <b>{day.altitudePeak} m</b></span>
              </div>
              {day.legs?.length > 0 && (
                <div className="tr-alt-wrap">
                  <div className="muted tr-alt-label"><Mountain size={12} /> 今日海拔走向</div>
                  <AltitudeSparkline legs={day.legs} peak={day.altitudePeak} />
                </div>
              )}
            </div>

            {/* 当日风险 */}
            {alerts.length > 0 && (
              <div className="tr-risks">
                {alerts.map((a, i) => (
                  <RiskBanner key={i} kind={a.kind} level={a.level} title={a.title} text={a.text} />
                ))}
              </div>
            )}

            {/* 当日时间轴 */}
            <div className="tr-timeline">
              {timeline.map(({ key, kind, data }) => (
                <div key={key} className={`tr-tl-item tr-k-${kind}`}>
                  <span className="tr-dot" />
                  {kind === 'drive' && <DriveSeg leg={data} />}
                  {kind === 'scenic' && <ScenicSeg s={data} />}
                  {kind === 'fuel' && <FuelSeg s={data} />}
                  {kind === 'anchor' && <AnchorSeg s={data} />}
                </div>
              ))}
            </div>
          </div>

          {/* 右栏：景点选择器 */}
          <div className="tr-grid-side">
            <div className="card card-pad tr-poi-panel">
              <div className="row row-between">
                <div className="card-title"><Sparkles size={15} /> 第 {day.day} 天 · 周边景点</div>
                <span className="muted">{nearbyPOIs.length} 个 50km 内 · <span className="mono">高德</span></span>
              </div>

              {/* 当前行程 stops（可移除） */}
              <div className="tr-stops-cur">
                <div className="card-title-sm">行程中节点 <span className="muted">（共 {deriveStopKeysFromDay(day).length} 个）</span></div>
                <div className="tr-stop-chips">
                  {deriveStopKeysFromDay(day).length === 0 && <div className="muted">暂无节点</div>}
                  {deriveStopKeysFromDay(day).map((k, idx) => {
                    const keys = deriveStopKeysFromDay(day);
                    // 从 legs 派生原始 POI 对象（第 idx 个 = from），最后 idx=keys.length-1 用 leg[-1].to
                    let poi = null;
                    if (idx < day.legs.length) poi = day.legs[idx].from;
                    else poi = day.legs.at(-1)?.to;
                    const isAnchor = idx === 0 || idx === keys.length - 1;
                    if (!poi) return null;
                    return (
                      <div key={idx} className={`tr-stop-chip ${isAnchor ? 'anchor' : ''}`} title={poi.note || ''}>
                        <span className="tr-chip-idx">{idx + 1}</span>
                        <span className="tr-chip-name">{poi.name}</span>
                        {!isAnchor && (
                          <button
                            type="button"
                            className="btn btn-ghost btn-xs"
                            disabled={savingStopKey === poi.key}
                            onClick={() => toggleStop({ key: poi.key, name: poi.name }, false)}
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 景点列表 */}
              <div className="tr-poi-list">
                {loadingPOIs && <Skeleton lines={4} />}
                {!loadingPOIs && nearbyPOIs.length === 0 && <div className="muted">暂无周边景点</div>}
                {!loadingPOIs && nearbyPOIs.map(p => {
                  const inStops = p.inStops;
                  const busy = savingStopKey === p.key;
                  return (
                    <label key={p.key} className={`tr-poi-card ${inStops ? 'in-stops' : ''}`}>
                      <input
                        type="checkbox"
                        checked={!!inStops}
                        disabled={busy}
                        onChange={e => toggleStop(p, e.target.checked)}
                      />
                      <div className="tr-poi-photo">
                        {p.photos?.[0]
                          ? <img src={p.photos[0]} alt={p.name} loading="lazy" />
                          : <MapPin size={22} />}
                      </div>
                      <div className="tr-poi-body">
                        <div className="row row-between">
                          <div className="tr-poi-name">{p.name}{inStops && <span className="tr-tag">已加入</span>}</div>
                          <div className="tr-poi-price">{p.price ? `¥${p.price}` : '—'}</div>
                        </div>
                        <div className="tr-poi-meta">
                          {p.rating ? <span className="tr-rate">★ {p.rating}</span> : null}
                          <span className="mono">{p.distanceKm < 1 ? `${Math.round(p.distanceKm * 1000)}m` : `${p.distanceKm.toFixed(1)}km`}</span>
                          {p.source && <span className="tr-src">{p.source === 'ctrip' ? '携程' : p.source === 'ctrip_mock' ? '携程示例' : p.source === 'built-in' ? '内置' : '高德'}</span>}
                        </div>
                        {p.note && <div className="muted tr-poi-note">{p.note}</div>}
                      </div>
                    </label>
                  );
                })}
              </div>

              <div className="tr-poi-tip muted">提示：勾选会插入到「今日住宿前」，取消会从节点中移除。调整后自动重算里程/海拔/风险。</div>
            </div>
          </div>
        </div>
      )}

      {/* 模块说明 */}
      <div className="card card-pad tr-about">
        <div className="card-title">摩托自驾规划模块 · 青甘大环线 7 日模板</div>
        <div className="tr-feats">
          <div className="tr-feat">
            <span className="tr-feat-ic"><Compass size={15} /></span>
            <h4>真实路线</h4>
            <p className="muted">7 天 26+ 段 driving 基于高德驾车路线；QPS 限流时自动用 Haversine × 1.25 估算兜底。</p>
          </div>
          <div className="tr-feat">
            <span className="tr-feat-ic"><Mountain size={15} /></span>
            <h4>海拔 & 高反</h4>
            <p className="muted">青甘 30+ 核心 POI 海拔表；3000m 轻度 / 3800m 严重分档预警；SVG 海拔趋势图。</p>
          </div>
          <div className="tr-feat">
            <span className="tr-feat-ic"><Droplets size={15} /></span>
            <h4>天气 & 风力</h4>
            <p className="muted">每日终点城市真实天气；雨雪/≥4 级风自动插入骑行安全警告。</p>
          </div>
          <div className="tr-feat">
            <span className="tr-feat-ic"><Fuel size={15} /></span>
            <h4>加油站检测</h4>
            <p className="muted">单段 leg 超过 240km（半箱油安全阈值）插入加油提醒；Day6 Day7 长距离会自动提示。</p>
          </div>
          <div className="tr-feat">
            <span className="tr-feat-ic"><AlertTriangle size={15} /></span>
            <h4>疲劳风险</h4>
            <p className="muted">单日 &gt; 420km → 疲劳预警；连续驾驶 &gt; 3h → 建议休息；一键按日「重算」刷新路况。</p>
          </div>
          <div className="tr-feat">
            <span className="tr-feat-ic"><CalendarDays size={15} /></span>
            <h4>可扩展模板</h4>
            <p className="muted">新增模板只要在 qingganPois.mjs 加一份 stops 序列，就能一键生成任意省份自驾行程。</p>
          </div>
        </div>
      </div>
    </div>
  );
}
