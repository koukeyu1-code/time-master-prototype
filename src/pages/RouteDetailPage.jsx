import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft, Navigation, AlertTriangle, CloudRain, Snowflake, Gauge,
  Footprints, TrainFront, Repeat,
} from 'lucide-react';
import ModeIcon, { MODE_LABEL } from '../components/ModeIcon';
import { useToast, Toasts, Skeleton } from '../components/Feedback';
import { fetchRouteDetail, fetchTodayPlan, fetchSettings, recalcTraffic } from '../api/client';
import { placeById } from '../mock/data';
import './RouteDetailPage.css';

const FACTORS = [
  { key: 'time', label: '时效' },
  { key: 'cost', label: '成本' },
  { key: 'park', label: '停车' },
  { key: 'scene', label: '场景' },
];

export default function RouteDetailPage() {
  const { legId } = useParams();
  const { toasts, push } = useToast();
  const [loading, setLoading] = useState(true);
  const [leg, setLeg] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [weather, setWeather] = useState(null);
  const [settings, setSettings] = useState(null);
  const [recalcing, setRecalcing] = useState(false);
  const [delta, setDelta] = useState(null);
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setNotFound(false);
    setLeg(null);
    setDelta(null);
    setResolved(false);
    Promise.all([fetchRouteDetail(legId), fetchTodayPlan(), fetchSettings()]).then(([r, t, s]) => {
      if (!live) return;
      if (r.code !== 0 || !r.data) setNotFound(true);
      else setLeg(r.data);
      setWeather(t.data.weather);
      setSettings(s.data);
      setLoading(false);
    });
    return () => { live = false; };
  }, [legId]);

  const onRecalc = async () => {
    setRecalcing(true);
    const r = await recalcTraffic(leg.id);
    setRecalcing(false);
    setDelta(r.data.trafficDeltaMin);
    push(r.data.note);
  };

  if (loading) {
    return (
      <div className="page">
        <Skeleton lines={3} />
        <Skeleton lines={5} />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="page">
        <div className="empty">
          未找到该通勤段
          <div style={{ marginTop: 14 }}>
            <Link to="/" className="btn btn-ghost btn-sm">返回今日路线</Link>
          </div>
        </div>
        <Toasts toasts={toasts} />
      </div>
    );
  }

  const fromAlias = placeById(leg.from)?.alias || '待定地点';
  const toAlias = placeById(leg.to)?.alias || '待定地点';
  const scoreRows = Object.entries(leg.scores || {})
    .map(([mode, s]) => ({ mode, ...s }))
    .sort((a, b) => b.total - a.total);
  const bestTotal = scoreRows[0]?.total;
  const stepsTotal = (leg.transitSteps || []).reduce((s, x) => s + x.min, 0);

  return (
    <div className="page">
      {/* 1) 顶部：返回 + 标题 + 操作 */}
      <Link to="/" className="rd-back"><ArrowLeft size={14} strokeWidth={2} />返回今日路线</Link>
      <div className="card card-pad">
        <div className="rd-head">
          <div>
            <div className="rd-title">{fromAlias} → {toAlias}</div>
            <div className="mono rd-sub">
              {leg.departAt
                ? `${leg.departAt} 出发 → ${leg.arriveAt} 到达 · ${leg.durationMin} 分钟`
                : leg.summary}
            </div>
          </div>
          <div className="rd-head-actions">
            {leg.reminder
              ? (leg.reminder.status === 'sent'
                ? <span className="tag tag-green">已推送 · {leg.reminder.channelLabel}</span>
                : <span className="tag tag-gray">待触发 · {leg.reminder.channelLabel}</span>)
              : <span className="tag tag-amber">地点待补全 · 提醒未生成</span>}
            {delta !== null && <span className="tag tag-amber">+{delta} 分钟（已按实时路况修正）</span>}
            <button
              className="btn btn-primary btn-sm"
              disabled={recalcing || !!leg.pending}
              onClick={onRecalc}
            >
              <Navigation size={14} strokeWidth={2} />
              {recalcing ? '重算中…' : '实时路况重算'}
            </button>
          </div>
        </div>
      </div>

      {/* 2) 交通方式多因子评分 */}
      <div className="section-title">
        交通方式多因子评分
        <span className="right">维度：时效 / 成本 / 停车便利 / 场景约束 · 按加权总分降序</span>
      </div>
      {scoreRows.length === 0 ? (
        <div className="empty">补全地点后自动生成多因子评分与路线方案</div>
      ) : (
        <div className="card card-pad">
          {scoreRows.map((r) => (
            <div key={r.mode} className="rd-score-wrap">
              <div className={`rd-score-row ${r.total === bestTotal ? 'best' : ''}`}>
                <div className="rd-score-main">
                  <ModeIcon mode={r.mode} />
                  <span style={{ fontWeight: 600, fontSize: 13.5 }}>{MODE_LABEL[r.mode]}</span>
                  {r.total === bestTotal && <span className="tag tag-blue">推荐</span>}
                </div>
                <div className="rd-score-factors">
                  {FACTORS.map((f) => (
                    <div key={f.key} className="rd-factor">
                      <span className="fl">{f.label}</span>
                      <span className="bar"><i style={{ width: `${r[f.key]}%` }} /></span>
                    </div>
                  ))}
                </div>
                <div className="rd-score-total">
                  <div className="num">{r.total}</div>
                  {(leg.alternatives || []).includes(r.mode) && (
                    <button
                      className="btn btn-sm btn-ghost"
                      style={{ marginTop: 4 }}
                      onClick={() => push(`已切换为${MODE_LABEL[r.mode]}（原型演示）`)}
                    >
                      切换
                    </button>
                  )}
                </div>
              </div>
              {r.penalty && (
                <div className="rd-penalty">
                  <AlertTriangle size={12} strokeWidth={2} />
                  {r.penalty}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 3) 换乘步骤 */}
      {leg.transitSteps?.length > 0 && (
        <>
          <div className="section-title">
            换乘步骤
            <span className="right">{leg.modeLabel} · 共 {stepsTotal} 分钟</span>
          </div>
          <div className="card card-pad">
            <div className="rd-steps">
              {leg.transitSteps.map((s, i) => (
                <div className="rd-step" key={i}>
                  <span className="rd-step-ic">
                    {s.kind === 'walk'
                      ? <Footprints size={16} strokeWidth={1.9} />
                      : s.kind === 'transfer'
                        ? <Repeat size={16} strokeWidth={1.9} />
                        : <TrainFront size={16} strokeWidth={1.9} />}
                  </span>
                  <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                    {s.kind === 'subway' && <span className="tag tag-teal">{s.line}</span>}
                    <span style={{ fontSize: 13.5 }}>{s.text}</span>
                  </div>
                  <span className="mono rd-step-min">{s.min} 分钟</span>
                </div>
              ))}
            </div>
            <div className="hr" />
            <div className="muted" style={{ fontSize: 12.5 }}>共 {stepsTotal} 分钟（步行 / 乘车 / 换乘合计）</div>
          </div>
        </>
      )}

      {/* 4) 为何这样推荐 */}
      <div className="section-title">为何这样推荐</div>
      <div className="card card-pad">
        <div className="rd-why-item">
          <span className="rd-why-ic"><CloudRain size={15} strokeWidth={1.9} /></span>
          <span>{weather.impact}</span>
        </div>
        <div className="rd-why-item">
          <span className="rd-why-ic"><Snowflake size={15} strokeWidth={1.9} /></span>
          <span>{settings.vehicles.moto.storageSeason.desc}</span>
        </div>
        <div className="rd-why-item">
          <span className="rd-why-ic"><Gauge size={15} strokeWidth={1.9} /></span>
          <span>
            当前权重：时效 {settings.weights.time} / 成本 {settings.weights.cost} / 停车 {settings.weights.parking}
            {'　'}<Link to="/settings">调整权重 →</Link>
          </span>
        </div>
      </div>

      {/* 5) 冲突预警 */}
      {leg.alert && (
        <>
          <div className="section-title">冲突预警</div>
          <div className={`card card-pad ${resolved ? '' : 'rd-alert'}`}>
            {resolved ? (
              <div className="row" style={{ gap: 8 }}>
                <span className="tag tag-green">已采纳调整</span>
                <span className="muted" style={{ fontSize: 12.5 }}>已按建议提前 15 分钟离场，后续方案已重排。</span>
              </div>
            ) : (
              <>
                <div className="rd-alert-head">
                  <AlertTriangle size={15} strokeWidth={2} />
                  {leg.alert.title}
                </div>
                <div className="rd-alert-msg">{leg.alert.message}</div>
                <ol className="rd-sugs">
                  {leg.alert.suggestions.slice(0, 3).map((s, i) => (
                    <li key={s.id}>
                      <span className="rd-sug-no">{i + 1}</span>
                      <span>{s.text}</span>
                    </li>
                  ))}
                </ol>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => {
                    setResolved(true);
                    push('已采纳：提前 15 分钟离场，方案已重排');
                  }}
                >
                  采纳第一条建议
                </button>
              </>
            )}
          </div>
        </>
      )}

      <Toasts toasts={toasts} />
    </div>
  );
}
