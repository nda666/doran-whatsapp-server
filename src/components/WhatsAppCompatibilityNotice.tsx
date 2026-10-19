import { useUiTranslation } from "@/lib/uiTranslation";
import { Alert } from "antd";

export default function WhatsAppCompatibilityNotice() {
  const uiText = useUiTranslation();
  return (
    <Alert
      type="warning"
      showIcon
      message={uiText("Keterbatasan pesan button dan template")}
      description={uiText("Format pesan button dan template di WA Server sudah deprecated (tidak lagi didukung penuh) setelah pembaruan WhatsApp. Untuk sementara, pesan ini hanya dapat tampil di iPhone (iOS) dan WhatsApp Web, belum didukung di Android. Gunakan pesan teks atau gambar jika penerima menggunakan Android.")}
      style={{ marginBottom: 16 }}
    />
  );
}
