import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { CalendarClock, MapPin, Plane, Settings, Clock3, CloudRain, CheckCircle2 } from 'lucide-react';
import { weather, settings } from '../mock/data';

/* 冻结的导航项（顺序/图标/路径不得更改） */
const NAV = [
  { to: '/', label: '今日路线', Icon: CalendarClock, end: true },
  { to: '/places', label: '地点与别名', Icon: MapPin },
  { to: '/trips', label: '差旅规划', Icon: Plane },
  { to: '/settings', label: '偏好设置', Icon: Settings },
];

const TITLES = [
  { match: /^\/route\//, title: '路线详情' },
  { match: /^\/places/, title: '地点与别名' },
  { match: /^\/trips/, title: '差旅规划' },
  { match: /^\/settings/, title: '偏好设置' },
  { match: /^\//, title: '今日路线' },
];

export default function Layout() {
  const { pathname } = useLocation();
  const title = TITLES.find((t) => t.match.test(pathname))?.title || '今日路线';

  return (
    <>
      <aside className="shell-nav">
        <div className="shell-brand">
          <div className="logo"><Clock3 size={20} strokeWidth={2} /></div>
          <div>
            <div className="name">时间管理大师</div>
            <div className="sub">Time Master</div>
          </div>
        </div>
        <nav className="shell-menu">
          <div className="label">工作台</div>
          {NAV.map(({ to, label, Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? 'active' : '')}>
              <Icon size={17} strokeWidth={1.8} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="shell-sync">
          <div className="row">
            <span className="dot" />
            <span>日历同步 · 轮询 {settings.sync.intervalMin} 分钟</span>
          </div>
          <div className="time">上次同步 {settings.sync.lastSyncAt} · 事件 6 条</div>
        </div>
      </aside>

      <div className="shell-main">
        <header className="shell-topbar">
          <div className="page-title">{title}</div>
          <div className="topbar-chip" style={{ color: 'var(--faint)' }}>
            {weather.weekday} · {weather.date}
          </div>
          <div className="spacer" />
          <div className="topbar-chip">
            <CloudRain size={14} strokeWidth={1.8} />
            <span>{weather.city} {weather.cond} <b>{weather.tempNow}°</b> · 降水 {weather.rainProb}%</span>
          </div>
          <div className="topbar-chip" style={{ color: 'var(--success)', borderColor: 'rgba(5,150,105,.3)' }}>
            <CheckCircle2 size={14} strokeWidth={1.8} />
            <span>飞书已连接</span>
          </div>
          <div className="topbar-avatar">JK</div>
        </header>
        <main className="shell-content">
          <Outlet />
        </main>
      </div>
    </>
  );
}
