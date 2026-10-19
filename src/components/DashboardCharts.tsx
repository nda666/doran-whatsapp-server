import { useUiTranslation, type UiTranslator } from "@/lib/uiTranslation";
import { Empty, Space, Typography, theme } from "antd";
import { countAxis } from "@/lib/chartScale";

export type ChartItem = { label: string; count: number; color: string; detail?: string };
const number = (uiText: UiTranslator, value: number) => value.toLocaleString(uiText.locale);

export function DistributionChart({ items, label }: { items: ChartItem[]; label: string }) {
  const uiText = useUiTranslation();
  const { token } = theme.useToken();
  const total = items.reduce((n, item) => n + item.count, 0);
  if (!total) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={uiText("Belum ada data")} />;
  let offset = 0;
  return <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: 24 }}>
    <svg role="img" aria-label={label} viewBox="0 0 180 180" style={{ width: 180, height: 180, flexShrink: 0 }}>
      {items.filter(item => item.count > 0).map(item => {
        const length = item.count / total * 100;
        const start = offset; offset += length;
        return <circle key={item.label} cx="90" cy="90" r="68" fill="none" stroke={item.color} strokeWidth="22" pathLength="100" strokeDasharray={`${length} ${100 - length}`} strokeDashoffset={-start} transform="rotate(-90 90 90)"><title>{item.label}: {number(uiText, item.count)} ({(length).toFixed(1)}%)</title></circle>;
      })}
      <text x="90" y="88" textAnchor="middle" fill={token.colorText} fontSize="24" fontWeight="600">{number(uiText, total)}</text>
      <text x="90" y="110" textAnchor="middle" fill={token.colorTextSecondary} fontSize="12">{uiText("Total")}</text>
    </svg>
    <Space direction="vertical" style={{ flex: "1 1 180px" }}>
      {items.map(item => <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 10, height: 10, borderRadius: 3, background: item.color, flexShrink: 0 }} />
        <span style={{ flex: 1 }}>{item.label}</span><strong>{number(uiText, item.count)}</strong>
        <Typography.Text type="secondary" style={{ width: 50, textAlign: "right", fontSize: 12 }}>{(item.count / total * 100).toFixed(1)}%</Typography.Text>
      </div>)}
    </Space>
  </div>;
}

export function RankingChart({ items, emptyDescription }: { items: ChartItem[]; emptyDescription?: string }) {
  const uiText = useUiTranslation();
  const { token } = theme.useToken();
  const max = Math.max(1, ...items.map(item => item.count));
  if (!items.some(item => item.count)) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyDescription ?? uiText("Belum ada pesan terkirim pada periode ini")} />;
  return <Space direction="vertical" size={18} style={{ width: "100%" }}>
    {items.map(item => <div key={item.detail || item.label}>
      <div style={{ display: "flex", gap: 12, justifyContent: "space-between" }}><span style={{ overflowWrap: "anywhere" }}>{item.label}</span><strong style={{ whiteSpace: "nowrap" }}>{number(uiText, item.count)}  {uiText("pesan")}</strong></div>
      {item.detail && <Typography.Text type="secondary" style={{ fontSize: 12 }}>{item.detail}</Typography.Text>}
      <div role="img" aria-label={`${item.label}: ${number(uiText, item.count)} pesan`} style={{ height: 10, marginTop: 6, background: token.colorFillSecondary, borderRadius: 6, overflow: "hidden" }}><div style={{ width: `${item.count / max * 100}%`, height: "100%", background: item.color, borderRadius: 6 }} /></div>
    </div>)}
  </Space>;
}

export function ActivityChart({ items, label, showValues = false }: { items: ChartItem[]; label: string; showValues?: boolean }) {
  const uiText = useUiTranslation();
  const { token } = theme.useToken();
  const max = Math.max(1, ...items.map(item => item.count));
  const axis = countAxis(max);
  if (!items.some(item => item.count)) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={uiText("Belum ada pesan terkirim pada periode ini")} />;
  const slot = showValues ? Math.max(64, number(uiText, max).length * 8 + 16) : 18;
  const left = Math.max(44, number(uiText, axis.max).length * 7 + 12);
  const width = Math.max(420, items.length * slot + left + 14), plot = width - left - 14;
  return <div style={{ overflowX: "auto" }}>
    <svg role="img" aria-label={label} viewBox={`0 0 ${width} 220`} style={{ display: "block", width: "100%", minWidth: width, height: 220 }}>
      {axis.ticks.map(tick => { const y = 175 - tick / axis.max * 145; return <g key={tick}><line x1={left} x2={width - 10} y1={y} y2={y} stroke={token.colorBorderSecondary} /><text x={left - 7} y={y + 4} textAnchor="end" fontSize="10" fill={token.colorTextSecondary}>{number(uiText, tick)}</text></g>; })}
      {items.map((item, i) => { const x = left + 4 + i * plot / items.length, barWidth = plot / items.length * 0.65, height = item.count / axis.max * 145; return <g key={item.label}>
        <title>{uiText("{{v0}}: {{v1}} pesan", { v0: item.label, v1: number(uiText, item.count) })}</title>
        <rect x={x} y={175 - height} width={barWidth} height={height} fill={item.color} rx="3" />
        {showValues && <text data-chart-value={item.count} x={x + barWidth / 2} y={175 - height - 8} textAnchor="middle" fontSize="12" fontWeight="600" fill={token.colorText}>{number(uiText, item.count)}</text>}
        <text x={x + barWidth / 2} y="194" textAnchor="middle" fontSize="10" fill={token.colorTextSecondary}>{item.label}</text>
      </g>; })}
    </svg>
  </div>;
}

