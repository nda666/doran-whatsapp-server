import { useUiTranslation } from "@/lib/uiTranslation";
import { Typography } from "antd";
import { DispatchDisplayWindow, formatDispatchWindow } from "@/lib/dispatchWindow";

export default function DispatchWindowNotice({ window }: { window?: DispatchDisplayWindow }) {
  const uiText = useUiTranslation();
  return <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
    {window ? uiText("Data pengiriman {{v0}} hari terakhir sejak masuk antrean: {{v1}}. Mengikuti setting Maksimal usia data antrean (hari).", { v0: window.days, v1: formatDispatchWindow(window, uiText.locale) }) : uiText("Rentang data pengiriman mengikuti setting Maksimal usia data antrean (hari).")}
  </Typography.Paragraph>;
}
