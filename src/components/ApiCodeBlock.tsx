import { useUiTranslation } from "@/lib/uiTranslation";
import { Button, message } from "antd";
import styles from "@/styles/ApiDocs.module.css";

export default function ApiCodeBlock({ title, value, copyLabel }: { title: string; value: string; copyLabel?: string }) {
  const uiText = useUiTranslation();
  const copy = async () => {
    try { await navigator.clipboard.writeText(value); message.success(uiText("Disalin.")); }
    catch { message.error(uiText("Clipboard tidak tersedia.")); }
  };
  return <section className={styles.codePanel} aria-label={title}>
    <div className={styles.codeHeader}>
      <h5>{title}</h5>
      {copyLabel && <Button size="small" onClick={copy}>{copyLabel}</Button>}
    </div>
    <pre className={styles.code} dir="ltr"><code>{value}</code></pre>
  </section>;
}
