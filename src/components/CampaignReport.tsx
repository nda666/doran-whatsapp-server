import { useUiTranslation } from "@/lib/uiTranslation";
import { useState } from "react";
import { Alert, Button, Card, Col, Row, Space, Statistic, Table, Typography, message } from "antd";
import axios from "axios";
import { useDashboardApi } from "@/lib/useDashboardApi";
import { statusLabel } from "@/lib/messagingLabels";
import { RankingChart } from "./DashboardCharts";
export default function CampaignReport({ campaignId }: { campaignId: string }) {
  const uiText = useUiTranslation();
  const api = useDashboardApi(`/api/campaign-report?campaignId=${campaignId}`, 15000);
  const [busy, setBusy] = useState("");
  const exportFile = async (format: string) => {
    setBusy(format);
    try { const response = await axios.get(`/api/campaign-report?campaignId=${campaignId}&export=${format}`, { headers: api.headers, responseType: "blob" }); const url = URL.createObjectURL(response.data); const a = document.createElement("a"); a.href = url; a.download = `campaign-${campaignId}.${format}`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
    catch (e: any) { let text = uiText("Ekspor gagal. Coba kembali."); try { text = JSON.parse(await e.response.data.text()).message || text; } catch {} message.error(uiText(text)); } finally { setBusy(""); }
  };
  const s = api.data?.summary;
  return <Space direction="vertical" size="middle" style={{ width: "100%", marginBottom: 20 }}>
    {api.error && <Alert type="error" message={uiText(api.error)} />}
    <Space><Button disabled={!s || !!busy} loading={busy === "xlsx"} onClick={() => exportFile("xlsx")}>{uiText("Ekspor Excel")}</Button><Button disabled={!s || !!busy} loading={busy === "pdf"} onClick={() => exportFile("pdf")}>{uiText("Ekspor ringkasan PDF")}</Button></Space>
    <Row gutter={[8, 8]}>{[["sent", uiText("Terkirim")], ["delivered", uiText("Diterima")], ["read", uiText("Dibaca")], ["failed", uiText("Gagal setelah dicoba")], ["suppressed", uiText("Diblokir")], ["pending", uiText("Menunggu / diproses")]].map(([key, title]) => <Col key={key} xs={12} md={8}><Card size="small"><Statistic title={title} value={s?.[key] || 0} /></Card></Col>)}</Row>
    <Space wrap>{[["deliveryRate", uiText("Tingkat diterima")], ["readRate", uiText("Tingkat dibaca")], ["failureRate", uiText("Tingkat gagal")]].map(([key, label]) => <Typography.Text key={key}>{label}: {s?.[key] == null ? uiText("Belum tersedia") : uiText("{{v0}}%", { v0: s[key].toFixed(1) })}</Typography.Text>)}</Space>
    <Typography.Text type="secondary">{uiText(api.data?.note)}</Typography.Text>
    <Card size="small" title={uiText("Alasan kegagalan")}><RankingChart items={(s?.failures || []).map((r: any) => ({ label: uiText(r.reason), count: r.count, color: "#cf1322" }))} /></Card>
    <Table size="small" rowKey="phoneId" dataSource={s?.devices || []} pagination={false} columns={[
      { title: uiText("Perangkat"), render: (_, d: any) => api.data?.devices.find((p: any) => p.id === d.phoneId)?.name || d.phoneId },
      { title: uiText("Status terkini"), render: (_, d: any) => Object.entries(d.counts).map(([status, count]) => `${uiText(statusLabel(status))}: ${count}`).join(" · ") },
    ]} />
  </Space>;
}
