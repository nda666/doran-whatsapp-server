import { useUiTranslation, type UiTranslator } from "@/lib/uiTranslation";
import MessagingAnalytics from "@/components/MessagingAnalytics";
import { ReactElement } from "react";
import { Alert, Button, Card, Col, Row, Skeleton, Tooltip } from "antd";
import dayjs from "dayjs";
import Link from "next/link";
import { ArrowRightOutlined, CheckCircleOutlined, ClockCircleOutlined, InfoCircleOutlined, SendOutlined, WhatsAppOutlined } from "@ant-design/icons";
import styles from "@/styles/DashboardSummary.module.css";
import { formatDispatchWindow } from "@/lib/dispatchWindow";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import Layout from "@/components/Layout";
import { ActivityChart, DistributionChart, RankingChart } from "@/components/DashboardCharts";
import { useDashboardApi } from "@/lib/useDashboardApi";
import packageInfo from "../../../package.json";

type DashboardData = {
  devices: number; online: number; unrestricted: boolean; deviceLimit: number; plan: string; subscriptionExpiresAt?: string;
  counts: Record<string, number>; activeCampaigns: number; periodCounts: Record<string, number>;
  period: { days: number; start: string; end: string }; series: { day: string; count: number }[];
  deviceHealth: { online: number; offline: number; inactive: number };
  hourly: { hour: number; count: number }[];
  topDevices: { phoneId: string; name: string; number: string; count: number }[];
};
const statuses = (uiText: UiTranslator) => ([
  { key: "QUEUED", label: uiText("Menunggu"), color: "var(--chart-queued, #f4cc83)" },
  { key: "PROCESSING", label: uiText("Diproses"), color: "var(--chart-processing, #89deda)" },
  { key: "SENT", label: uiText("Terkirim"), color: "var(--chart-sent, #83c9f4)" },
  { key: "DELIVERED", label: uiText("Diterima"), color: "var(--chart-delivered, #79dfbb)" },
  { key: "READ", label: uiText("Dibaca"), color: "var(--chart-read, #c5aff1)" },
  { key: "FAILED", label: uiText("Gagal"), color: "var(--chart-failed, #f3a0b0)" },
  { key: "SUPPRESSED", label: uiText("Diblokir"), color: "var(--chart-suppressed, #b5c8d6)" },
  { key: "UNCERTAIN", label: uiText("Perlu diperiksa"), color: "var(--chart-uncertain, #f3b98d)" },
]);
const number = (uiText: UiTranslator, value: number) => value.toLocaleString(uiText.locale);

