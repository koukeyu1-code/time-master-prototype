import { Car, Bike, TrainFront, Footprints, TrainTrack } from 'lucide-react';

/* 交通方式 → Lucide 图标 / 语义色类名（全局唯一映射，页面统一使用） */
const MAP = {
  car: { Icon: Car, cls: 'mode-car' },
  moto: { Icon: Bike, cls: 'mode-moto' },
  transit: { Icon: TrainFront, cls: 'mode-transit' },
  bike: { Icon: Bike, cls: 'mode-bike' },
  walk: { Icon: Footprints, cls: 'mode-walk' },
  rail: { Icon: TrainTrack, cls: 'mode-rail' },
};

export const MODE_LABEL = {
  car: '私家车', moto: '摩托车', transit: '公交地铁', bike: '骑行', walk: '步行', rail: '城际高铁',
};

export default function ModeIcon({ mode, size = 17 }) {
  const m = MAP[mode] || MAP.transit;
  return (
    <span className={`mode-badge ${m.cls}`}>
      <m.Icon size={size} strokeWidth={1.9} />
    </span>
  );
}
