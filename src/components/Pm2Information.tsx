import { useUiTranslation, type UiTranslator } from "@/lib/uiTranslation";
import { Alert, Card, Col, Collapse, Descriptions, Row, Space, Statistic, Tag, Typography } from "antd";
const { Paragraph, Text } = Typography;
const atWib = (uiText: UiTranslator, v: string) => `${new Date(v).toLocaleString(uiText.locale, { timeZone: "Asia/Jakarta" })} WIB`;
export default function Pm2Information({ pm2, embedded = false }: { pm2?: any; embedded?: boolean }) {
  const uiText = useUiTranslation();
  const active = pm2?.available;
  const value = (v: any) => active && v !== null && v !== undefined ? String(v) : "—";
  const content = <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Paragraph style={{ marginBottom: 0 }}>{uiText("PM2 menjaga proses aplikasi tetap berjalan, menangani restart, dan menyimpan konfigurasi untuk pemasangan ulang. Informasi aktif di bawah dibaca dari proses aplikasi ini.")}</Paragraph>
      {!active && <Alert showIcon type="info" message={uiText("Status PM2 belum dapat dibaca")} description={uiText("Gunakan Perbarui informasi untuk mencoba kembali. Panduan penyimpanan tetap tersedia di bawah.")} />}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={8}><Card size="small"><Statistic title={uiText("RAM proses saat diperiksa")} value={active ? pm2.memoryMiB : "—"} suffix={active ? "MiB" : undefined} /></Card></Col>
        <Col xs={24} sm={8}><Card size="small"><Statistic title={uiText("CPU saat diperiksa")} value={active ? pm2.cpu : "—"} suffix={active ? "%" : undefined} precision={active ? 1 : undefined} /></Card></Col>
        <Col xs={24} sm={8}><Card size="small"><Statistic title={uiText("Restart tercatat")} value={active ? pm2.restarts : "—"} /></Card></Col>
      </Row>
      <Descriptions bordered size="small" column={{ xs: 1, sm: 2 }} items={[
        { key: "version", label: uiText("Versi PM2"), children: value(pm2?.version) },
        { key: "name", label: uiText("Nama proses"), children: value(pm2?.name) },
        { key: "pid", label: uiText("PM2 ID / PID"), children: active ? `${pm2.id} / ${pm2.pid}` : "—" },
        { key: "mode", label: uiText("Mode / instance"), children: active ? `${pm2.mode} / ${pm2.instances} instance` : "—" },
        { key: "started", label: uiText("Mulai terakhir"), children: active && pm2.startedAt ? atWib(uiText, pm2.startedAt) : "—" },
        { key: "unstable", label: uiText("Unstable restart"), children: value(pm2?.unstableRestarts) },
        { key: "memory", label: uiText("Ambang restart RAM total"), children: active ? `${value(pm2.memoryRestartMiB)} MiB` : "—" },
        { key: "heap", label: uiText("Batas heap JavaScript"), children: active ? `${value(pm2.heapMiB)} MiB` : "—" },
        { key: "backoff", label: uiText("Backoff restart awal"), children: active ? `${value(pm2.backoffMs)} ms` : "—" },
        { key: "timeout", label: uiText("Timeout shutdown PM2"), children: active ? `${value(pm2.killTimeoutMs)} ms` : "—" },
        { key: "auto", label: uiText("Auto-restart"), children: active ? pm2.autoRestart ? uiText("Aktif") : uiText("Nonaktif") : "—" },
        { key: "watch", label: uiText("Watch perubahan file"), children: active ? pm2.watch ? uiText("Aktif") : uiText("Nonaktif") : "—" },
        { key: "timestamp", label: uiText("Format timestamp log"), children: value(pm2?.logDateFormat) },
        { key: "saved", label: uiText("Konfigurasi tersimpan"), children: active && pm2.savedMatches !== null ? <Tag color={pm2.savedMatches ? "green" : "gold"}>{pm2.savedMatches ? uiText("Setting utama sesuai proses aktif") : uiText("Setting utama perlu disinkronkan")}</Tag> : uiText("Belum dapat diverifikasi") },
      ]} />
      <Text type="secondary">{active && pm2.checkedAt ? uiText("Snapshot {{v0}}. ", { v0: atWib(uiText, pm2.checkedAt) }) : ""}{uiText("Gunakan Perbarui informasi untuk membaca snapshot terbaru; cache PM2 maksimal 10 detik. RAM/CPU berubah mengikuti beban. Counter restart juga mencakup deployment.")}</Text>
      <Alert showIcon type="info" message={uiText("6 GiB adalah ambang restart, bukan RAM yang langsung dialokasikan")} description={uiText("Heap JavaScript dibatasi 4 GiB. RAM total juga mencakup buffer dan memori native. Aplikasi tetap satu instance fork; jumlah CPU VPS tidak otomatis menjadi jumlah instance.")} />
      <Collapse items={[
        { key: "shutdown", label: uiText("Shutdown, log & startup"), children: <Space direction="vertical"><Paragraph>{uiText("Shutdown SIGINT/SIGTERM diproses sekali. Pekerjaan baru dan reconnect dihentikan, worker ditunggu, penyimpanan sesi diselesaikan, lalu koneksi dan database ditutup. Batas internal 60 detik berada di bawah timeout PM2 65 detik.")}</Paragraph><Paragraph>{uiText("Rotasi log yang diverifikasi 12 Oktober 2026: batas 100 MB, 7 arsip, kompresi aktif, rotasi harian pukul 00.00. Startup VPS menggunakan cron @reboot; konfigurasi proses disimpan dengan pm2 save. Informasi rotasi/startup ini adalah catatan pemeriksaan, bukan pemeriksaan realtime.")}</Paragraph><Paragraph>{uiText("Restart satu instance menimbulkan jeda singkat. Hasil uji 12 Oktober 2026: shutdown bersih 363 ms, layanan HTTP dan WebSocket kembali tersedia. Durasi aktual mengikuti pekerjaan yang sedang berjalan.")}</Paragraph></Space> },
        { key: "restore", label: uiText("Setting tersimpan & pemasangan ulang"), children: <Space direction="vertical" style={{ width: "100%" }}><Descriptions column={1} items={[
          { key: "config", label: uiText("Konfigurasi utama"), children: <Text code>{"ecosystem.config.js"}</Text> },
          { key: "guide", label: uiText("Panduan restore"), children: <Text code>deployment/PM2-RESTORE.md</Text> },
          { key: "archive", label: uiText("Arsip setting"), children: <Text code>deployment/pm2-settings-20261012.zip</Text> },
          { key: "backup", label: uiText("Backup setting VPS"), children: <Text code>/home/jeblast/backups/pm2-settings-20261012</Text> },
        ]} /><Paragraph>{uiText("Pada deploy ulang, gunakan source proyek lengkap yang sesuai, pulihkan konfigurasi privat dan data secara terpisah, instal dependency, lalu compile. Sesuaikan path interpreter Node jika server berubah.")}</Paragraph><Paragraph><Text code>{"pm2 startOrReload ecosystem.config.js --only doran-whatsapp --update-env"}</Text></Paragraph><Paragraph><Text code>{"pm2 save"}</Text> → <Text code>{"pm2 describe doran-whatsapp"}</Text></Paragraph><Paragraph>{uiText("Arsip setting berisi konfigurasi dan kode terkait shutdown; bukan installer lengkap dan tidak memuat kredensial atau data perangkat. Setelah perubahan berikutnya, sinkronkan file konfigurasi dan setting PM2 tersimpan.")}</Paragraph></Space> },
      ]} />
    </Space>;
  return embedded ? content : <Card title={uiText("Pengelolaan Proses PM2")} extra={<Tag color={active && pm2.status === "online" ? "green" : "default"}>{active ? pm2.status : uiText("Belum tersedia")}</Tag>}>{content}</Card>;
}
