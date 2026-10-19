import { useUiTranslation } from "@/lib/uiTranslation";
import { Alert, Space, Spin } from "antd";

export function PairingProgress({ connected, takingLong }: { connected: boolean; takingLong: boolean }) {
  const uiText = useUiTranslation();
  return connected ? (
    <Alert type="success" showIcon message={uiText("Terhubung ke server WhatsApp")}
      description={uiText("Aplikasi WhatsApp di HP mungkin masih menyelesaikan sinkronisasi. Tunggu hingga proses di HP selesai, lalu klik Selesai.")} />
  ) : (
    <Space direction="vertical" align="center">
      <Spin size="large" />
      <Alert type={takingLong ? "warning" : "info"} showIcon
        message={uiText("Sedang menyelesaikan penautan")}
        description={takingLong
          ? uiText("Proses penautan masih berlangsung. Periksa koneksi internet dan tampilan WhatsApp di HP. Jangan pindai QR ulang selama HP masih memproses.")
          : uiText("QR sudah dipindai. Tunggu WhatsApp menyelesaikan koneksi dan proses di HP. Tidak perlu memindai ulang.")} />
    </Space>
  );
}
