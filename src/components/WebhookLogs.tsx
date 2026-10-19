import { useUiTranslation, type UiTranslator } from "@/lib/uiTranslation";
import { useState } from "react";
import { Alert, Button, Card, DatePicker, Descriptions, Form, Input, Modal, Select, Space, Tag, Typography } from "antd";
import { EyeOutlined } from "@ant-design/icons";
import Table from "@/components/DashboardTable";
import ActionDropdown from "@/components/ActionDropdown";
import { useTableState } from "@/lib/useTableState";
import dayjs from "dayjs";
import { useDashboardApi } from "@/lib/useDashboardApi";

const names = (uiText: UiTranslator): Record<string, string> => ({ dispatch: uiText("Status Pengiriman"), device: uiText("Perangkat") });
const statuses = ["PENDING", "SENDING", "DELIVERED", "FAILED", "CANCELLED"];
const date = (value: string | null) => value ? dayjs(value).format("DD/MM/YYYY HH:mm:ss") : "—";
const statusTag = (value: string) => <Tag color={value === "DELIVERED" ? "green" : value === "FAILED" ? "red" : value === "CANCELLED" ? "default" : "gold"}>{value}</Tag>;
type Props = { initialType?: string };

export default function WebhookLogs({ initialType = "all" }: Props) {
  const uiText = useUiTranslation();
  const [filters, setFilters] = useState({ type: initialType, status: "", q: "", from: "", to: "" });
  const table = useTableState();
  const [selected, setSelected] = useState<{ type: string; id: number } | null>(null);
  const params = new URLSearchParams(table.params);
  Object.entries(filters).forEach(([key, value]) => params.set(key, value));
  if (!filters.from) params.delete("from");
  if (!filters.to) params.delete("to");
  const api = useDashboardApi(`/api/admin/webhook-logs?${params}`, 10000);
  const detail = useDashboardApi(selected ? `/api/admin/webhook-logs?type=${selected.type}&id=${selected.id}` : "", 10000);
  const event = detail.data?.event;
  let payload = event?.payload;
  try { if (payload) payload = JSON.stringify(JSON.parse(payload), null, 2); } catch { /* Show the stored text if it is not JSON. */ }
  return <Space direction="vertical" style={{ width: "100%" }}>
    <Alert type="info" showIcon message={uiText("Riwayat webhook status pengiriman dan perangkat")} description={uiText("Semua event yang masih tersimpan dapat ditelusuri di sini. Event selesai disimpan selama 30 hari; payload dihapus setelah selesai. Percobaan menunjukkan total upaya pengiriman, bukan riwayat respons HTTP per percobaan.")} />
    <Card title={uiText("Pencarian Log Webhook")}>
      <Form name="webhook-log-filters" layout="vertical" className="dashboard-filter-grid" initialValues={{ type: initialType, status: "" }} onFinish={values => {
        setFilters({ type: values.type || "all", status: values.status || "", q: values.q || "", from: values.range?.[0]?.startOf("day").toISOString() || "", to: values.range?.[1]?.endOf("day").toISOString() || "" }); table.reset();
      }}>
        <Form.Item name="type" label={uiText("Jenis webhook")}><Select options={[{ value: "all", label: uiText("Semua webhook") }, ...Object.entries(names(uiText)).map(([value, label]) => ({ value, label }))]} /></Form.Item>
        <Form.Item name="status" label={uiText("Status webhook")}><Select options={[{ value: "", label: uiText("Semua status") }, ...statuses.map(value => ({ value, label: value }))]} /></Form.Item>
        <Form.Item name="q" label={uiText("ID / event / keterangan")}><Input allowClear placeholder={uiText("Cari ID event, pengiriman, atau perangkat")} /></Form.Item>
        <Form.Item name="range" label={uiText("Tanggal event")}><DatePicker.RangePicker format="DD/MM/YYYY" style={{ width: "100%" }} /></Form.Item>
        <div className="dashboard-filter-actions"><Space><Button type="primary" htmlType="submit">{uiText("Cari")}</Button><Button onClick={api.reload}>{uiText("Refresh Log")}</Button></Space></div>
      </Form>
    </Card>
    {api.error && <Alert type="error" message={uiText(api.error)} />}
      <Table<any> className="table-with-data-count" rowKey={row => `${row.type}-${row.id}`} loading={!api.data && !api.error} scroll={{ x: 1770 }} dataSource={api.data?.data || []}
        table={table} total={api.data?.total} columns={[
          { title: uiText("Waktu"), dataIndex: "createdAt", render: date, width: 170 },
          { title: uiText("Jenis"), dataIndex: "type", width: 150, render: value => names(uiText)[value] },
          { title: uiText("Event"), dataIndex: "event", width: 220 },
          { title: uiText("ID Event"), dataIndex: "eventId", width: 300, render: value => <Typography.Text copyable>{value}</Typography.Text> },
          { title: uiText("ID Pengiriman / Perangkat"), dataIndex: "referenceId", width: 300, render: value => value ? <Typography.Text copyable>{value}</Typography.Text> : "Tes" },
          { title: uiText("Status"), dataIndex: "status", width: 120, render: statusTag },
          { title: uiText("Percobaan"), dataIndex: "attempts", width: 110 },
          { title: uiText("Keterangan"), dataIndex: "lastError", width: 180, render: value => value || "—" },
          { title: uiText("Aksi"), key: "aksi", width: 120, render: (_, row) => <ActionDropdown ariaLabel={uiText("Aksi log webhook {{v0}}", { v0: row.eventId })} items={[{ key: "detail", label: uiText("Lihat Detail"), icon: <EyeOutlined />, onClick: () => setSelected({ type: row.type, id: row.id }) }]} /> },
        ]} />
    <Modal title={uiText("Detail Log Pengiriman Webhook")} open={!!selected} width={900} onCancel={() => setSelected(null)} footer={<Button onClick={() => setSelected(null)}>{uiText("Tutup")}</Button>}>
      {detail.error && <Alert type="error" message={uiText(detail.error)} />}
      {!event && !detail.error && <p>{uiText("Memuat detail...")}</p>}
      {event && <Space direction="vertical" style={{ width: "100%" }}>
        <Descriptions bordered size="small" column={1} items={[
          { key: "type", label: uiText("Jenis"), children: names(uiText)[event.type] },
          { key: "id", label: uiText("Sequence"), children: event.id },
          { key: "eventId", label: uiText("ID Event"), children: <Typography.Text copyable>{event.eventId}</Typography.Text> },
          { key: "event", label: uiText("Event"), children: event.event },
          { key: "reference", label: uiText("ID Pengiriman / Perangkat"), children: event.dispatchId || event.deviceId || "Tes" },
          { key: "status", label: uiText("Status webhook"), children: statusTag(event.status) },
          { key: "attempts", label: uiText("Percobaan"), children: event.attempts },
          { key: "created", label: uiText("Dibuat"), children: date(event.createdAt) },
          { key: "delivered", label: uiText("Diterima endpoint"), children: date(event.deliveredAt) },
          { key: "next", label: uiText("Jadwal percobaan berikutnya"), children: ["PENDING", "SENDING"].includes(event.status) ? date(event.nextAttemptAt) : "—" },
          { key: "error", label: uiText("Keterangan terakhir"), children: event.lastError || "—" },
          { key: "revision", label: uiText("Revisi konfigurasi"), children: event.revision },
        ]} />
        {payload ? <Card size="small" title={uiText("Payload tersimpan")}><Typography.Paragraph copyable={{ text: payload }}>{uiText("Salin payload")}</Typography.Paragraph><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", maxHeight: 300, overflowY: "auto" }}>{payload}</pre></Card> : <Alert type="info" message={uiText("Payload sudah dihapus setelah event selesai atau dibatalkan.")} />}
      </Space>}
    </Modal>
  </Space>;
}
