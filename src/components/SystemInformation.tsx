import { useUiTranslation } from "@/lib/uiTranslation";
import { Alert, Button, Card, Col, Collapse, Descriptions, Row, Space, Steps, Table, Tag, Typography } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import { useDashboardApi } from "@/lib/useDashboardApi";
import Pm2Information from "@/components/Pm2Information";

const { Title, Paragraph, Text } = Typography;
export default function SystemInformation() {
  const uiText = useUiTranslation();
  const info = useDashboardApi("/api/admin/system-info");
  const data = info.data;
  const version = (name: string) => data?.versions?.[name] || "—";
  const stack = [
    [uiText("Framework web"), "Next.js", version("next"), uiText("Framework dashboard")],
    ["Antarmuka", "React", version("react"), uiText("Komponen antarmuka")],
    ["Komponen & ikon", uiText("Ant Design"), version("antd"), uiText("Form, tabel, menu, modal, dan ikon")],
    [uiText("HTTP client"), "Axios", version("axios"), uiText("Komunikasi dengan layanan aplikasi")],
    ["Runtime", "Node.js", data?.node || "—", uiText("Menjalankan aplikasi di server")],
    [uiText("Framework server"), "Express + Next.js", version("express"), uiText("Express custom server dan Next.js API Routes")],
    ["Database", "MySQL", data?.database?.version || uiText("Belum terverifikasi"), data?.database?.comment || uiText("Versi diperiksa melalui koneksi database aplikasi")],
    ["ORM", "Prisma", version("@prisma/client"), uiText("Akses database dan pengelolaan schema")],
    ["Realtime", "Socket.IO", version("socket.io"), uiText("Pembaruan data secara realtime")],
    ["Multibahasa", "next-i18next", version("next-i18next"), uiText("Didukung i18next dan react-i18next")],
    ["Tanggal & waktu", "Day.js", version("dayjs"), uiText("Pengolahan tanggal dan waktu")],
    [uiText("Bahasa pengembangan"), "TypeScript", version("typescript"), uiText("Bahasa kode aplikasi")],
  ].map(([category, name, currentVersion, purpose]) => ({ category, name, currentVersion, purpose }));
  return <Space direction="vertical" size="large" style={{ width: "100%" }}>
    <Card style={{ borderTop: "3px solid #0875bd" }}><Space direction="vertical" style={{ width: "100%" }}>
      <Space wrap style={{ width: "100%", justifyContent: "space-between" }}><div><Title level={3} style={{ margin: 0 }}>{uiText("Informasi Sistem")}</Title><Text type="secondary">{uiText("Teknologi, operasional server, dan panduan pengelolaan release.")}</Text></div><Button icon={<ReloadOutlined />} onClick={info.reload} loading={!data && !info.error}>{uiText("Perbarui informasi")}</Button></Space>
      <Space wrap><Tag color="blue">{uiText("Khusus super admin")}</Tag><Text type="secondary">{data ? uiText("Diperiksa {{v0}} WIB", { v0: new Date(data.checkedAt).toLocaleString(uiText.locale, { timeZone: "Asia/Jakarta" }) }) : uiText("Memuat informasi server…")}</Text></Space>
    </Space></Card>
    {info.error && <Alert type="error" showIcon message={uiText(info.error)} />}
    <Row gutter={[16, 16]}>
      <Col xs={24} md={8} style={{ display: "flex" }}><Card title={uiText("Runtime")} style={{ width: "100%" }} styles={{ body: { padding: "16px 24px" } }}><Title level={3} style={{ margin: "0 0 12px", minHeight: 32 }}>{data?.node || "—"}</Title><Text>{uiText("Node.js · proses aplikasi dikelola PM2")}</Text></Card></Col>
      <Col xs={24} md={8} style={{ display: "flex" }}><Card title={uiText("Database")} style={{ width: "100%" }} styles={{ body: { padding: "16px 24px" } }}><Title level={3} style={{ margin: "0 0 12px", minHeight: 32 }}>{uiText("MySQL")} {data?.database?.version || "—"}</Title><Text>{uiText("ORM Prisma")} {version("@prisma/client")}</Text></Card></Col>
      <Col xs={24} md={8} style={{ display: "flex" }}><Card title={uiText("Antrean pengiriman")} style={{ width: "100%" }} styles={{ body: { padding: "16px 24px" } }}><div style={{ minHeight: 32, marginBottom: 12, display: "flex", alignItems: "center" }}><Tag color={!data ? "default" : data.dispatchEnabled ? "green" : "default"}>{!data ? uiText("Memuat") : data.dispatchEnabled ? uiText("Aktif") : uiText("Nonaktif")}</Tag></div><Paragraph style={{ margin: 0 }}>{uiText("Antrean tersimpan di MySQL, diproses worker internal.")}</Paragraph></Card></Col>
    </Row>
    <Collapse accordion items={[
      { key: "pm2", label: uiText("Pengelolaan Proses PM2"), extra: <Tag color={data?.pm2?.available && data.pm2.status === "online" ? "green" : "default"}>{data?.pm2?.available ? data.pm2.status : uiText("Belum tersedia")}</Tag>, children: <Pm2Information pm2={data?.pm2} embedded /> },
    { key: "stack", label: uiText("Stack teknologi"), children: <><Table pagination={false} size="middle" rowKey="category" dataSource={stack} scroll={{ x: 720 }} columns={[{ title: uiText("Bagian"), dataIndex: "category" }, { title: uiText("Teknologi"), dataIndex: "name" }, { title: uiText("Versi terpasang"), dataIndex: "currentVersion", render: value => <Tag>{value}</Tag> }, { title: uiText("Fungsi"), dataIndex: "purpose" }]} /><Paragraph type="secondary" style={{ marginTop: 16, marginBottom: 0 }}>{uiText("Versi diambil dari server saat informasi diperbarui. Styling menggunakan CSS Modules dan styling Ant Design; navigasi menggunakan NProgress, build menggunakan Webpack. Cloudflare berada di depan server; Apache meneruskan trafik ke aplikasi. Informasi infrastruktur ini berdasarkan pemeriksaan server pada 12 Oktober 2026.")}</Paragraph></> },
      { key: "queue", label: uiText("Queue & cache"), children: <><Descriptions column={{ xs: 1, sm: 2 }} items={[
      { key: "dispatch", label: uiText("Queue utama"), children: uiText("MySQL · WaDispatch dan WaSenderLease") },
      { key: "worker", label: uiText("Worker"), children: uiText("Worker internal Node.js") },
      { key: "concurrency", label: uiText("Concurrency"), children: data ? `${data.concurrency} perangkat` : "—" },
      { key: "interval", label: uiText("Interval dasar"), children: data ? `${data.intervalMs.toLocaleString(uiText.locale)} ms` : "—" },
      { key: "bull", label: uiText("Bull {{v0}}", { v0: version("bull") }), children: <Tag color={data?.redisQueueEnabled ? "gold" : "default"}>{!data ? uiText("Memuat") : data.redisQueueEnabled ? uiText("Dikonfigurasi aktif") : uiText("Queue Redis dinonaktifkan")}</Tag> },
      { key: "bullmq", label: uiText("BullMQ {{v0}}", { v0: version("bullmq") }), children: uiText("Paket terpasang; bukan worker dispatch utama") },
    ]} /><Paragraph style={{ marginTop: 16 }}>{uiText("Job menyimpan status, jumlah percobaan, jadwal berikutnya, dan penguncian per perangkat. Antrean utama dapat berjalan tanpa queue Redis.")}</Paragraph><Alert type="info" showIcon message={uiText("Status konfigurasi bukan pemeriksaan koneksi Redis")} description={uiText("Pada pemeriksaan 12 Oktober 2026 tidak ada listener Redis lokal di port 6379. Belum ada cache terpusat lain yang terverifikasi. Status di atas menunjukkan flag queue aplikasi saat ini.")} /></> },
      { key: "git", label: uiText("Git & CI/CD"), children: <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Paragraph>{uiText("Aplikasi dapat disimpan di repository privat GitHub atau GitLab, dengan CI/CD untuk pemeriksaan kode, compile, dan deployment ke VPS. Aplikasi produksi tetap dijalankan oleh PM2.")}</Paragraph>
      <Alert type="info" showIcon message={uiText("Panduan rencana, bukan pipeline yang sudah aktif")} description={uiText("Saat pemeriksaan workspace 12 Oktober 2026, Git belum memiliki remote dan workflow CI/CD belum tersedia. Penambahan halaman ini tidak mengaktifkan deployment otomatis.")} />
      <Steps direction="vertical" items={[
        { title: uiText("Push atau Pull Request"), description: uiText("Perubahan kode masuk repository; CI memeriksa dependency, kode, dan hasil build.") },
        { title: uiText("Merge ke branch produksi"), description: uiText("GitHub Actions atau GitLab CI memicu deployment satu release pada satu waktu.") },
        { title: uiText("Siapkan release terpisah di VPS"), description: uiText("Ambil commit tertentu, instal dependency terkunci, siapkan Prisma, dan hubungkan konfigurasi server.") },
        { title: uiText("Compile dan migrasi bila diperlukan"), description: uiText("Build dengan worker dimatikan untuk proses build. Migrasi database memerlukan backup dan kompatibilitas dengan release sebelumnya.") },
        { title: uiText("Aktifkan release dan periksa layanan"), description: uiText("Restart proses aplikasi, lalu periksa halaman, layanan, dan realtime. Kembalikan release sebelumnya jika pemeriksaan gagal.") },
      ]} />
      <Collapse items={[
        { key: "compile", label: uiText("Proses compile & deployment"), children: <Space direction="vertical" style={{ width: "100%" }}><Paragraph>{uiText("CI berjalan di runner; build release disarankan di VPS agar dependency native sesuai dengan sistem server. Compile dijalankan pada folder release terpisah.")}</Paragraph><Paragraph><Text code>{"npm ci"}</Text> → <Text code>{"npx prisma generate"}</Text> → <Text code>{"npm run build"}</Text></Paragraph><Paragraph>{uiText("Perintah build mencakup compile Next.js dan TypeScript server. Saat build, gunakan WHATSAPP_ENABLED=false, QUEUE_ENABLED=false, dan DISPATCH_QUEUE_ENABLED=false hanya untuk proses build. Flag produksi dipertahankan saat aplikasi dijalankan.")}</Paragraph><Paragraph>{uiText("Jika ada migration baru:")} <Text code>{"npx prisma migrate deploy"}</Text>{uiText(". Setelah pemeriksaan, PM2 mengaktifkan release baru.")}</Paragraph><Alert showIcon type="warning" message={uiText("Restart dan rollback")} description={uiText("Satu instance PM2 memiliki jeda singkat saat restart; perangkat akan tersambung ulang. Rollback kode tidak otomatis membatalkan migrasi database.")} /></Space> },
        { key: "files", label: uiText("Isi repository & data server"), children: <Descriptions column={1} items={[{ key: "git", label: uiText("Masuk repository"), children: uiText("Source, aset aplikasi, schema dan migration Prisma, package.json, lockfile, konfigurasi build, skrip deploy, dan workflow CI/CD.") }, { key: "server", label: uiText("Tetap di server"), children: uiText("Konfigurasi rahasia, database, sesi perangkat, upload pengguna, dan log. Dependency serta hasil compile dibuat saat build.") }, { key: "secrets", label: uiText("Secrets CI/CD"), children: uiText("Kredensial deployment disimpan sebagai secrets; private key dan token tidak masuk repository. Folder sementara dan arsip harus diperiksa sebelum commit awal.") }]} /> },
      ]} />
    </Space> },
    ]} />
  </Space>;
}
