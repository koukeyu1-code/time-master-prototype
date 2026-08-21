import { Fragment, useEffect, useState } from 'react';
import {
  FileText, ScanSearch, BookMarked, PenLine, ChevronRight,
  Sparkles, Search, Check, CheckCircle2, MapPin,
} from 'lucide-react';
import { fetchPendingLocations, completeLocation, fetchPlaces } from '../api/client';
import { useToast, Toasts, Skeleton } from '../components/Feedback';
import './PlacesPage.css';

/* 地点解析流程四步说明（静态说明文案，非业务数据） */
const FLOW = [
  { Icon: FileText, title: '读取日程 location 字段', desc: '日程自带地点文本' },
  { Icon: ScanSearch, title: '标题 / 描述提取', desc: '从「与 XX 在 YY」中提取' },
  { Icon: BookMarked, title: '别名库自动命中', desc: '确认一次终身复用' },
  { Icon: PenLine, title: '人工补全', desc: '进入待补全队列' },
];

export default function PlacesPage() {
  const { toasts, push } = useToast();
  const [pending, setPending] = useState([]);
  const [places, setPlaces] = useState([]);
  const [loadingPend, setLoadingPend] = useState(true);
  const [loadingPlaces, setLoadingPlaces] = useState(true);
  const [selected, setSelected] = useState({}); // eventId -> candidate.alias
  const [keyword, setKeyword] = useState({}); // eventId -> 搜索词
  const [confirming, setConfirming] = useState({}); // eventId -> bool

  useEffect(() => {
    let live = true;
    fetchPendingLocations().then((r) => {
      if (!live) return;
      setPending(r.data);
      setLoadingPend(false);
    });
    fetchPlaces().then((r) => {
      if (!live) return;
      setPlaces(r.data);
      setLoadingPlaces(false);
    });
    return () => { live = false; };
  }, []);

  const confirm = async (item) => {
    const alias = selected[item.eventId];
    const place = item.candidates.find((c) => c.alias === alias);
    if (!place || confirming[item.eventId]) return;
    setConfirming((m) => ({ ...m, [item.eventId]: true }));
    await completeLocation(item.eventId, place);
    setPending((list) => list.filter((x) => x.eventId !== item.eventId));
    setPlaces((list) => [
      ...list,
      { id: `p-${item.eventId}`, alias: place.alias, address: place.address, hits: 1, source: '刚刚补全' },
    ]);
    push('已写入别名库，相关通勤段已重新规划');
  };

  return (
    <div className="page">
      {/* 地点解析流程说明卡 */}
      <div className="card card-pad">
        <div className="card-title">
          <BookMarked size={16} strokeWidth={1.9} />
          地点解析流程
          <span className="right">设计 §5.1 地点字段兜底流程</span>
        </div>
        <div className="pl-flow">
          {FLOW.map((s, i) => (
            <Fragment key={s.title}>
              <div className="pl-step">
                <div className="pl-step-ic"><s.Icon size={17} strokeWidth={1.9} /></div>
                <div className="pl-step-title">{s.title}</div>
                <div className="pl-step-desc muted">{s.desc}</div>
              </div>
              {i < FLOW.length - 1 && <ChevronRight className="pl-arrow" size={16} strokeWidth={2} />}
            </Fragment>
          ))}
        </div>
      </div>

      {/* 待补全队列 */}
      <div className="section-title">
        待补全队列
        <span className="right"><span className="tag tag-amber">{pending.length} 条待处理</span></span>
      </div>

      {loadingPend ? (
        <Skeleton lines={4} />
      ) : pending.length === 0 ? (
        <div className="empty">
          <div style={{ marginBottom: 8 }}>
            <CheckCircle2 size={28} strokeWidth={1.6} style={{ color: 'var(--success)' }} />
          </div>
          全部日程地点已就绪
        </div>
      ) : (
        pending.map((item) => {
          const kw = (keyword[item.eventId] || '').trim();
          const filtered = item.candidates.filter(
            (c) => !kw || c.alias.includes(kw) || c.address.includes(kw),
          );
          const sel = selected[item.eventId];
          return (
            <div className="card card-pad pl-pend" key={item.eventId}>
              <div className="pl-pend-head">
                <b>{item.title}</b>
                <span className="mono muted">{item.time}</span>
                <span className="tag tag-amber">地点缺失</span>
              </div>

              <div className="pl-guess">
                <Sparkles size={14} strokeWidth={1.9} />
                <span>系统推测</span>
                <b>{item.guess.alias}</b>
                <span className="muted">{item.guess.address}</span>
                <span className="tag tag-blue">置信 {item.guess.confidence}%</span>
              </div>

              <div className="pl-search">
                <Search size={14} strokeWidth={1.9} />
                <input
                  className="input"
                  placeholder="搜索候选地点（别名 / 地址）"
                  value={keyword[item.eventId] || ''}
                  onChange={(e) => setKeyword((m) => ({ ...m, [item.eventId]: e.target.value }))}
                />
              </div>

              <div className="pl-cands">
                {filtered.length === 0 ? (
                  <div className="muted" style={{ fontSize: 12.5, padding: '6px 2px' }}>
                    没有匹配「{kw}」的候选地点
                  </div>
                ) : (
                  filtered.map((c) => (
                    <div
                      key={c.alias}
                      className={`pl-cand ${sel === c.alias ? 'on' : ''}`}
                      onClick={() => setSelected((m) => ({ ...m, [item.eventId]: c.alias }))}
                    >
                      <span className="pl-radio" />
                      <div className="pl-cand-info">
                        <b>{c.alias}</b>
                        <div className="muted pl-cand-addr">{c.address}</div>
                      </div>
                      <span className="tag tag-gray">{c.distance}</span>
                    </div>
                  ))
                )}
              </div>

              <button
                className="btn btn-primary"
                disabled={!sel || confirming[item.eventId]}
                onClick={() => confirm(item)}
              >
                <Check size={15} strokeWidth={2.2} />
                {confirming[item.eventId] ? '写入中…' : '确认并写入别名库'}
              </button>
            </div>
          );
        })
      )}

      {/* 常去地点别名库 */}
      <div className="section-title">
        常去地点别名库
        <span className="right">{places.length} 条别名</span>
      </div>

      {loadingPlaces ? (
        <Skeleton lines={4} />
      ) : (
        <>
          <div className="card">
            <table className="tbl">
              <thead>
                <tr>
                  <th>别名</th>
                  <th>地址</th>
                  <th>命中次数</th>
                  <th>来源</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {places.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <span className="row" style={{ gap: 6 }}>
                        <MapPin size={14} strokeWidth={1.9} style={{ color: 'var(--accent)' }} />
                        <b>{p.alias}</b>
                      </span>
                    </td>
                    <td className="muted">{p.address}</td>
                    <td><span className="tag tag-blue">{p.hits} 次</span></td>
                    <td className="muted">{p.source || (p.hits > 20 ? '高频常用' : '历史确认')}</td>
                    <td>
                      <button className="btn btn-sm btn-ghost" onClick={() => push('原型演示：别名编辑')}>
                        编辑
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>
            别名库命中后自动填充坐标，同类日程不再打扰你。
          </p>
        </>
      )}

      <Toasts toasts={toasts} />
    </div>
  );
}
