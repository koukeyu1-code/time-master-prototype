import { useEffect, useState } from 'react';
import {
  TrainTrack, AlertTriangle, BellRing, BellPlus, Hotel, MapPin, CalendarDays,
} from 'lucide-react';
import ModeIcon from '../components/ModeIcon';
import { useToast, Toasts, Skeleton } from '../components/Feedback';
import { fetchTrip } from '../api/client';
import './TripsPage.css';

/* 风险横幅：风险汇总条与时间轴内嵌 alert 段共用（danger 红 / warning 琥珀） */
function RiskBanner({ date, level, text }) {
  const danger = level === 'danger';
  return (
    <div className={`tr-risk ${danger ? 'danger' : 'warning'}`}>
      <AlertTriangle size={15} strokeWidth={1.9} />
      <span className={`tag ${danger ? 'tag-red' : 'tag-amber'}`}>{danger ? '风险' : '提示'}</span>
      {date && <span className="mono tr-risk-date">{date}</span>}
      <span className="tr-risk-text">{text}</span>
    </div>
  );
}

/* 时间轴单个 segment：rail 大卡 / anchor 浅蓝卡 / event 普通卡 / alert 内嵌横幅 */
function Segment({ seg }) {
  if (seg.kind === 'rail') {
    return (
      <div className="card card-pad tr-rail-card">
        <div className="tr-rail-main">
          <span className="tag tag-rail">城际段 · 仅标注衔接</span>
          <span className="mono tr-train">{seg.train}</span>
          <span className="tr-route"><b>{seg.from}</b> → <b>{seg.to}</b></span>
          <span className="mono tr-rail-time">{seg.depart} – {seg.arrive}</span>
        </div>
        <div className="muted tr-conn">
          <BellRing size={13} strokeWidth={1.9} />
          <span>{seg.conn}</span>
        </div>
      </div>
    );
  }
  if (seg.kind === 'anchor') {
    return (
      <div className="card card-pad tr-anchor-card">
        <div className="tr-anchor-head">
          <span className="tr-anchor-ic"><Hotel size={15} strokeWidth={1.9} /></span>
          <b>{seg.name}</b>
          <span className="mono tr-anchor-time">{seg.time}</span>
        </div>
        {seg.note && <div className="muted tr-anchor-note">{seg.note}</div>}
      </div>
    );
  }
  if (seg.kind === 'alert') {
    return <RiskBanner level={seg.level} text={seg.text} />;
  }
  return (
    <div className="card card-pad">
      <div className="tr-ev-head">
        <span className="mono tr-ev-time">{seg.time}</span>
        <b className="tr-ev-title">{seg.title}</b>
      </div>
      <div className="muted tr-ev-line">
        <MapPin size={13} strokeWidth={1.9} />
        <span>{seg.place}</span>
      </div>
      <div className="muted tr-ev-line tr-commute">
        <ModeIcon mode={seg.mode} size={11} />
        <span>{seg.conn}</span>
      </div>
    </div>
  );
}

export default function TripsPage() {
  const [trip, setTrip] = useState(null);
  const [dayIdx, setDayIdx] = useState(0);
  const { toasts, push } = useToast();

  useEffect(() => {
    let alive = true;
    fetchTrip().then((res) => { if (alive) setTrip(res.data); });
    return () => { alive = false; };
  }, []);

  if (!trip) {
    return (
      <div className="page">
        <Skeleton lines={3} />
        <Skeleton lines={4} />
      </div>
    );
  }

  const allSegs = trip.days.flatMap((d) => d.segments.map((s) => ({ ...s, date: d.date })));
  const railCount = allSegs.filter((s) => s.kind === 'rail').length;
  const dangerCount = allSegs.filter((s) => s.kind === 'alert' && s.level === 'danger').length;
  const anchorCount = allSegs.filter((s) => s.kind === 'anchor' && (s.note || '').includes('住宿锚点')).length;
  const alerts = allSegs.filter((s) => s.kind === 'alert');
  const day = trip.days[dayIdx] || trip.days[0];

  return (
    <div className="page">
      <Toasts toasts={toasts} />

      {/* 行程头卡 */}
      <div className="card card-pad tr-head">
        <div className="row">
          <span className="mode-badge mode-rail"><TrainTrack size={17} strokeWidth={1.9} /></span>
          <div>
            <div className="tr-title">{trip.title}</div>
            <div className="muted tr-sub">{trip.range} · {trip.days.length} 天</div>
          </div>
        </div>
        <div className="tr-head-right">
          <span className="tag tag-blue">城际 {railCount} 段</span>
          <span className="tag tag-amber">衔接风险 {dangerCount} 条</span>
          <span className="tag tag-teal">住宿锚点 {anchorCount} 处</span>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => push('已注册：09-15 07:35 出发提醒 · Bot 卡片')}
          >
            <BellPlus size={14} strokeWidth={1.9} />
            通知我去程提醒
          </button>
        </div>
      </div>

      {/* 风险汇总条 */}
      {alerts.length > 0 && (
        <div className="tr-risks">
          {alerts.map((a, i) => (
            <RiskBanner key={`${a.date}-${i}`} date={a.date} level={a.level} text={a.text} />
          ))}
        </div>
      )}

      {/* 天分片 Tabs */}
      <div className="tr-tabs">
        {trip.days.map((d, i) => (
          <button
            key={d.date}
            type="button"
            className={`tr-tab ${i === dayIdx ? 'active' : ''}`}
            onClick={() => setDayIdx(i)}
          >
            <span className="tr-tab-top">
              <span className="mono tr-tab-date">{d.date}</span>
              <span className="tr-tab-week">{d.weekday}</span>
            </span>
            <span className="tr-tab-city">{d.city}</span>
          </button>
        ))}
      </div>

      {/* 选中天 segment 时间轴 */}
      <div className="tr-timeline">
        {day.segments.map((seg, i) => (
          <div key={i} className={`tr-tl-item tr-k-${seg.kind}${seg.level ? ` tr-lv-${seg.level}` : ''}`}>
            <span className="tr-dot" />
            <Segment seg={seg} />
          </div>
        ))}
      </div>

      {/* 模块说明卡 */}
      <div className="card card-pad tr-about">
        <div className="card-title">差旅模块 · P2</div>
        <div className="tr-feats">
          <div className="tr-feat">
            <span className="tr-feat-ic"><CalendarDays size={15} strokeWidth={1.9} /></span>
            <h4>按天分片</h4>
            <p className="muted">多日行程逐日生成方案，日期间独立成页。</p>
          </div>
          <div className="tr-feat">
            <span className="tr-feat-ic"><TrainTrack size={15} strokeWidth={1.9} /></span>
            <h4>城际段识别</h4>
            <p className="muted">高铁/航班自动标记为城际段，只标注衔接时间，不做市内换乘。</p>
          </div>
          <div className="tr-feat">
            <span className="tr-feat-ic"><Hotel size={15} strokeWidth={1.9} /></span>
            <h4>住宿锚点</h4>
            <p className="muted">酒店作为每日路线起终点，衔接风险提前预警。</p>
          </div>
        </div>
      </div>
    </div>
  );
}
