import { useUiTranslation } from "@/lib/uiTranslation";
import type { CSSProperties, ReactNode } from "react";
import styles from "@/styles/SummaryCards.module.css";

export type SummaryItem = {
  key: string;
  label: string;
  value?: number;
  color: string;
  icon: ReactNode;
  description?: string;
  unit?: string;
};

export default function SummaryCards({ title, caption, items }: { title: string; caption?: string; items: SummaryItem[] }) {
  const uiText = useUiTranslation();
  return <section aria-label={title} className={styles.section}>
    <div className={styles.heading}><h2>{title}</h2>{caption && <p>{caption}</p>}</div>
    <div className={styles.grid} data-count={items.length}>
      {items.map(item => <article key={item.key} className={styles.card} style={{ "--summary-color": item.color } as CSSProperties} title={item.description}>
        <div className={styles.top}><span className={styles.label}>{item.label}</span><span aria-hidden="true" className={styles.icon}>{item.icon}</span></div>
        <div className={styles.value}>{item.value === undefined ? "—" : item.value.toLocaleString(uiText.locale)}</div>
        <div className={styles.unit}><span className={styles.dot} />{uiText(item.unit || "perangkat")}</div>
      </article>)}
    </div>
  </section>;
}
