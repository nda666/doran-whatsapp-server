import { useEffect, useState } from "react";
import { Alert, Button, Card, DatePicker, Form, Space, Typography, message } from "antd";
import { CheckCircleOutlined, ClockCircleOutlined, CloseCircleOutlined, SendOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import axios from "axios";
import { useRouter } from "next/router";
import { useUiTranslation } from "@/lib/uiTranslation";
import { useDashboardApi } from "@/lib/useDashboardApi";
import { useTableState } from "@/lib/useTableState";
import { defaultDispatchDates } from "@/lib/dispatchDateFilter";
import type { PhoneReportRow } from "@/lib/phoneReport";
import Table from "@/components/DashboardTable";
import SummaryCards from "@/components/SummaryCards";
import FilterSelect from "@/components/FilterSelect";

type Filters = { start: string; end: string; phoneId: string };
export default function PhoneReport() {
  const uiText = useUiTranslation();
  const router = useRouter();
  const table = useTableState();
  const [form] = Form.useForm();
  const [applied, setApplied] = useState<Filters>();
  const linkedPhone = typeof router.query.phoneId === "string" ? router.query.phoneId : "";
  useEffect(() => {
    if (!router.isReady) return;
    const dates = defaultDispatchDates();
    const next = { start: dates.start_date, end: dates.end_date, phoneId: linkedPhone };
    setApplied(next);
    form.setFieldsValue({ period: [dayjs(next.start), dayjs(next.end)], phoneId: next.phoneId });
    table.reset();
    // Only a navigation to a different device resets the applied period.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, linkedPhone, form]);
  const url = applied ? `/api/reports?view=phones&${new URLSearchParams(applied)}` : "";
  const api = useDashboardApi<{ data: PhoneReportRow[]; total: number; counts: Pick<PhoneReportRow, "total" | "sent" | "failed" | "waiting"> }>(url ? `${url}&${table.params}` : "", 30000);
  const phones = useDashboardApi<Array<{ id: string; name: string; number: string | null }>>("/api/phones?options=1");
  const [exporting, setExporting] = useState(false);
  const exportCsv = async () => {
    setExporting(true);
    try {
      const result = await axios.get(`${url}&${table.params}&export=csv`, { headers: api.headers, responseType: "blob" });
      const downloadUrl = URL.createObjectURL(result.data);
      const link = document.createElement("a");
      link.href = downloadUrl; link.download = `rekap-per-nomor-${applied!.start}-${applied!.end}.csv`;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
    } catch { message.error(uiText("Ekspor gagal. Coba kembali atau pilih perangkat tertentu.")); }
    finally { setExporting(false); }
  };
  return <Space direction="vertical" size="middle" style={{ width: "100%" }}>
    <Card title={uiText("Rekap per Nomor WA")}>
      <Form form={form} layout="vertical" colon={false} className="dashboard-filter-grid" onFinish={values => {
        setApplied({ start: values.period[0].format("YYYY-MM-DD"), end: values.period[1].format("YYYY-MM-DD"), phoneId: values.phoneId || "" });
        table.reset();
      }}>
        <Form.Item name="period" label={uiText("Periode laporan (WIB)")} rules={[{ required: true, message: uiText("Pilih tanggal mulai dan selesai.") }]}>
          <DatePicker.RangePicker format="DD/MM/YYYY" allowClear={false} />
        </Form.Item>
        <Form.Item name="phoneId" label={uiText("Nomor WA / perangkat")}>
          <FilterSelect showSearch allLabel={uiText("Semua perangkat")} options={(phones.data || []).map(phone => ({ value: phone.id, label: `${phone.number || "—"} · ${phone.name}` }))} />
        </Form.Item>
        <div className="dashboard-filter-actions"><Button type="primary" htmlType="submit">{uiText("Proses")}</Button><Button disabled={!api.data || !!api.error} loading={exporting} onClick={exportCsv}>{uiText("Ekspor CSV")}</Button><Button onClick={api.reload} disabled={!url}>{uiText("Muat ulang")}</Button></div>
      </Form>
    </Card>
    <Alert type="info" showIcon message={uiText("Terkirim mencakup pesan berstatus terkirim, diterima, dan dibaca; dihitung berdasarkan waktu kirim. Status lainnya berdasarkan waktu dibuat. Setiap pesan dihitung satu kali, bukan jumlah penerima unik.")} description={uiText("Tanggal mulai dan selesai mencakup satu hari penuh dalam WIB. Rekap memakai seluruh riwayat pengiriman yang masih tersimpan, tanpa batas usia tampilan antrean. Status mencerminkan kondisi terbaru; pengiriman melalui antrean aplikasi yang tercatat akan dihitung.")} />
    {api.error && <Alert type="error" showIcon message={uiText(api.error)} />}
    <SummaryCards title={uiText("Ringkasan pengiriman")} caption={applied ? `${dayjs(applied.start).format("DD/MM/YYYY")} – ${dayjs(applied.end).format("DD/MM/YYYY")} (WIB)` : undefined} items={[
      { key: "total", label: uiText("Total pesan"), value: api.data?.counts.total, color: "#1677ff", icon: <SendOutlined />, unit: "pesan" },
      { key: "sent", label: uiText("Berhasil terkirim"), value: api.data?.counts.sent, color: "#389e0d", icon: <CheckCircleOutlined />, unit: "pesan" },
      { key: "failed", label: uiText("Gagal"), value: api.data?.counts.failed, color: "#cf1322", icon: <CloseCircleOutlined />, unit: "pesan" },
      { key: "waiting", label: uiText("Menunggu / diproses"), value: api.data?.counts.waiting, color: "#d48806", icon: <ClockCircleOutlined />, unit: "pesan" },
    ]} />
    <Table<PhoneReportRow> table={table} total={api.data?.total} loading={!!url && !api.data && !api.error} rowKey="phoneId" scroll={{ x: 1000 }} dataSource={api.error ? [] : api.data?.data || []} columns={[
      { title: uiText("Nomor WA"), dataIndex: "number", render: (value, row) => value || <Typography.Text type="secondary" title={row.phoneId}>—</Typography.Text> },
      { title: uiText("Perangkat"), dataIndex: "name", render: (value, row) => <span title={row.phoneId}>{uiText(value)}</span> },
      ...([ ["total", "Total pesan"], ["sent", "Berhasil terkirim"], ["failed", "Gagal"], ["waiting", "Menunggu / diproses"], ["uncertain", "Belum pasti"], ["suppressed", "Diblokir"] ] as const).map(([key, label]) => ({ title: uiText(label), dataIndex: key, align: "right" as const, render: (value: number) => value.toLocaleString(uiText.locale) })),
    ]} />
  </Space>;
}
