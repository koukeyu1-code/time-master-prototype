import { Fragment, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CalendarCheck, Route as RouteIcon, Timer, AlertTriangle, MapPin, Home,
  ChevronRight, CloudRain, BellRing,
} from 'lucide-react';
import ModeIcon from '../components/ModeIcon';
import { useToast, Toasts, Skeleton } from '../components/Feedback';
import { fetchTodayPlan, fetchPendingLocations, fetchPlaces } from '../api/client';
import { placeById, eventById } from '../mock/data';
import './TodayPage.css';

const stayMin = (ev) => {
  const [sh, sm] = ev.start.split(':').map(Number);
  const [eh, em] = ev.end.split(':').map(Number);
  return eh * 60 + em - (sh * 60 + sm);
};

/* 事件锚点卡：mono 时间 + 标题 + 地点行 + 停留时长 */
function AnchorCard({ ev }) {
  return (
    <div className="today-tl-item">
      <span className="today-dot today-dot-event" />
      <div className="card today-anchor">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="mono today-anchor-time">{ev.start} – {ev.end}</span>
          <span className="row" style={{ gap: 6 }}>
            {ev.status === 'pending' && <span className="tag tag-amber">地点待补全</span>}
            {ev.bufferMin ? <span className="tag tag-red">缓冲 {ev.bufferMin} 分钟</span> : null}
          </span>
        </div>
        <div className="today-anchor-title">{ev.title}</div>
        <div className="today-anchor-loc">
          <MapPin size={14} strokeWidth={1.8} />
          <span>{ev.locationRaw || '地点未填写'}</span>
        </div>
        <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>停留 {stayMin(ev)} 分钟</div>
      </div>
    </div>
  );
}

