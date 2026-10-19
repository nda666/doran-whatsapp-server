import { useUiTranslation } from "@/lib/uiTranslation";
import { ReactElement, useEffect, useState } from "react";
import { Alert, Button, Card, Checkbox, Form, Input, InputNumber, Modal, Space, Table, Tag, Typography, message } from "antd";
import axios from "axios";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import Layout from "@/components/Layout";
import AiProviderGuide from "@/components/AiProviderGuide";
import { useDashboardApi } from "@/lib/useDashboardApi";
import { aiProviders, defaultAiPrompt, providerNames, type AiProvider } from "@/lib/aiPlugins";
type Plugin = { provider: AiProvider; enabled: boolean; hasKey: boolean; model: string; systemPrompt: string; maxOutputTokens: number; requestsPerMinute: number; dailyLimit: number };
export default function AiPlugins() {
  const uiText = useUiTranslation();
  const api = useDashboardApi<{ data: Plugin[]; recent: any[]; encryptionReady: boolean }>("/api/ai-plugins");
  const [provider, setProvider] = useState<AiProvider>("openai"), [busy, setBusy] = useState(false), [testing, setTesting] = useState(false);
  const [testOpen, setTestOpen] = useState(false), [testMessage, setTestMessage] = useState(uiText("Halo, apa yang bisa Anda bantu?")), [answer, setAnswer] = useState(""), [testError, setTestError] = useState("");
  const [form] = Form.useForm();
  const plugin = api.data?.data.find(row => row.provider === provider);
  useEffect(() => {
    form.resetFields(); form.setFieldsValue(plugin || { enabled: false, model: "", systemPrompt: defaultAiPrompt, maxOutputTokens: 1024, requestsPerMinute: 10, dailyLimit: 1000 });
  }, [provider, plugin, form]);
  const save = async (values: any) => {
    setBusy(true);
    try { await axios.post("/api/ai-plugins", { ...values, provider }, { headers: api.headers }); form.setFieldValue("apiKey", ""); api.reload(); message.success(uiText("Pengaturan plugin AI tersimpan.")); }
    catch (e: any) { message.error(uiText(e.response?.data?.message || uiText("Pengaturan AI belum tersimpan."))); }
    finally { setBusy(false); }
  };
  const test = async () => {
    setTesting(true); setAnswer(""); setTestError("");
    try { const response = await axios.post("/api/ai-plugins/test", { provider, message: testMessage }, { headers: api.headers, timeout: 45000 }); setAnswer(response.data.text); api.reload(); }
    catch (e: any) {
      const fallback = e.response?.status >= 500
        ? uiText("Server pengujian AI sedang tidak tersedia. Coba lagi beberapa saat nanti.")
        : !e.response ? uiText("Koneksi pengujian AI terputus atau melewati batas waktu. Coba lagi beberapa saat nanti.")
        : uiText("Pengujian AI belum berhasil. Coba lagi beberapa saat nanti.");
      setTestError(e.response?.data?.message || fallback); api.reload();
    }
    finally { setTesting(false); }
  };
  return <Space direction="vertical" size="middle" style={{ width: "100%" }}>
    <Alert type="info" showIcon message={uiText("Plugin AI untuk balasan otomatis")} description={uiText("Atur API key dan model pada akun pemilik perangkat. Setelah disimpan dan aktif, buka Perangkat HP → Auto Reply → pilih Balasan AI dan tentukan kata kuncinya. AI menerima teks pesan masuk dan instruksi yang Anda isi, tanpa riwayat percakapan atau lampiran. Pemakaian mengikuti kuota dan penagihan penyedia AI.")} />
    {api.error && <Alert type="error" message={uiText(api.error)} action={<Button onClick={api.reload}>{uiText("Coba lagi")}</Button>} />}
    {api.data && !api.data.encryptionReady && <Alert type="warning" showIcon message={uiText("Enkripsi API key belum siap")} description={uiText("Admin server perlu mengisi AI_SECRET_KEY dengan 64 karakter hex pada environment, lalu restart aplikasi. Setelah itu API key dapat disimpan dengan enkripsi.")} />}
    <Space wrap>{aiProviders.map(p => { const config = api.data?.data.find(row => row.provider === p); return <Card key={p} size="small" title={providerNames[p]} style={{ minWidth: 210 }}><Space direction="vertical"><Tag color={config?.enabled ? "green" : "default"}>{config?.enabled ? uiText("Aktif") : uiText("Nonaktif")}</Tag><span>{config?.model || uiText("Model belum diatur")}</span><Button disabled={busy || testing} type={provider === p ? "primary" : "default"} onClick={() => setProvider(p)}>{uiText("Atur")} {providerNames[p]}</Button></Space></Card>; })}</Space>
    <AiProviderGuide provider={provider} />
    <Card title={uiText("Pengaturan {{v0}}", { v0: providerNames[provider] })} loading={!api.data && !api.error}>
      <Form form={form} layout="vertical" onFinish={save} disabled={busy || !api.data} style={{ maxWidth: 760 }}>
        <Form.Item name="enabled" valuePropName="checked"><Checkbox>{uiText("Aktifkan plugin ini")}</Checkbox></Form.Item>
        <Form.Item name="apiKey" label={uiText("API key")} extra={<>{plugin?.hasKey ? uiText("API key sudah tersimpan. Kosongkan untuk mempertahankan key yang ada.") : uiText("Masukkan API key provider, disimpan terenkripsi di server.")} <a href="#panduan-api-key">{uiText("Lihat cara mendapatkan API key")}</a>.</>}><Input.Password autoComplete="new-password" maxLength={1024} placeholder={plugin?.hasKey ? uiText("Key tersimpan (disembunyikan)") : uiText("API key provider")} /></Form.Item>
        {plugin?.hasKey && <Form.Item name="removeKey" valuePropName="checked"><Checkbox>{uiText("Hapus API key tersimpan (nonaktifkan plugin terlebih dahulu)")}</Checkbox></Form.Item>}
        <Form.Item name="model" label={uiText("ID model")} extra={uiText("Isi ID model yang tersedia pada akun API provider Anda.")} rules={[{ required: true }, { pattern: /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,119}$/, message: uiText("ID model tidak valid.") }]}><Input maxLength={120} placeholder={uiText("ID model dari dashboard provider")} /></Form.Item>
        <Form.Item name="systemPrompt" label={uiText("Instruksi bisnis / sistem")} extra={uiText("Isi peran asisten, informasi produk, jam layanan, dan aturan balasan. Jangan memasukkan API key atau kata sandi.")} rules={[{ required: true, whitespace: true }]}><Input.TextArea rows={7} maxLength={10000} showCount /></Form.Item>
        <Space wrap align="start">
          <Form.Item name="maxOutputTokens" label={uiText("Batas token jawaban")} rules={[{ required: true }]}><InputNumber min={128} max={4096} precision={0} /></Form.Item>
          <Form.Item name="requestsPerMinute" label={uiText("Maks. permintaan / menit")} rules={[{ required: true }]}><InputNumber min={1} max={60} precision={0} /></Form.Item>
          <Form.Item name="dailyLimit" label={uiText("Maks. permintaan / hari (WIB)")} rules={[{ required: true }]}><InputNumber min={1} max={10000} precision={0} /></Form.Item>
        </Space>
        <Typography.Paragraph type="secondary">{uiText("Batas berlaku bersama untuk semua perangkat dan uji koneksi pada provider ini. Percobaan yang gagal tetap dihitung. Balasan AI memproses pesan baru hingga 4.000 karakter; pesan lama hasil sinkronisasi dilewati.")}</Typography.Paragraph>
        <Space wrap><Button type="primary" htmlType="submit" loading={busy}>{uiText("Simpan pengaturan")}</Button><Button disabled={!plugin?.enabled || !plugin.hasKey || busy} onClick={() => { setAnswer(""); setTestError(""); setTestOpen(true); }}>{uiText("Uji koneksi & balasan")}</Button></Space>
      </Form>
    </Card>
    <Card title={uiText("20 aktivitas AI terakhir")}><Table rowKey="id" size="small" pagination={false} dataSource={api.data?.recent || []} scroll={{ x: 600 }} columns={[
      { title: uiText("Waktu (WIB)"), dataIndex: "createdAt", render: value => new Date(value).toLocaleString(uiText.locale, { timeZone: "Asia/Jakarta" }) },
      { title: uiText("Provider"), dataIndex: "provider", render: (value: AiProvider) => providerNames[value] }, { title: uiText("Status"), dataIndex: "status" }, { title: uiText("Kode kendala"), dataIndex: "error", render: value => value || "—" },
    ]} /></Card>
    <Modal title={uiText("Uji {{v0}}", { v0: providerNames[provider] })} open={testOpen} onCancel={() => !testing && setTestOpen(false)} onOk={test} confirmLoading={testing} okButtonProps={{ disabled: !testMessage.trim() }} okText={uiText("Uji balasan")} cancelText={uiText("Tutup")}>
      <Space direction="vertical" style={{ width: "100%" }}><Typography.Paragraph>{uiText("Memakai konfigurasi yang sudah disimpan dan kuota API provider. Hasil ditampilkan di sini tanpa dikirim ke WhatsApp.")}</Typography.Paragraph><Input.TextArea value={testMessage} onChange={e => setTestMessage(e.target.value)} rows={4} maxLength={4000} disabled={testing} />
        {testError && <Alert type="error" message={uiText(testError)} />}{answer && <div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{answer}</div>}
      </Space>
    </Modal>
  </Space>;
}
AiPlugins.getLayout = (page: ReactElement) => <Layout title="PLUGIN AI">{page}</Layout>;
export const getStaticProps = async ({ locale }: { locale: string }) => ({ props: { ...(await serverSideTranslations(locale, ["common", "upgrade", "interface"])) } });
