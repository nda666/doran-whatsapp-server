import { useUiTranslation } from "@/lib/uiTranslation";
import { InfoCircleOutlined } from "@ant-design/icons";
import { Button, Popover, Space, Tag } from "antd";
import type { PhoneConnectionInfo } from "@/lib/phoneConnectionStatus";

export default function PhoneConnectionStatus({ connection }: { connection?: PhoneConnectionInfo }) {
  const uiText = useUiTranslation();
  const color = !connection ? "default" : connection.state === "online" ? "green"
    : connection.qrRequired ? "red" : ["pairing", "reconnecting", "waiting"].includes(connection.state) ? "processing" : "orange";
  const label = connection?.state === "scan_qr" ? uiText("Offline") : uiText(connection?.label) || uiText("Status sesi belum terverifikasi");
  const description = uiText(connection?.description) || uiText("Muat ulang untuk memeriksa koneksi dan memastikan apakah perlu scan QR.");
  return <Space size={4} style={{ whiteSpace: "nowrap" }}>
    <Tag color={color} style={{ marginInlineEnd: 0, ...(connection?.state === "online" ? { background: "#39ff14", color: "#135200", borderColor: "#52c41a", fontWeight: 700, boxShadow: "0 0 8px rgba(57, 255, 20, 0.45)" } : {}) }}>{label}</Tag>
    <Popover trigger="click" title={uiText("Informasi koneksi WhatsApp")} content={<div style={{ maxWidth: 320, whiteSpace: "normal" }}>{description}</div>}>
      <Button type="text" size="small" icon={<InfoCircleOutlined />} aria-label={uiText("Informasi status {{v0}}", { v0: label })} />
    </Popover>
  </Space>;
}
