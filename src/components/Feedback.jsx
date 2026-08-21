import { useState, useEffect, useCallback } from 'react';
import { CheckCircle2 } from 'lucide-react';

/* 轻量 Toast：页面用 useToast() 拿到 push(text)，渲染 <Toasts/> 挂在页面根 */
let idSeq = 0;

export function useToast() {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((text) => {
    const id = ++idSeq;
    setToasts((t) => [...t, { id, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600);
  }, []);
  return { toasts, push };
}

export function Toasts({ toasts }) {
  if (!toasts.length) return null;
  return (
    <div className="toast-wrap">
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          <CheckCircle2 size={15} strokeWidth={2} />
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  );
}

/* 页面加载骨架屏：配合 API stub 的 delay 展示 loading 态 */
export function Skeleton({ lines = 3 }) {
  return (
    <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          style={{
            height: 14, borderRadius: 6, width: `${88 - i * 18}%`,
            background: 'linear-gradient(90deg, #e8eef6 25%, #f4f8fd 50%, #e8eef6 75%)',
            backgroundSize: '200% 100%',
            animation: 'skShine 1.2s ease infinite',
          }}
        />
      ))}
      <style>{`@keyframes skShine { from { background-position: 200% 0; } to { background-position: -200% 0; } }`}</style>
    </div>
  );
}
