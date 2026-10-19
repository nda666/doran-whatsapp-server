import { useUiTranslation } from "@/lib/uiTranslation";
import { statusLabel } from "@/lib/messagingLabels";
import DispatchWindowNotice from "@/components/DispatchWindowNotice";
import FilterSelect from "@/components/FilterSelect";
import { ReactElement, useEffect, useState } from "react";
import { Alert, Button, Card, DatePicker, Form, Space, Tabs, Tag, message } from "antd";
import { useRouter } from "next/router";
import PhoneReport from "@/components/PhoneReport";
import dayjs from "dayjs";
import axios from "axios";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import Layout from "@/components/Layout";
import Table from "@/components/DashboardTable";
import { useTableState } from "@/lib/useTableState";
import { useDashboardApi } from "@/lib/useDashboardApi";
export default function Reports() {
  const uiText = useUiTranslation();
  const router = useRouter();
  const activeKey = router.query.view === "details" ? "details" : "phones";
  return <Tabs activeKey={activeKey} onChange={view => { void router.replace({ pathname: router.pathname, query: { ...router.query, view } }, undefined, { shallow: true }); }} items={[
    { key: "phones", label: uiText("Rekap per Nomor WA"), children: <PhoneReport /> },
    { key: "details", label: uiText("Detail pengiriman"), children: <DispatchReports /> },
  ]} />;
}
function DispatchReports() {
  const uiText = useUiTranslation();
  const table = useTableState();
  const [applied, setApplied] = useState<{ start: string; end: string; phoneId: string }>();
  const [form] = Form.useForm();
  const url = `/api/reports?${new URLSearchParams(applied || {}).toString()}`;
  const api = useDashboardApi(`${url}&${table.params}`, 30000), phones = useDashboardApi("/api/phones?options=1");
  useEffect(() => { if (!applied && api.data?.display_window) { const window = api.data.display_window; form.setFieldsValue({ period: [dayjs(window.start), dayjs(window.end)] }); } }, [api.data?.display_window?.days, applied, form]);
  const exportCsv = async () => { try { const r = await axios.get(`${url}&export=csv`, { headers: api.headers, responseType: "blob" }); const downloadUrl = URL.createObjectURL(r.data); const a = document.createElement("a"); a.href = downloadUrl; a.download = "laporan.csv"; a.click(); URL.revokeObjectURL(downloadUrl); } catch { message.error(uiText("Ekspor gagal; maksimal 10.000 baris per periode.")); } };
  return <Space direction="vertical" size="middle" style={{ width: "100%" }}>
    <Card title={uiText("Pencarian")}><Form form={form} layout="vertical" colon={false} className="dashboard-filter-grid" onFinish={values => { setApplied({ start: values.period[0].format("YYYY-MM-DD"), end: values.period[1].format("YYYY-MM-DD"), phoneId: values.phoneId || "" }); table.reset(); api.reload(); }}>
      <Form.Item name="period" label={uiText("Periode laporan")} rules={[{ required: true }]}><DatePicker.RangePicker format="DD/MM/YYYY" allowClear={false} /></Form.Item>
      <Form.Item name="phoneId" label={uiText("Perangkat")}><FilterSelect showSearch allLabel={uiText("Semua perangkat")} options={(phones.data || []).map((p: any) => ({ value: p.id, label: p.name }))} /></Form.Item>
      <div className="dashboard-filter-actions"><Button type="primary" htmlType="submit">{uiText("Proses")}</Button><Button disabled={!api.data} onClick={exportCsv}>{uiText("Ekspor CSV")}</Button></div>
    </Form></Card>
    <DispatchWindowNotice window={api.data?.display_window} />
    <Alert type="info" showIcon message={uiText("Periode pencarian mempersempit rentang usia sesuai setting. Tabel, hitungan status, dan export CSV menggunakan batas yang sama.")} />
    {api.error && <Alert type="error" message={uiText(api.error)} />}
    <Space wrap>{Object.entries(api.data?.counts || {}).map(([s, count]) => <Tag key={s}>{uiText(statusLabel(s))}: {String(count)}</Tag>)}</Space>
    <Table table={table} total={api.data?.total} className="table-with-data-count" rowKey="id" scroll={{ x: true }} dataSource={api.data?.data || []} columns={[
      { title: uiText("Penerima"), dataIndex: "recipient" }, { title: uiText("Perangkat"), dataIndex: "phoneId" }, { title: uiText("Sumber"), dataIndex: "source" }, { title: uiText("Status"), dataIndex: "status", render: (value: string) => uiText(statusLabel(value)) }, { title: uiText("Keterangan"), dataIndex: "lastError" }, { title: uiText("Dibuat"), dataIndex: "createdAt", render: v => dayjs(v).format("DD/MM/YYYY HH:mm") },
    ]} />
  </Space>;
}
Reports.getLayout = (page: ReactElement) => <Layout title="LAPORAN">{page}</Layout>;
export const getStaticProps = async ({ locale }: { locale: string }) => ({ props: { ...(await serverSideTranslations(locale, ["common", "upgrade", "interface"])) } });
