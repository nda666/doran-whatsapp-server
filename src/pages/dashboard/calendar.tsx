import { useUiTranslation } from "@/lib/uiTranslation";
import { ReactElement, useState } from "react";
import { Alert, Button, Calendar, Card, DatePicker, Form, Modal, Select, Space, Table, Tag, Typography, message } from "antd";
import axios from "axios";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import Layout from "@/components/Layout";
import { useDashboardApi } from "@/lib/useDashboardApi";
import { statusLabel } from "@/lib/messagingLabels";
dayjs.extend(utc); dayjs.extend(timezone);
const wib = (value?: string) => dayjs(value).tz("Asia/Jakarta");
export default function ScheduleCalendar() {
  const uiText = useUiTranslation();
  const [date, setDate] = useState(wib()), [view, setView] = useState("month"), [device, setDevice] = useState(""), [status, setStatus] = useState("");
  const [editing, setEditing] = useState<any>(), [busy, setBusy] = useState(false);
  const start = view === "day" ? date.startOf("day") : view === "week" ? date.startOf("day").subtract((date.day() + 6) % 7, "day") : date.startOf("month").subtract(7, "day");
  const end = view === "day" ? start.add(1, "day") : view === "week" ? start.add(7, "day") : date.endOf("month").add(8, "day");
  const api = useDashboardApi<any[]>(`/api/campaign-schedules?${new URLSearchParams({ from: start.toISOString(), to: end.toISOString(), ...(device ? { phoneId: device } : {}), ...(status ? { status } : {}) })}`, 30000);
  const phones = useDashboardApi<any[]>("/api/device-policies");
  const data = api.data || [];
  const conflicts = data.filter(a => !["COMPLETED", "CLEARED"].includes(a.status) && data.some(b => b.id !== a.id && !["COMPLETED", "CLEARED"].includes(b.status) && a.phoneIds.some((id: string) => b.phoneIds.includes(id)) && Date.parse(a.scheduledAt) < Date.parse(b.estimatedEnd) && Date.parse(b.scheduledAt) < Date.parse(a.estimatedEnd)));
  const changeSchedule = async (values: any) => {
    setBusy(true);
    try { await axios.patch("/api/campaign-schedules", { id: editing.id, updatedAt: editing.updatedAt, scheduledAt: dayjs.tz(values.scheduledAt.format("YYYY-MM-DD HH:mm:ss"), "Asia/Jakarta").toISOString() }, { headers: api.headers }); setEditing(undefined); api.reload(); message.success(uiText("Jadwal diperbarui.")); }
    catch (e: any) { message.error(uiText(e.response?.data?.message || uiText("Jadwal gagal diubah."))); } finally { setBusy(false); }
  };
  return <Space direction="vertical" size="middle" style={{ width: "100%" }}>
    <Space wrap><Select value={view} onChange={setView} options={[{ value: "month", label: uiText("Bulanan") }, { value: "week", label: uiText("Mingguan") }, { value: "day", label: uiText("Harian") }, { value: "agenda", label: uiText("Agenda") }]} /><DatePicker value={date} allowClear={false} onChange={v => v && setDate(v.tz("Asia/Jakarta", true))} /><Select style={{ minWidth: 200 }} value={device} onChange={setDevice} options={[{ value: "", label: uiText("Semua perangkat") }, ...(phones.data || []).map(p => ({ value: p.id, label: p.name }))]} /><Select style={{ minWidth: 180 }} value={status} onChange={setStatus} options={[{ value: "", label: uiText("Semua status") }, ...["WAITING", "PROCESSING", "PAUSED", "COMPLETED", "CLEARED"].map(value => ({ value, label: uiText(statusLabel(value)) }))]} /></Space>
    <Typography.Text type="secondary">{uiText("Semua jadwal ditampilkan dalam WIB. Perkiraan durasi berdasarkan jumlah penerima dan jeda campaign; kuota, koneksi, dan perlambatan dapat memperpanjang durasi.")}</Typography.Text>
    {api.error && <Alert type="error" message={uiText(api.error)} />}
    {conflicts.length > 0 && <Alert type="warning" showIcon message={uiText(`${conflicts.length} campaign berpotensi berbenturan pada perangkat yang sama dalam rentang ini.`)} />}
    {view === "month" && <Card><Calendar value={date} onSelect={v => setDate(v.tz("Asia/Jakarta", true))} onPanelChange={v => setDate(v.tz("Asia/Jakarta", true))} cellRender={(value, info) => info.type === "date" ? <div>{data.filter(c => wib(c.scheduledAt).format("YYYY-MM-DD") === value.format("YYYY-MM-DD")).map(c => <div key={c.id}><Button type="link" size="small" onClick={e => { e.stopPropagation(); setEditing(c); }}>{wib(c.scheduledAt).format("HH:mm")} {c.name}</Button></div>)}</div> : info.originNode} /></Card>}
    <Card title={view === "week" ? uiText("Agenda minggu ini") : view === "day" ? uiText("Agenda harian") : uiText("Daftar jadwal")}><Table rowKey="id" dataSource={data} scroll={{ x: true }} columns={[
      { title: uiText("Campaign"), dataIndex: "name" }, { title: uiText("Jadwal (WIB)"), dataIndex: "scheduledAt", render: v => wib(v).format("DD/MM/YYYY HH:mm") },
      { title: uiText("Status"), dataIndex: "status", render: (value: string) => uiText(statusLabel(value)) }, { title: uiText("Penerima"), render: (_, r: any) => r._count.dispatches },
      { title: uiText("Kapasitas"), render: (_, r: any) => <Tag color={conflicts.some(c => c.id === r.id) ? "orange" : "green"}>{conflicts.some(c => c.id === r.id) ? uiText("Potensi benturan") : uiText("Tidak terdeteksi benturan")}</Tag> },
      { title: uiText("Tindakan"), render: (_, r: any) => <Button disabled={!["WAITING", "PAUSED"].includes(r.status)} onClick={() => setEditing(r)}>{uiText("Ubah jadwal")}</Button> },
    ]} /></Card>
    <Modal open={!!editing} title={uiText("Jadwal {{v0}}", { v0: editing?.name || uiText("campaign") })} onCancel={() => setEditing(undefined)} footer={null} destroyOnClose>
      {editing && <Form key={editing.id} layout="vertical" initialValues={{ scheduledAt: wib(editing.scheduledAt) }} onFinish={changeSchedule}><Form.Item name="scheduledAt" label={uiText("Jadwal baru (WIB)")} rules={[{ required: true }]}><DatePicker showTime format="DD/MM/YYYY HH:mm" /></Form.Item><Button type="primary" htmlType="submit" loading={busy}>{uiText("Simpan jadwal")}</Button></Form>}
    </Modal>
  </Space>;
}
ScheduleCalendar.getLayout = (page: ReactElement) => <Layout title="Kalender pengiriman">{page}</Layout>;
export const getStaticProps = async ({ locale }: { locale: string }) => ({ props: { ...(await serverSideTranslations(locale, ["common", "upgrade", "interface"])) } });
