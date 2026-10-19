import { useUiTranslation } from "@/lib/uiTranslation";
import FilterSelect from "@/components/FilterSelect";
import Table from "@/components/DashboardTable";
import SummaryCards from "@/components/SummaryCards";
import { DatabaseOutlined, ClockCircleOutlined, ExportOutlined, SendOutlined, CheckCircleOutlined, ReadOutlined, CloseCircleOutlined, ExclamationCircleOutlined } from "@ant-design/icons";
import { useTableState } from "@/lib/useTableState";
import { ReactElement, useState } from "react";
import { Alert, Button, Card, DatePicker, Form, Input, Modal, Space, Tag, Tooltip, message } from "antd";
import axios from "axios";
import DispatchMessageModal from "@/components/DispatchMessageModal";
import DispatchWebhookModal from "@/components/DispatchWebhookModal";
import ActionDropdown from "@/components/ActionDropdown";
import { useSession } from "next-auth/react";
import { isSuperAdmin } from "@/lib/access";
import { dispatchErrorLabels, dispatchStatusInfo as statusInfo } from "@/lib/dispatchPresentation";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import dayjs from "dayjs";
import Layout from "@/components/Layout";
import { useDashboardApi } from "@/lib/useDashboardApi";
import { defaultDispatchDates } from "@/lib/dispatchDateFilter";