export default function Dashboard() {
  const uiText = useUiTranslation();
  const api = useDashboardApi<DashboardData>("/api/dashboard-stats", 30000);
  const d = api.data, c = d?.counts || {}, loading = !d && !api.error;
  const period = d ? formatDispatchWindow(d.period, uiText.locale) : uiText("Memuat periode…");
  const days = d?.period.days;
  const sent = (c.SENT || 0) + (c.DELIVERED || 0) + (c.READ || 0);
  const metrics = [
    { title: uiText("Perangkat WhatsApp"), value: d?.devices, icon: <WhatsAppOutlined />, tone: "green", detail: uiText("{{v0}} online · {{v1}} offline", { v0: number(uiText, d?.online || 0), v1: number(uiText, d ? d.devices - d.online : 0) }), href: "/dashboard/phone" },
    { title: uiText("Pesan terkirim"), value: sent, icon: <CheckCircleOutlined />, tone: "blue", detail: uiText("Terkirim, diterima, dan dibaca"), href: "/dashboard/reports" },
    { title: uiText("Dalam antrean"), value: (c.QUEUED || 0) + (c.PROCESSING || 0), icon: <ClockCircleOutlined />, tone: "amber", detail: uiText("{{v0}} gagal · {{v1}} perlu diperiksa", { v0: number(uiText, c.FAILED || 0), v1: number(uiText, c.UNCERTAIN || 0) }), href: "/dashboard/dispatch" },
    { title: uiText("Kampanye aktif"), value: d?.activeCampaigns, icon: <SendOutlined />, tone: "purple", detail: uiText("Kelola jadwal dan penerima pesan"), href: "/dashboard/campaigns" },
  ];
  return <div className={styles.dashboard}>
    {api.error && <Alert type="error" message={uiText(api.error)} showIcon action={<Button size="small" onClick={api.reload}>{uiText("Coba lagi")}</Button>} />}
    <div className={styles.sectionHeading}><div><h2>{uiText("Ringkasan operasional")}</h2><p>{days ? uiText("Pengiriman {{v0}} hari terakhir", { v0: days }) : uiText("Memuat rentang pengiriman…")}  {uiText("· Kondisi perangkat saat ini")}</p></div><span className={styles.live}><span />  {uiText("Pembaruan otomatis · 30 dtk")}</span></div>
    <div className={styles.metrics}>{metrics.map(m => <article key={m.title} className={styles.metric}>
      <div className={styles.metricTop}><span>{m.title}</span><span className={`${styles.metricIcon} ${styles[m.tone]}`}>{m.icon}</span></div>
      {loading ? <Skeleton.Input active size="small" /> : <strong className={styles.metricValue}>{api.error && !d ? "—" : number(uiText, m.value || 0)}</strong>}
      <div className={styles.metricBottom}><span>{m.detail}</span></div>
      <Link href={m.href} className={styles.metricDetail} aria-label={uiText("Lihat detail {{v0}}", { v0: m.title.toLowerCase() })}><span>{uiText("Lihat detail")}</span><ArrowRightOutlined /></Link>
    </article>)}</div>
    {d?.unrestricted === false && <div className={styles.plan}><span>{uiText("Paket")} <strong>{d.plan || "—"}</strong> · {d.devices}/{d.deviceLimit}  {uiText("perangkat · Berakhir")} {d.subscriptionExpiresAt ? dayjs(d.subscriptionExpiresAt).format("DD/MM/YYYY") : uiText("belum ditetapkan")}</span><Link href="/dashboard/profile">{uiText("Lihat akun")} <ArrowRightOutlined /></Link></div>}
    <Row gutter={[20, 20]}>
      <Col xs={24} xl={16}><Card className={styles.panel} title={uiText("Aktivitas pengiriman")} loading={loading} extra={<Tooltip title={period}><span className={styles.period}>{days ? uiText("{{v0}} hari terakhir", { v0: days }) : uiText("Periode pengiriman")} <InfoCircleOutlined /></span></Tooltip>}>
        <div className={styles.chartSummary}><strong>{number(uiText, d?.series.reduce((sum, r) => sum + r.count, 0) || 0)}</strong><span>{uiText("pesan terkirim dalam periode ini")}</span><span className={styles.legend}><i />  {uiText("Terkirim")}</span></div>
        <ActivityChart showValues label={uiText("Grafik pesan terkirim {{v0}} hari (WIB)", { v0: days || "" })} items={(d?.series || []).map(r => ({ label: dayjs(r.day).format("DD/MM"), count: r.count, color: "var(--chart-delivered, #79dfbb)" }))} />
        <p className={styles.caption}>{period}  {uiText("· Berdasarkan tanggal terkirim (WIB).")}</p>
      </Card></Col>
      <Col xs={24} xl={8}><Card className={styles.panel} title={uiText("Kondisi perangkat")} loading={loading} extra={<Link href="/dashboard/phone" aria-label={uiText("Lihat semua perangkat")}><ArrowRightOutlined /></Link>}>
        <DistributionChart label={uiText("Kondisi perangkat saat ini")} items={[
          { label: uiText("Aktif & online"), count: d?.deviceHealth.online || 0, color: "var(--chart-delivered, #79dfbb)" },
          { label: uiText("Aktif & offline"), count: d?.deviceHealth.offline || 0, color: "var(--chart-queued, #f4cc83)" },
          { label: uiText("Nonaktif"), count: d?.deviceHealth.inactive || 0, color: "var(--chart-suppressed, #b5c8d6)" },
        ]} />
        <Link className={styles.shortcut} href="/dashboard/phone"><span>{d?.deviceHealth.offline ? uiText("{{v0}} perangkat offline perlu diperiksa", { v0: number(uiText, d.deviceHealth.offline) }) : uiText("Kelola koneksi perangkat")}</span><ArrowRightOutlined /></Link>
      </Card></Col>
    </Row>
    <MessagingAnalytics />
    <div className={styles.sectionHeading}><div><h2>{uiText("Lebih dekat dengan pengiriman Anda")}</h2><p>{uiText("Distribusi status, waktu pengiriman, dan perangkat teratas.")}</p></div><Link href="/dashboard/reports" className={styles.textLink}>{uiText("Laporan lengkap")} <ArrowRightOutlined /></Link></div>
    <Row gutter={[20, 20]}>
      <Col xs={24} xl={12}><Card className={`${styles.panel} ${styles.contentPanel}`} title={uiText("Status pengiriman")} loading={loading} extra={<Link href="/dashboard/dispatch">{uiText("Lihat antrean")} <ArrowRightOutlined /></Link>}>
        <DistributionChart label={uiText("Distribusi status pesan dalam periode pengiriman")} items={statuses(uiText).map(s => ({ ...s, count: d?.periodCounts[s.key] || 0 }))} />
        <p className={styles.caption}>{uiText("Status terkini pesan yang masuk antrean pada periode ini. Diterima dan dibaca mengikuti laporan WhatsApp.")}</p>
      </Card></Col>
      <Col xs={24} xl={12}><Card className={styles.panel} title={uiText("Perangkat paling aktif")} loading={loading} extra={<span className={styles.period}>{uiText("TOP 5")}</span>}>
        <RankingChart items={(d?.topDevices || []).map(r => ({ label: r.name, detail: r.number || r.phoneId, count: r.count, color: "var(--chart-delivered, #79dfbb)" }))} />
        <p className={styles.caption}>{uiText("Berdasarkan jumlah pesan terkirim dalam periode pengiriman.")}</p>
      </Card></Col>
      <Col xs={24}><Card className={styles.panel} title={uiText("Waktu pengiriman")} loading={loading} extra={<span className={styles.period}>{uiText("Zona waktu WIB")}</span>}>
        <ActivityChart label={uiText("Jumlah pesan terkirim menurut jam WIB")} items={(d?.hourly || []).map(r => ({ label: String(r.hour).padStart(2, "0"), count: r.count, color: "var(--chart-processing, #89deda)" }))} />
        <p className={styles.caption}>{uiText("Total pesan terkirim pada setiap jam dari seluruh tanggal dalam periode ini, bukan rata-rata harian. Hari pertama dan terakhir dapat mencakup sebagian hari.")}</p>
      </Card></Col>
    </Row>
    <div className={styles.note}><InfoCircleOutlined />  {uiText("Data pengiriman mengikuti pengaturan maksimal usia antrean (1 hari = 24 jam). Kondisi perangkat menunjukkan keadaan saat ini.")}</div>
    <footer className={styles.footer}>Doran WA v{packageInfo.version} · © 2026</footer>
  </div>;
}
Dashboard.getLayout = (page: ReactElement) => <Layout title="Dasbor">{page}</Layout>;
export const getStaticProps = async ({ locale }: { locale: string }) => ({ props: { ...(await serverSideTranslations(locale, ["common", "upgrade", "interface"])) } });
