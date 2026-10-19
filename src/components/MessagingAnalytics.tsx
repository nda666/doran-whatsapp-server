import { useUiTranslation } from "@/lib/uiTranslation";
import { useState } from "react";
import { Alert, Card, Col, Row, Segmented, Skeleton, Statistic, Table, Tag, Tooltip } from "antd";
import { ArrowDownOutlined, ArrowUpOutlined, InfoCircleOutlined } from "@ant-design/icons";
import { useDashboardApi } from "@/lib/useDashboardApi";
import { RankingChart } from "./DashboardCharts";
import styles from "@/styles/DashboardSummary.module.css";

export default function MessagingAnalytics() {
  const uiText = useUiTranslation();
  const [period, setPeriod] = useState("day");
  const api = useDashboardApi(`/api/messaging-analytics?period=${period}`, 60000);
  const phones = useDashboardApi<any[]>("/api/device-policies", 60000);
  const c = api.data?.current, p = api.data?.previous;
  const sentCount = (r: any) => (r.counts.SENT || 0) + (r.counts.DELIVERED || 0) + (r.counts.READ || 0);
  const topDevices = [...(c?.devices || [])].sort((a, b) => sentCount(b) - sentCount(a)).slice(0, 5);
  return <section className={styles.comparison} aria-label={uiText("Perbandingan periode")}>
    <div className={styles.comparisonHeader}>
      <div className={styles.sectionHeading}><div><h2>{uiText("Performa pengiriman")} <Tooltip title={uiText("WIB. Periode sebelumnya memakai durasi berjalan yang sama. Hasil mengikuti waktu masuk antrean; laporan diterima dan dibaca dapat terlambat.")}><InfoCircleOutlined style={{ fontSize: 12, color: "var(--ui-muted)" }} /></Tooltip></h2><p>{period === "day" ? uiText("Hari ini dibandingkan kemarin") : uiText("Minggu ini dibandingkan minggu lalu")}  {uiText("· WIB")}</p></div></div>
      <Segmented aria-label={uiText("Periode perbandingan")} value={period} onChange={v => setPeriod(String(v))} options={[{ label: uiText("Hari ini"), value: "day" }, { label: uiText("Minggu ini"), value: "week" }]} />
    </div>
    {api.error && <Alert type="error" message={uiText(api.error)} showIcon style={{ marginBottom: 16 }} />}
    <div className={styles.comparisonStats}>{[["sent", uiText("Terkirim")], ["delivered", uiText("Diterima")], ["read", uiText("Dibaca")], ["failed", uiText("Gagal terminal")]].map(([key, label]) => {
      const delta = c && p ? c[key] - p[key] : 0;
      const favorable = key === "failed" ? delta < 0 : delta > 0;
      return <div className={styles.comparisonStat} key={key}>{!c && !api.error ? <Skeleton active paragraph={{ rows: 1 }} /> : <>
        <Statistic title={label} value={c ? c[key] : "—"} groupSeparator="." />
        <Tooltip title={`Sebelumnya: ${p?.[key] ?? "—"} pesan. ${delta > 0 ? "+" : ""}${delta} pesan.`}><span className={`${styles.delta} ${delta ? favorable ? styles.positive : styles.negative : ""}`}>
          {delta > 0 ? <ArrowUpOutlined /> : delta < 0 ? <ArrowDownOutlined /> : null}
          {p?.[key] ? uiText("{{v0}}%", { v0: Math.abs(delta / p[key] * 100).toFixed(1) }) : c ? uiText("{{v0}}{{v1}} pesan", { v0: delta > 0 ? "+" : "", v1: delta }) : "—"} <span>{p?.[key] ? uiText("vs periode lalu") : uiText("· belum ada pembanding %")}</span>
        </span></Tooltip>
      </>}</div>;
    })}</div>
    <details className={styles.details}><summary>{uiText("Lihat analisis dan rincian perangkat")}</summary>
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={12}><Card title={uiText("Alasan kegagalan")}><RankingChart emptyDescription={uiText("Tidak ada kegagalan pada periode ini")} items={(c?.failures || []).map((r: any) => ({ label: uiText(r.reason), count: r.count, color: "var(--chart-failed, #f3a0b0)" }))} /></Card></Col>
        <Col xs={24} xl={12}><Card title={uiText("5 perangkat teratas pada periode ini")}><RankingChart items={topDevices.map((r: any) => ({ label: phones.data?.find(p => p.id === r.phoneId)?.name || r.phoneId, count: sentCount(r), color: "var(--chart-delivered, #79dfbb)" }))} /></Card></Col>
        <Col span={24}><Card title={uiText("Rincian seluruh perangkat")}>
          {phones.error && <Alert type="warning" showIcon message={uiText("Status koneksi belum dapat dimuat.")} />}
          <Table rowKey="phoneId" dataSource={c?.devices || []} loading={!c && !api.error} pagination={{ pageSize: 10, showSizeChanger: false }} scroll={{ x: 700 }} columns={[
            { title: uiText("Perangkat"), render: (_, r: any) => phones.data?.find(p => p.id === r.phoneId)?.name || r.phoneId },
            { title: uiText("Koneksi saat ini"), render: (_, r: any) => { const phone = phones.data?.find(p => p.id === r.phoneId); return phone ? <Tag color={phone.isOnline ? "green" : "default"}>{phone.isOnline ? uiText("Terhubung") : uiText("Terputus")}</Tag> : uiText("Belum diketahui"); } },
            ...[["SENT", uiText("Terkirim")], ["DELIVERED", uiText("Diterima")], ["READ", uiText("Dibaca")], ["FAILED", uiText("Gagal")], ["SUPPRESSED", uiText("Diblokir")]].map(([key, title]) => ({ title, render: (_: any, r: any) => r.counts[key] || 0 })),
          ]} />
        </Card></Col>
      </Row>
    </details>
  </section>;
}
