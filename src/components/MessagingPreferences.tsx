import { useUiTranslation } from "@/lib/uiTranslation";
import { useState } from "react";
import { Alert, Button, Card, Form, Input, InputNumber, Space, Switch, message } from "antd";
import axios from "axios";
import { useDashboardApi } from "@/lib/useDashboardApi";
import RecipientConsents from "./RecipientConsents";
export default function MessagingPreferences() {
  const uiText = useUiTranslation();
  const settings = useDashboardApi("/api/messaging-settings");
  const [form] = Form.useForm();
  const [busy, setBusy] = useState(false);
  const save = async (values: any) => {
    setBusy(true);
    try { await axios.put("/api/messaging-settings", values, { headers: settings.headers }); message.success(uiText("Pengaturan disimpan.")); settings.reload(); }
    catch (e: any) { message.error(uiText(e.response?.data?.message || uiText("Pengaturan gagal disimpan."))); } finally { setBusy(false); }
  };
  return <Space direction="vertical" style={{ width: "100%" }}>
{settings.error && <Alert type="error" message={uiText(settings.error)} />}
    <Card title={uiText("Pengaturan pesan dan notifikasi")} loading={!settings.data}>
      {settings.data && <Form key={settings.data.updatedAt || "initial"} form={form} layout="vertical" initialValues={settings.data} onFinish={save}>
        <Form.Item name="optOutEnabled" label={uiText("Deteksi balasan STOP")} valuePropName="checked" extra={uiText("Berlaku untuk seluruh perangkat akun Anda, tanpa perlu mengaktifkan balasan otomatis. Mematikan deteksi tidak menghapus daftar blokir yang sudah ada.")}><Switch checkedChildren={"ON"} unCheckedChildren={"OFF"} /></Form.Item>
        <Form.Item name="offlineAlertsEnabled" label={uiText("Notifikasi perangkat terputus dan tersambung kembali")} valuePropName="checked"><Switch checkedChildren={"ON"} unCheckedChildren={"OFF"} /></Form.Item>
        <Form.Item name="alertEmail" label={uiText("Email admin")} rules={[{ type: "email" }]} extra={uiText("Email dikirim menggunakan integrasi Postmark Jeblast yang sudah tersedia.")}><Input maxLength={254} /></Form.Item>
        <Form.Item name="offlineDelaySeconds" label={uiText("Kirim alert setelah terputus (detik)")} extra={uiText("Pemulihan dikonfirmasi setelah 30 detik. Alert perangkat yang sama dibatasi maksimal satu kali setiap 30 menit.")}><InputNumber min={30} max={3600} /></Form.Item>
        <Button type="primary" htmlType="submit" loading={busy}>{uiText("Simpan pengaturan")}</Button>
      </Form>}
    </Card>
    <RecipientConsents />
  </Space>;
}
