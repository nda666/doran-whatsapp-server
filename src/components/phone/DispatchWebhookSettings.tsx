import { useUiTranslation } from "@/lib/uiTranslation";
import { useEffect, useState } from "react";
import { Alert, Button, Card, Form, Input, Space, Switch, Table, Tag, message } from "antd";
import axios from "axios";
import dayjs from "dayjs";
import { useDashboardApi } from "@/lib/useDashboardApi";

export default function DispatchWebhookSettings({ onViewLogs }: { onViewLogs?: () => void } = {}) {
  const uiText = useUiTranslation();
  const api = useDashboardApi("/api/admin/dispatch-webhook", 10000);
  const [form] = Form.useForm();
  const [loaded, setLoaded] = useState(false), [busy, setBusy] = useState(false);
  useEffect(() => {
    if (api.data && !loaded) { form.setFieldsValue(api.data.settings); setLoaded(true); }
  }, [api.data, loaded, form]);
  const submit = async (data: unknown, test = false) => {
    setBusy(true);
    try {
      const response = await axios.post("/api/admin/dispatch-webhook", data, { headers: api.headers });
      message.success(uiText(response.data.message));
      if (!test) form.setFieldValue("secret", undefined);
      api.reload();
    } catch (error: any) { message.error(uiText(error.response?.data?.message || uiText("Permintaan gagal. Periksa status sebelum mencoba lagi."))); }
    finally { setBusy(false); }
  };
  return <Space direction="vertical" style={{ width: "100%" }}>
    {api.error && <Alert type="error" message={uiText(api.error)} />}
    <Card title={uiText("Webhook Status Antrean Pengiriman")}>
      <p>{uiText("Kirim status terbaru setiap pekerjaan ke satu endpoint kasir: QUEUED, PROCESSING, SENT, DELIVERED, READ, FAILED, dan UNCERTAIN. Berlaku untuk antrean API dan campaign.")}</p>
      <Form form={form} layout="vertical" disabled={!loaded || busy} onFinish={values => submit({ enabled: !!values.enabled, url: values.url || "", ...(values.secret ? { secret: values.secret } : {}) })}>
        <Form.Item name="enabled" label={uiText("Aktifkan webhook")} valuePropName="checked"><Switch /></Form.Item>
        <Form.Item name="url" label={uiText("Webhook URL Kasir")} rules={[{ type: "url", message: uiText("Masukkan URL yang valid.") }]} extra={uiText("Endpoint HTTPS publik yang menerima POST JSON. Kosongkan jika belum digunakan.")}><Input placeholder="https://kasir.example.com/webhooks/jeblast/send-status" /></Form.Item>
        <Form.Item name="secret" label={uiText("Kunci Autentikasi Webhook")} rules={[{ min: 16, message: uiText("Minimal 16 karakter.") }]} extra={api.data?.settings.secretConfigured ? "Kunci tersimpan. Kosongkan untuk mempertahankannya. Kasir memeriksa header Authorization: Bearer <kunci>." : uiText("Gunakan kunci yang sama di kasir. Simpan salinannya sebelum menyimpan pengaturan.")}><Input.Password autoComplete="new-password" /></Form.Item>
        <Space wrap><Button onClick={() => { const bytes = new Uint8Array(32); crypto.getRandomValues(bytes); form.setFieldValue("secret", Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("")); }}>{uiText("Buat Kunci")}</Button><Button type="primary" htmlType="submit" loading={busy}>{uiText("Simpan Webhook")}</Button></Space>
      </Form>
      <Space wrap style={{ marginTop: 16 }}><Button disabled={busy || !api.data?.settings.enabled} onClick={() => submit({ action: "test" }, true)}>{uiText("Tes Webhook Tersimpan")}</Button><Button onClick={api.reload}>{uiText("Refresh Status")}</Button></Space>
      <p>{uiText("Tes menggunakan konfigurasi yang sudah disimpan dan mengirim event tes tanpa mengubah antrean pengiriman. Mengubah URL/kunci atau menonaktifkan webhook membatalkan event yang masih antre. Pengiriman yang sudah berjalan dapat selesai memakai konfigurasi sebelumnya.")}</p>
      <p>{uiText("Kasir perlu memakai event_id untuk mencegah duplikat dan sequence untuk mengabaikan data yang lebih lama. Payload memuat ID job/transaksi, penerima, status, waktu, dan keterangan kegagalan. Kasir memberi respons 2xx setelah event tersimpan.")}</p>
    </Card>
    <Card title={uiText("20 Pengiriman Terakhir")} extra={onViewLogs && <Button onClick={onViewLogs}>{uiText("Lihat Log Lengkap")}</Button>}><Table rowKey="id" size="small" scroll={{ x: true }} pagination={false} dataSource={api.data?.events || []} columns={[
      { title: uiText("Waktu"), dataIndex: "createdAt", render: value => dayjs(value).format("DD/MM/YYYY HH:mm:ss") },
      { title: uiText("Event"), dataIndex: "event" }, { title: uiText("ID Pengiriman"), dataIndex: "dispatchId", render: value => value || "Tes" },
      { title: uiText("Status"), dataIndex: "status", render: value => <Tag color={value === "DELIVERED" ? "green" : value === "FAILED" ? "red" : "gold"}>{value}</Tag> },
      { title: uiText("Percobaan"), dataIndex: "attempts" }, { title: uiText("Keterangan"), dataIndex: "lastError" },
    ]} /></Card>
  </Space>;
}