export default function DispatchPage() {
  const uiText = useUiTranslation();
  const { data: session } = useSession();
  const canSendWebhook = session?.user && isSuperAdmin(session.user as any);
  const [webhookRow, setWebhookRow] = useState<any>();
  const phones = useDashboardApi("/api/phones?options=1");
  const table = useTableState();
  const [messageId, setMessageId] = useState<string>();
  const [summaryFiltered, setSummaryFiltered] = useState(false);
  const [resetRow, setResetRow] = useState<any>();
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState("");
  const [query, setQuery] = useState(() => ({ status: "QUEUED", store_id: "", store_filter: "", transaction_id: "", job_id: "", phone_id: "", source: "", ...defaultDispatchDates() }));
  const api = useDashboardApi(`/api/dispatch?${table.params}&${new URLSearchParams(query).toString()}&summary_filtered=${summaryFiltered ? "1" : "0"}`, 5000);
  const result = api.data || { data: [], total: 0, counts: {} };
  const resetDispatch = async () => {
    if (resetting || !resetRow) return;
    setResetting(true); setResetError("");
    try {
      const response = await axios.post("/api/dispatch-reset", { id: resetRow.id }, { headers: api.headers, timeout: 30000 });
      message.success(uiText(response.data.message)); setResetRow(undefined); api.reload();
    } catch (error: any) {
      setResetError(error.response?.data?.message || uiText("Reset belum terkonfirmasi. Refresh data sebelum mencoba lagi."));
      api.reload();
    } finally { setResetting(false); }
  };
  return <Space direction="vertical" style={{ width: "100%" }} size="middle">
    <SummaryCards title={uiText("Ringkasan pengiriman")} caption={summaryFiltered ? undefined : uiText("Jumlah pesan dibuat {{v0}}–{{v1}} (WIB){{v2}} • diperbarui otomatis setiap 5 detik", { v0: dayjs(query.start_date).format("DD/MM/YYYY"), v1: dayjs(query.end_date).format("DD/MM/YYYY"), v2: result.max_age_days ? uiText(" • batas usia data {{v0}} hari", { v0: result.max_age_days }) : "" })} items={[{
      key: "TOTAL", label: uiText("Total Data Antrean Pengiriman"),
      value: api.data ? Object.values(result.counts as Record<string, number>).reduce((sum, count) => sum + count, 0) : undefined,
      color: "#4274d7", icon: <DatabaseOutlined />,
      description: summaryFiltered ? uiText("Total data sesuai seluruh filter pencarian yang diterapkan, termasuk status pengiriman.") : uiText("Total data seluruh status dalam rentang tanggal awal dan batas usia data. Tekan Cari untuk menerapkan filter ke ringkasan."), unit: "pesan",
    }, ...Object.entries(statusInfo).map(([key, value]) => ({
      key, label: uiText(value.label), value: api.data ? result.counts[key] || 0 : undefined,
      color: ({ QUEUED: "#d7a022", PROCESSING: "#1684d6", SENT: "#20a66a", DELIVERED: "#12a5b2", READ: "#8d60d5", FAILED: "#e05a64", UNCERTAIN: "#df8a26" } as Record<string, string>)[key],
      icon: ({ QUEUED: <ClockCircleOutlined />, PROCESSING: <ExportOutlined />, SENT: <SendOutlined />, DELIVERED: <CheckCircleOutlined />, READ: <ReadOutlined />, FAILED: <CloseCircleOutlined />, UNCERTAIN: <ExclamationCircleOutlined /> } as Record<string, ReactElement>)[key],
      description: uiText(value.description), unit: uiText("pesan"),
    }))]} />
    {phones.error && <Alert type="error" message={uiText(phones.error)} />}
    <Alert type="info" showIcon message={uiText("Status setiap penerima")} description={uiText("Menunggu pengiriman berarti pesan sudah tersimpan, tetapi belum dikirim. Alasan menunggu ada pada kolom Keterangan. Terkirim berarti server WhatsApp telah menerima pesan; Diterima/Dibaca mengikuti receipt yang tersedia. Perlu diperiksa berarti hasil belum pasti: periksa tujuan sebelum mengirim ulang.")} />
    <Card title={uiText("Pencarian")}><Form layout="vertical" colon={false} className="dashboard-filter-grid" initialValues={{ status: "QUEUED", store_filter: "", start_date: dayjs(query.start_date), end_date: dayjs(query.end_date) }} onFinish={values => { setQuery({ status: values.status || "", store_id: values.store_id || "", store_filter: values.store_filter || "", transaction_id: values.transaction_id || "", job_id: (values.job_id || "").trim(), phone_id: values.phone_id || "", source: values.source || "", start_date: values.start_date.format("YYYY-MM-DD"), end_date: values.end_date.format("YYYY-MM-DD") }); setSummaryFiltered(true); table.reset(); api.reload(); }}>
      <Form.Item name="start_date" label={uiText("Tanggal mulai")} tooltip={uiText("Berdasarkan tanggal Dibuat, mulai pukul 00:00 WIB. Batas usia data dari Pengaturan Global tetap berlaku.")} rules={[{ required: true, message: uiText("Pilih tanggal mulai.") }]}><DatePicker allowClear={false} format="DD/MM/YYYY" style={{ width: "100%" }} /></Form.Item>
      <Form.Item name="end_date" label={uiText("Tanggal selesai")} tooltip={uiText("Mencakup seluruh hari pada tanggal selesai (WIB).")} dependencies={["start_date"]} rules={[{ required: true, message: uiText("Pilih tanggal selesai.") }, ({ getFieldValue }) => ({ validator(_, value) { const start = getFieldValue("start_date"); return !value || !start || !value.isBefore(start, "day") ? Promise.resolve() : Promise.reject(new Error(uiText("Tanggal selesai harus sama atau setelah tanggal mulai."))); } })]}><DatePicker allowClear={false} format="DD/MM/YYYY" style={{ width: "100%" }} /></Form.Item>
      <Form.Item name="status" label={uiText("Status pengiriman")}><FilterSelect allLabel={uiText("Semua status")} options={Object.entries(statusInfo).map(([value, info]) => ({ value, label: uiText(info.label) }))} /></Form.Item>
      <Form.Item name="job_id" label={uiText("ID Pengiriman / Job ID Request")} tooltip={uiText("Masukkan ID Pengiriman dari data[].id atau Job ID Request dari job_id secara lengkap.")}><Input allowClear maxLength={128} placeholder={uiText("Cari ID Pengiriman / Job ID Request")} /></Form.Item>
      <Form.Item name="store_id" label={uiText("Nama store")} tooltip={uiText("Masukkan nama store sesuai nilai store_id yang dikirim melalui API.")}><Input allowClear placeholder={uiText("Cari nama store")} /></Form.Item>
      <Form.Item name="store_filter" label={uiText("Filter store")} tooltip={uiText("Dapat digabung dengan nama store dan filter pencarian lainnya.")}><FilterSelect allLabel={uiText("Semua store")} options={[{ value: "non_default", label: uiText("Selain default") }, { value: "default", label: uiText("Hanya default") }]} /></Form.Item>
      <Form.Item name="transaction_id" label={uiText("ID transaksi")} tooltip={uiText("Untuk melacak pesan dan mencegah pengiriman ganda saat request diulang dengan ID yang sama. Jika tidak dikirim oleh aplikasi, sistem membuat ID otomatis.")}><Input allowClear placeholder={uiText("Cari ID transaksi")} /></Form.Item>
      <Form.Item name="phone_id" label={uiText("Perangkat pengirim")}><FilterSelect showSearch allLabel={uiText("Semua perangkat")} options={(phones.data || []).map((phone: any) => ({ value: phone.id, label: `${phone.name} (${phone.number || "—"})` }))} /></Form.Item>
      <Form.Item name="source" label={uiText("Sumber")}><FilterSelect allLabel={uiText("Semua sumber")} options={[{ value: "WEB", label: uiText("Web") }, { value: "API", label: "API" }]} /></Form.Item>
      <div className="dashboard-filter-actions"><Button type="primary" htmlType="submit">{uiText("Cari")}</Button><Button onClick={api.reload}>{uiText("Refresh")}</Button></div>
    </Form></Card>
    {api.error && <Alert type="error" message={uiText(api.error)} />}
    <Table table={table} total={result.total} className="table-with-data-count" rowKey="id" dataSource={result.data} scroll={{ x: 2840 }}
      columns={[
        { title: uiText("Store"), dataIndex: "store_id", width: 170 },
        { title: uiText("Pengirim"), dataIndex: "sender", width: 160 },
        { title: uiText("Penerima"), dataIndex: "recipient", width: 160 },
        { title: uiText("Status"), dataIndex: "status", width: 220, render: value => <Tag color={statusInfo[value]?.color}>{uiText(statusInfo[value]?.label || value)}</Tag> },
        { title: uiText("Dibuat"), dataIndex: "created_at", width: 190, render: value => dayjs(value).format("DD/MM/YYYY HH:mm:ss") },
        { title: <Tooltip title={uiText("Tanggal dan jam perubahan terakhir data pesan.")}><span>{uiText("Diperbarui")}</span></Tooltip>, dataIndex: "updated_at", width: 190, render: value => value ? dayjs(value).format("DD/MM/YYYY HH:mm:ss") : "—" },
        { title: uiText("Percobaan"), dataIndex: "attempts", width: 110 },
        { title: <Tooltip title={uiText("ID setiap pengiriman: data[].id pada respons API dan dispatch.id pada webhook. Untuk cek status, kirim sebagai field id.")}><span>{uiText("ID Pengiriman")}</span></Tooltip>, dataIndex: "id", width: 320 },
        { title: <Tooltip title={uiText("ID request dari aplikasi pengirim (job_id). Satu request dapat memiliki beberapa penerima. Kosong jika request tidak menyertakan job_id.")}><span>{uiText("Job ID Request")}</span></Tooltip>, dataIndex: "job_id", width: 280, render: value => value || "—" },
        { title: <Tooltip title={uiText("ID acuan transaksi/pesanan untuk pelacakan dan pencegahan pesan ganda. Gunakan ID yang sama saat mengulang request.")}><span>{uiText("ID transaksi")}</span></Tooltip>, dataIndex: "transaction_id", width: 320 },
        { title: <Tooltip title={uiText("Kategori dari message_key untuk membedakan beberapa pesan pada transaksi yang sama, misalnya order-created dan payment-confirmed.")}><span>{uiText("Jenis pesan")}</span></Tooltip>, dataIndex: "message_key", width: 160, render: value => value === "default" ? <Tooltip title={uiText("Kategori umum (default): aplikasi tidak menentukan message_key khusus.")}><span>{uiText("Umum")}</span></Tooltip> : value },
        { title: uiText("Via"), dataIndex: "source", width: 80 },
        { title: uiText("Keterangan"), dataIndex: "error", width: 350, render: (value, row: any) => uiText(row.waiting_reason || dispatchErrorLabels[value] || value || "—") },
        { title: uiText("Aksi"), key: "aksi", fixed: "right", width: 130, render: (_, row: any) => <ActionDropdown ariaLabel={uiText("Aksi pengiriman {{v0}}", { v0: row.id })} items={[
          { key: "message", label: uiText("Lihat pesan"), onClick: () => setMessageId(row.id) },
          ...(["FAILED", "UNCERTAIN"].includes(row.status) ? [{ key: "reset", label: uiText("Reset pengiriman"), onClick: () => { setResetError(""); setResetRow(row); } }] : []),
          ...(canSendWebhook ? [{ key: "webhook", label: uiText("Kirim webhook"), onClick: () => setWebhookRow(row) }] : []),
        ]} /> },
      ]} />
    <DispatchMessageModal key={messageId || "closed"} id={messageId} onClose={() => setMessageId(undefined)} />
    <Modal open={!!resetRow} title={uiText("Reset pengiriman?")} okText={uiText("Reset dan antrekan ulang")} cancelText={uiText("Batal")} onOk={resetDispatch}
      onCancel={() => { if (!resetting) setResetRow(undefined); }} confirmLoading={resetting}
      closable={!resetting} maskClosable={false} keyboard={!resetting} cancelButtonProps={{ disabled: resetting }}>
      <Space direction="vertical" style={{ width: "100%" }}>
        <p>{uiText("Pengiriman ke")} {resetRow?.recipient}  {uiText("akan kembali ke status Menunggu pengiriman dengan percobaan nol dan waktu antrean baru. ID pengiriman, transaksi, dan isi pesan tetap sama.")}</p>
        <Alert type="warning" showIcon message={uiText("Periksa penerima sebelum mengirim ulang")}
          description={uiText("Pesan dengan hasil belum pasti mungkin sudah diterima. Reset akan mengirim ulang pesan dan dapat menyebabkan pesan ganda.")} />
        {resetError && <Alert type="error" showIcon message={uiText(resetError)} />}
      </Space>
    </Modal>
    {webhookRow && <DispatchWebhookModal key={webhookRow.id} row={webhookRow} onClose={() => setWebhookRow(undefined)} />}
  </Space>;
}
DispatchPage.getLayout = (page: ReactElement) => <Layout title="ANTREAN PENGIRIMAN">{page}</Layout>;
export const getStaticProps = async ({ locale }: { locale: string }) => ({ props: { ...(await serverSideTranslations(locale, ["common", "upgrade", "interface"])) } });