export default function TodayPage() {
  const nav = useNavigate();
  const { toasts, push } = useToast();
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState(null);
  const [weather, setWeather] = useState(null);
  const [events, setEvents] = useState([]);
  const [pendings, setPendings] = useState([]);
  const [places, setPlaces] = useState([]);
  const [selected, setSelected] = useState(null);
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    let live = true;
    Promise.all([fetchTodayPlan(), fetchPendingLocations(), fetchPlaces()]).then(([p, pd, pl]) => {
      if (!live) return;
      setPlan(p.data.plan);
      setWeather(p.data.weather);
      setEvents(p.data.events);
      setPendings(pd.data);
      setPlaces(pl.data);
      setLoading(false);
    });
    return () => { live = false; };
  }, []);

  const legs = useMemo(() => plan?.legs || [], [plan]);
  const validLegs = legs.filter((l) => !l.pending);
  const pendingLegs = legs.filter((l) => l.pending);
  const totalMin = validLegs.reduce((s, l) => s + l.durationMin, 0);
  const alertCount = legs.filter((l) => l.alert).length;
  const lastSent = validLegs
    .filter((l) => l.reminder?.status === 'sent')
    .sort((a, b) => b.reminder.triggerAt.localeCompare(a.reminder.triggerAt))[0];

  /* 地图路线段：正常段 / 冲突段 / 待补全段（pending 两段合并为 sbux→office 一条示意线） */
  const segs = useMemo(() => {
    if (!plan) return [];
    const out = [];
    legs.forEach((leg) => {
      if (leg.pending) return;
      const f = placeById(leg.from);
      const t = placeById(leg.to);
      if (f && t) out.push({ id: leg.id, x1: f.mapX, y1: f.mapY, x2: t.mapX, y2: t.mapY, alert: !!leg.alert });
    });
    const pf = placeById(legs.find((l) => l.pending && l.from)?.from);
    const pt = placeById(legs.find((l) => l.pending && l.to)?.to);
    if (pf && pt) out.push({ id: 'pending', x1: pf.mapX, y1: pf.mapY, x2: pt.mapX, y2: pt.mapY, pending: true });
    return out;
  }, [plan, legs]);

  if (loading) {
    return (
      <div className="page">
        <Skeleton lines={3} />
        <Skeleton lines={5} />
      </div>
    );
  }

  return (
    <div className="page">
      {/* 1) 统计条 */}
      <div className="stat-grid">
        <div className="stat">
          <span className="ic" style={{ background: 'rgba(37,99,235,.1)', color: 'var(--accent)' }}>
            <CalendarCheck size={19} strokeWidth={1.9} />
          </span>
          <div>
            <div className="k">今日日程</div>
            <div className="v">{events.length}<small>场</small></div>
          </div>
        </div>
        <div className="stat">
          <span className="ic" style={{ background: 'rgba(13,148,136,.1)', color: 'var(--accent2)' }}>
            <RouteIcon size={19} strokeWidth={1.9} />
          </span>
          <div>
            <div className="k">有效通勤</div>
            <div className="v">{validLegs.length}<small>段</small></div>
          </div>
        </div>
        <div className="stat">
          <span className="ic" style={{ background: 'rgba(217,119,6,.1)', color: 'var(--warning)' }}>
            <Timer size={19} strokeWidth={1.9} />
          </span>
          <div>
            <div className="k">总通勤</div>
            <div className="v">{Math.floor(totalMin / 60)}<small>小时</small> {totalMin % 60}<small>分</small></div>
          </div>
        </div>
        <div className="stat">
          <span className="ic" style={{ background: 'rgba(220,38,38,.1)', color: 'var(--danger)' }}>
            <AlertTriangle size={19} strokeWidth={1.9} />
          </span>
          <div>
            <div className="k">冲突预警</div>
            <div className="v">{alertCount}<small>条</small></div>
          </div>
        </div>
      </div>

      {/* 2) 待补全提醒横幅 */}
      {pendings.length > 0 && (
        <div className="today-banner">
          <span className="today-banner-ic"><AlertTriangle size={18} strokeWidth={1.9} /></span>
          <div style={{ flex: 1, fontSize: 13.5 }}>
            <b>「{pendings[0].title}」（{pendings[0].time}）地点缺失</b>
            <span className="muted"> — 导致 {pendingLegs.length} 段通勤无法生成，补全后自动重排方案。</span>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => nav('/places')}>去补全</button>
        </div>
      )}

      {/* 3) 主区双栏 */}
      <div className="today-grid">
        {/* 左栏：今日时间轴 */}
        <div className="card card-pad">
          <div className="card-title">
            今日时间轴
            <span className="right">{plan.date} · 方案生成于 {plan.generatedAt}</span>
          </div>
          <div className="today-timeline">
            {/* 起点 */}
            <div className="today-tl-item">
              <span className="today-dot today-dot-home" />
              <div className="card today-endpoint">
                <Home size={15} strokeWidth={1.9} />
                家 · {validLegs[0]?.departAt} 出发
              </div>
            </div>

            {legs.map((leg) => {
              const ev = leg.eventId ? eventById(leg.eventId) : null;
              return (
                <Fragment key={leg.id}>
                  {leg.pending ? (
                    /* 待补全段 */
                    <div className="today-tl-item">
                      <span className="today-dot today-dot-pending" />
                      <div className="card card-pad today-leg-pending">
                        <div className="row" style={{ justifyContent: 'space-between' }}>
                          <b style={{ fontSize: 13.5 }}>通勤段待生成</b>
                          <span className="tag tag-amber">待补全</span>
                        </div>
                        <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>{leg.summary}</div>
                      </div>
                    </div>
                  ) : (
                    /* 正常段 / 冲突段 */
                    <div className="today-tl-item">
                      <span className={`today-dot ${leg.alert && !resolved ? 'today-dot-alert' : 'today-dot-leg'}`} />
                      <div
                        className={`card card-pad today-leg ${selected === leg.id ? 'selected' : ''} ${leg.alert && !resolved ? 'today-leg-alert' : ''}`}
                        onClick={() => setSelected(leg.id)}
                        onDoubleClick={() => nav(`/route/${leg.id}`)}
                      >
                        <ChevronRight size={16} className="today-leg-chev" />
                        <div className="today-leg-head">
                          <ModeIcon mode={leg.mode} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div className="today-leg-title">{leg.modeLabel} · {leg.durationMin} 分钟</div>
                            <div className="muted" style={{ fontSize: 12.5 }}>{leg.summary}</div>
                          </div>
                          {leg.reminder && (leg.reminder.status === 'sent'
                            ? <span className="tag tag-green">已推送 · {leg.reminder.channelLabel}</span>
                            : <span className="tag tag-gray">待触发 · {leg.reminder.channelLabel}</span>)}
                          <button
                            className="btn btn-sm btn-ghost"
                            onClick={(e) => { e.stopPropagation(); nav(`/route/${leg.id}`); }}
                          >
                            详情
                          </button>
                        </div>
                        <div className="mono today-leg-time">{leg.departAt} 出发 → {leg.arriveAt} 到达</div>

                        {leg.alert && (resolved ? (
                          <div className="today-alert" style={{ borderTopColor: 'rgba(5,150,105,.2)' }}>
                            <div className="row" style={{ gap: 8 }}>
                              <span className="tag tag-green">已采纳调整</span>
                              <span className="muted" style={{ fontSize: 12.5 }}>已按建议提前 15 分钟离场，后续方案已重排。</span>
                            </div>
                          </div>
                        ) : (
                          <div className="today-alert">
                            <div className="today-alert-head">
                              <AlertTriangle size={15} strokeWidth={2} />
                              {leg.alert.title}
                            </div>
                            <div className="today-alert-msg">{leg.alert.message}</div>
                            <ol className="today-alert-sugs">
                              {leg.alert.suggestions.slice(0, 3).map((s, i) => (
                                <li key={s.id}>
                                  <span className="today-sug-no">{i + 1}</span>
                                  <span>{s.text}</span>
                                </li>
                              ))}
                            </ol>
                            <button
                              className="btn btn-primary btn-sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setResolved(true);
                                push('已采纳：提前 15 分钟离场，方案已重排');
                              }}
                            >
                              采纳第一条建议
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {ev && <AnchorCard ev={ev} />}
                </Fragment>
              );
            })}

            {/* 终点 */}
            <div className="today-tl-item">
              <span className="today-dot today-dot-home" />
              <div className="card today-endpoint">
                <Home size={15} strokeWidth={1.9} />
                家 · 预计 {validLegs[validLegs.length - 1]?.arriveAt} 到家
              </div>
            </div>
          </div>
        </div>

        {/* 右栏 */}
        <div className="today-side">
          {/* 4) 模拟地图 */}
          <div className="card card-pad">
            <div className="card-title">
              模拟地图
              <span className="right">点击左侧通勤段联动高亮</span>
            </div>
            <div className="today-map">
              <svg viewBox="0 0 520 420">
                <rect x="0" y="0" width="520" height="420" rx="12" fill="#eef3f9" />
                {Array.from({ length: 13 }).map((_, i) => (
                  <line key={`v${i}`} x1={i * 40} y1={0} x2={i * 40} y2={420} stroke="#e2eaf3" strokeWidth="1" />
                ))}
                {Array.from({ length: 11 }).map((_, i) => (
                  <line key={`h${i}`} x1={0} y1={i * 40} x2={520} y2={i * 40} stroke="#e2eaf3" strokeWidth="1" />
                ))}
                {/* 抽象道路 */}
                <polyline points="-10,150 130,140 250,190 530,165" fill="none" stroke="#ffffff" strokeWidth="10" strokeLinecap="round" />
                <polyline points="70,-10 95,190 55,430" fill="none" stroke="#ffffff" strokeWidth="10" strokeLinecap="round" />
                <polyline points="-10,325 210,300 400,365 530,345" fill="none" stroke="#ffffff" strokeWidth="10" strokeLinecap="round" />
                <polyline points="305,-10 325,150 300,430" fill="none" stroke="#ffffff" strokeWidth="10" strokeLinecap="round" />
                {/* 路线段 */}
                {segs.map((s) => {
                  const isSel = selected === s.id;
                  const isAlert = s.alert && !resolved;
                  return (
                    <line
                      key={s.id}
                      x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2}
                      stroke={s.pending ? '#b6c3d6' : isAlert ? 'var(--danger)' : 'var(--accent)'}
                      strokeWidth={isSel ? 5.5 : 3.5}
                      strokeDasharray={s.pending ? '3 5' : isAlert ? '7 5' : undefined}
                      strokeLinecap="round"
                      opacity={selected ? (isSel ? 1 : 0.35) : s.pending ? 0.85 : 1}
                    />
                  );
                })}
                {/* 地点 */}
                {places.map((p) => (
                  <g key={p.id}>
                    <circle
                      cx={p.mapX} cy={p.mapY}
                      r={p.alias === '家' ? 7 : 6}
                      fill={p.alias === '家' ? 'var(--accent2)' : 'var(--accent)'}
                      stroke="#fff" strokeWidth="2"
                    />
                    <text x={p.mapX} y={p.mapY + 20} textAnchor="middle" fontSize="12" fill="#5b6b84">{p.alias}</text>
                  </g>
                ))}
              </svg>
            </div>
            <div className="today-legend">
              <span className="item"><i className="sw" />推荐路线</span>
              <span className="item"><i className="sw alert" />冲突段</span>
              <span className="item"><i className="sw pending" />待补全</span>
            </div>
          </div>

          {/* 5) 飞书 Bot 卡片预览 */}
          {lastSent && (
            <div className="card today-bot">
              <div className="today-bot-head">
                <BellRing size={14} strokeWidth={2} />
                时间管理大师 · 出发提醒
              </div>
              <div className="today-bot-body">
                <div className="today-bot-title">{lastSent.departAt} 请出发前往 {placeById(lastSent.to)?.alias}</div>
                <div className="today-bot-sum">{lastSent.modeLabel} {lastSent.durationMin} 分钟 · {lastSent.summary}</div>
                <div className="today-bot-weather">
                  <CloudRain size={13} strokeWidth={1.8} />
                  {weather.cond} · 建议带伞
                </div>
              </div>
              <div className="today-bot-foot">
                <span>{lastSent.reminder.triggerAt} {lastSent.reminder.statusLabel} · 未读将应用内加急补推</span>
                <button className="btn btn-subtle btn-sm" onClick={() => nav(`/route/${lastSent.id}`)}>查看完整路线</button>
              </div>
            </div>
          )}
          <button
            className="btn btn-ghost"
            style={{ width: '100%', justifyContent: 'center' }}
            onClick={() => push('下一条提醒 15:00 触发 · 短信加急（红色预警）')}
          >
            模拟触发下一条提醒
          </button>
        </div>
      </div>

      <Toasts toasts={toasts} />
    </div>
  );
}
