import { useEffect, useState } from 'react';
import {
  Car, Bike, Gauge, Coins, SquareParking, SlidersHorizontal, Timer,
  MessageSquare, BellRing, MessageSquareWarning, PhoneCall,
  RefreshCw, Webhook,
} from 'lucide-react';
import { fetchSettings, saveSettings, triggerSync } from '../api/client';
import { useToast, Toasts, Skeleton } from '../components/Feedback';
import './SettingsPage.css';

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

/* 决策权重滑块行 */
function WeightRow({ Icon, label, value, min = 0, max = 100, onChange }) {
  return (
    <div className="st-slider-row">
      <span className="st-slider-label">
        <Icon size={15} strokeWidth={1.9} />
        {label}
      </span>
      <input
        type="range"
        className="slider"
        min={min}
        max={max}
        value={value}
        style={{ '--fill': `${((value - min) / (max - min)) * 100}%` }}
        onChange={(e) => onChange(+e.target.value)}
      />
      <span className="mono st-slider-val">{value}</span>
    </div>
  );
}

function Switch({ checked, onChange }) {
  return (
    <label className="switch">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="track" />
    </label>
  );
}

export default function SettingsPage() {
  const { toasts, push } = useToast();
  const [s, setS] = useState(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    let live = true;
    fetchSettings().then((r) => {
      if (live) setS(r.data);
    });
    return () => { live = false; };
  }, []);

  /* 即改即存：本地 setState + saveSettings + toast */
  const apply = (mutate) => {
    const next = JSON.parse(JSON.stringify(s));
    mutate(next);
    setS(next);
    saveSettings(next);
    push('已保存');
  };

  const doSync = async () => {
    if (syncing) return;
    setSyncing(true);
    const r = await triggerSync();
    setSyncing(false);
    push(`同步完成：更新 ${r.data.synced} 条日程`);
  };

  if (!s) {
    return (
      <div className="page">
        <Skeleton lines={4} />
        <Skeleton lines={4} />
        <Skeleton lines={5} />
      </div>
    );
  }

  const { vehicles, weights, buffer, reminderLeadMin, notify, sync } = s;

  /* 封车季判定：from > to 表示跨年（11 月 – 次年 3 月） */
  const nowMonth = 8; // 原型锚定 2026-08
  const { storageSeason } = vehicles.moto;
  const inStorage = storageSeason.from <= storageSeason.to
    ? nowMonth >= storageSeason.from && nowMonth <= storageSeason.to
    : nowMonth >= storageSeason.from || nowMonth <= storageSeason.to;

  const NOTIFY_ROWS = [
    {
      key: 'bot', Icon: MessageSquare, badgeCls: 'mode-badge mode-transit',
      name: 'Bot 卡片', desc: '常规出发提醒',
      tag: <span className="tag tag-teal">默认</span>,
    },
    {
      key: 'appUrgent', Icon: BellRing, badgeCls: 'st-ic',
      name: '应用内加急', desc: '未读补推一次',
      tag: <span className="tag tag-green">免费 · 不限次</span>,
    },
    {
      key: 'smsUrgent', Icon: MessageSquareWarning, badgeCls: 'st-ic warn',
      name: '短信加急', desc: '仅即将迟到红色预警',
      tag: <span className="tag tag-red">消耗额度</span>,
    },
    {
      key: 'phoneUrgent', Icon: PhoneCall, badgeCls: 'st-ic gray',
      name: '电话加急', desc: '严重迟到场景',
      tag: <span className="tag tag-gray">默认关闭</span>,
    },
  ];

  const SYNC_MODES = [
    {
      key: 'polling', Icon: RefreshCw, name: '轮询模式',
      desc: '零暴露纯轮询，公网只出不进，适合无公网 IP 的 NAS',
    },
    {
      key: 'webhook', Icon: Webhook, name: 'Webhook 模式',
      desc: 'frp / Cloudflare Tunnel 单路径暴露 /webhook/feishu，秒级同步',
    },
  ];

  return (
    <div className="page">
      {/* 载具档案 */}
      <div className="card card-pad">
        <div className="card-title">
          <Car size={16} strokeWidth={1.9} />
          载具档案
          <span className="right">影响通勤方式候选集</span>
        </div>

        <div className="st-vehicle">
          <span className="mode-badge mode-car"><Car size={17} strokeWidth={1.9} /></span>
          <div className="st-vehicle-info">
            <b>私家车</b>
            <div className="muted">{vehicles.car.note}</div>
          </div>
          <Switch
            checked={vehicles.car.owned}
            onChange={(v) => apply((d) => { d.vehicles.car.owned = v; })}
          />
        </div>

        <div className="st-vehicle">
          <span className="mode-badge mode-moto"><Bike size={17} strokeWidth={1.9} /></span>
          <div className="st-vehicle-info">
            <b>摩托车</b>
            <div className="muted">{vehicles.moto.note}</div>
          </div>
          <Switch
            checked={vehicles.moto.owned}
            onChange={(v) => apply((d) => { d.vehicles.moto.owned = v; })}
          />
        </div>

        {vehicles.moto.owned && (
          <div className="st-sub">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <b>封车季</b>
              <Switch
                checked={storageSeason.enabled}
                onChange={(v) => apply((d) => { d.vehicles.moto.storageSeason.enabled = v; })}
              />
            </div>
            {storageSeason.enabled && (
              <div className="row">
                <select
                  className="select st-month"
                  value={storageSeason.from}
                  onChange={(e) => apply((d) => { d.vehicles.moto.storageSeason.from = +e.target.value; })}
                >
                  {MONTHS.map((m) => <option key={m} value={m}>{m} 月</option>)}
                </select>
                <span className="muted">至</span>
                <select
                  className="select st-month"
                  value={storageSeason.to}
                  onChange={(e) => apply((d) => { d.vehicles.moto.storageSeason.to = +e.target.value; })}
                >
                  {MONTHS.map((m) => <option key={m} value={m}>{m} 月</option>)}
                </select>
                {inStorage
                  ? <span className="tag tag-amber">当前在封车季</span>
                  : <span className="tag tag-green">当前在解禁期</span>}
              </div>
            )}
            <p className="muted" style={{ fontSize: 12.5 }}>{storageSeason.desc}</p>
          </div>
        )}
      </div>

      {/* 决策权重 */}
      <div className="card card-pad">
        <div className="card-title">
          <SlidersHorizontal size={16} strokeWidth={1.9} />
          决策权重
          <span className="right">0 – 100</span>
        </div>
        <WeightRow
          Icon={Gauge} label="时效" value={weights.time}
          onChange={(v) => apply((d) => { d.weights.time = v; })}
        />
        <WeightRow
          Icon={Coins} label="通勤成本" value={weights.cost}
          onChange={(v) => apply((d) => { d.weights.cost = v; })}
        />
        <WeightRow
          Icon={SquareParking} label="停车便利" value={weights.parking}
          onChange={(v) => apply((d) => { d.weights.parking = v; })}
        />
        <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>
          权重影响每段通勤的多因子综合评分，修改后次日方案生效。
        </p>
      </div>

      {/* 缓冲与提醒 */}
      <div className="card card-pad">
        <div className="card-title">
          <Timer size={16} strokeWidth={1.9} />
          缓冲与提醒
          <span className="right">设计 §5.2 缓冲策略</span>
        </div>
        <div className="row" style={{ padding: '6px 0' }}>
          <span style={{ fontWeight: 600, fontSize: 13.5 }}>默认缓冲</span>
          <input
            type="number"
            className="input"
            style={{ width: 100 }}
            min={0}
            max={60}
            value={buffer.defaultMin}
            onChange={(e) => apply((d) => { d.buffer.defaultMin = +e.target.value; })}
          />
          <span className="muted">分钟</span>
        </div>
        {buffer.byPlaceType.map((b) => (
          <div className="st-buffer-row" key={b.type}>
            <span className="tag tag-gray">{b.type}</span>
            <span className="mono">{b.min} 分钟</span>
          </div>
        ))}
        <hr className="hr" />
        <WeightRow
          Icon={BellRing} label="提醒提前量" value={reminderLeadMin} min={5} max={30}
          onChange={(v) => apply((d) => { d.reminderLeadMin = v; })}
        />
      </div>

      {/* 通知分层 */}
      <div className="card card-pad">
        <div className="card-title">
          <BellRing size={16} strokeWidth={1.9} />
          通知分层
          <span className="right">设计 §5.4 分层告警</span>
        </div>
        {NOTIFY_ROWS.map(({ key, Icon, badgeCls, name, desc, tag }) => (
          <div className="st-notify-row" key={key}>
            <span className={badgeCls}><Icon size={16} strokeWidth={1.9} /></span>
            <div className="st-notify-info">
              <div className="row" style={{ gap: 8 }}>
                <b>{name}</b>
                {tag}
              </div>
              <div className="muted">{desc}</div>
            </div>
            <Switch
              checked={notify[key]}
              onChange={(v) => apply((d) => { d.notify[key] = v; })}
            />
          </div>
        ))}

        <div className="st-quota">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <b>本月加急额度</b>
            <span className="mono">{notify.quota.used} / {notify.quota.total} 次</span>
          </div>
          <div className="st-quota-bar">
            <div
              className="st-quota-fill"
              style={{ width: `${(notify.quota.used / notify.quota.total) * 100}%` }}
            />
          </div>
          <p className="muted" style={{ fontSize: 12.5 }}>
            基础版认证租户 · 每月 {notify.quota.total} 次免费 · {notify.quota.resetAt} 重置
          </p>
        </div>
      </div>

      {/* 日历同步模式 */}
      <div className="card card-pad">
        <div className="card-title">
          <RefreshCw size={16} strokeWidth={1.9} />
          日历同步模式
          <span className="right">上次同步 {sync.lastSyncAt}</span>
        </div>
        <div className="grid-2">
          {SYNC_MODES.map(({ key, Icon, name, desc }) => {
            const on = sync.mode === key;
            return (
              <div
                key={key}
                className={`st-sync-card ${on ? 'on' : ''}`}
                onClick={() => {
                  if (on) return;
                  const next = JSON.parse(JSON.stringify(s));
                  next.sync.mode = key;
                  setS(next);
                  saveSettings(next);
                  push('已切换同步模式（原型演示）');
                }}
              >
                <div className="row" style={{ gap: 8 }}>
                  <Icon size={16} strokeWidth={1.9} style={{ color: 'var(--accent)' }} />
                  <b>{name}</b>
                  {on
                    ? <span className="tag tag-blue">当前使用</span>
                    : <span className="tag tag-gray">可选</span>}
                </div>
                <p className="muted" style={{ fontSize: 12.5 }}>{desc}</p>
                {key === 'polling' && (
                  <div className="row" onClick={(e) => e.stopPropagation()}>
                    <span className="muted" style={{ fontSize: 12.5 }}>同步间隔</span>
                    <select
                      className="select st-interval"
                      value={sync.intervalMin}
                      onChange={(e) => apply((d) => { d.sync.intervalMin = +e.target.value; })}
                    >
                      <option value={5}>5 分钟</option>
                      <option value={10}>10 分钟</option>
                    </select>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 14 }}>
          <button className="btn btn-ghost" onClick={doSync} disabled={syncing}>
            <RefreshCw size={14} strokeWidth={1.9} className={syncing ? 'st-spin' : ''} />
            {syncing ? '同步中…' : '立即全量同步'}
          </button>
        </div>
      </div>

      <Toasts toasts={toasts} />
    </div>
  );
}
