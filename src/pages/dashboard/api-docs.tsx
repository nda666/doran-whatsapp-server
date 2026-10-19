import { useUiTranslation, type UiTranslator } from "@/lib/uiTranslation";
import { ReactElement } from "react";
import { Alert, Button, Collapse, Space, Table, Tag, Typography } from "antd";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import Layout from "@/components/Layout";
import WhatsAppCompatibilityNotice from "@/components/WhatsAppCompatibilityNotice";
import ApiIntegrationExamples from "@/components/ApiIntegrationExamples";
import ApiCodeBlock from "@/components/ApiCodeBlock";
import ApiGuideNotes from "@/components/ApiGuideNotes";
import ApiEndpointNotes from "@/components/ApiEndpointNotes";
import styles from "@/styles/ApiDocs.module.css";
import catalogue from "@/data/apiDocumentation.json";
import { ApiEndpoint, integrationSample } from "@/lib/apiIntegrationSamples";

const statuses = (uiText: UiTranslator) => ([
  ["QUEUED", uiText("Tersimpan, menunggu device/worker.")], ["PROCESSING", uiText("Sedang diproses.")],
  ["SENT", uiText("ACK server WhatsApp diterima; belum membuktikan diterima HP.")],
  ["DELIVERED", uiText("Receipt pengiriman ke tujuan tersedia.")], ["READ", uiText("Receipt dibaca tersedia; tidak selalu diberikan penerima.")],
  ["FAILED", uiText("Gagal; retry job_id yang sama hanya mengembalikan status.")],
  ["UNCERTAIN", uiText("Hasil transport belum pasti. Periksa penerima sebelum mengirim ulang; tidak diulang otomatis.")],
].map(([status, description]) => ({ status, description })));
function aliases(endpoint: ApiEndpoint) {
  if (endpoint.auth !== "device" && endpoint.auth !== "body-device" && !dualTokenOperations.has(endpoint.key) && !directoryOperations.has(endpoint.key)) return [];
  return [endpoint.path.startsWith("/api/public/") ? endpoint.path.replace("/api/public/", "/api/") : endpoint.path.replace("/api/", "/api/public/")];
}
const dualTokenOperations = new Set(catalogue.endpoints.filter(endpoint => /^\/api\/(?:public\/)?(?:v2\/)?send-(message|media|sticker|poll|button|list|location|vcard|group-message|attachment|status)$/.test(endpoint.path)).map(endpoint => endpoint.key));
const directoryOperations = new Set(catalogue.endpoints.filter(endpoint => /\/(list-phones|phone-detail)$/.test(endpoint.path)).map(endpoint => endpoint.key));
function userTokenExample(endpoint: ApiEndpoint) {
  return integrationSample({ ...endpoint, auth: "user", body: { ...endpoint.body, api_key: undefined, ...(directoryOperations.has(endpoint.key) ? {} : { device_id: "{{device_id}}" }) } } as ApiEndpoint, "curl");
}
export default function ApiDocs() {
  const uiText = useUiTranslation();
  const groups = Array.from(new Set(catalogue.endpoints.map(endpoint => endpoint.group)));
  const operation = (endpoint: ApiEndpoint) => ({
    key: endpoint.key, label: <span className={styles.endpointLabel}>
      <span className={styles.methods}>{endpoint.methods.map(method => <Tag key={method} color={method === "GET" ? "blue" : method === "DELETE" ? "red" : method === "POST" ? "green" : "orange"}>{method}</Tag>)}</span>
      <span className={styles.endpointName}><code>{endpoint.path}</code><small>{uiText(endpoint.title)}</small></span>
    </span>,
    children: <div className={styles.stack}>
      <ApiEndpointNotes notes={endpoint.notes} aliases={aliases(endpoint)} />
      <div className={styles.meta}><span>{uiText("Autentikasi:")} {dualTokenOperations.has(endpoint.key) ? uiText("Token device atau token user + device_id") : directoryOperations.has(endpoint.key) ? uiText("Token device atau token user (device_id tidak diperlukan)") : endpoint.auth === "none" ? uiText("Email/password akun") : endpoint.auth === "user" ? uiText("Token pengguna (Bearer)") : uiText("Token device (Bearer atau api_key)")}</span><span>{uiText("Respons sukses utama:")} <strong>{"HTTP"} {endpoint.status}</strong></span></div>
      {directoryOperations.has(endpoint.key) && <Alert type="info" showIcon message={uiText("Token user tidak memerlukan device_id untuk daftar/detail nomor.")} description={uiText("Setiap item daftar/detail menyertakan data[].device_id; field id tetap tersedia dengan nilai yang sama. User biasa hanya melihat device sendiri; admin utama dapat melihat seluruh device. phone-detail tetap memerlukan number sebagai nomor yang dicari.")} />}
      {dualTokenOperations.has(endpoint.key) && <Table pagination={false} size="small" rowKey="name" scroll={{ x: 620 }}
        aria-label={uiText("Parameter device_id")} dataSource={[{
          name: "device_id", type: "string (UUID)", required: uiText("Wajib untuk token user; opsional untuk token device"),
          description: uiText("ID perangkat WhatsApp pengirim, bukan nomor penerima atau token API. Harus milik user pemegang token. Dengan token device, jika diisi harus cocok dengan device pemilik token. Lihat Perangkat Hp → Aksi → Lihat Device ID."),
        }]} columns={[
          { title: uiText("Parameter"), dataIndex: "name", render: value => <code>{value}</code> },
          { title: uiText("Tipe"), dataIndex: "type" }, { title: uiText("Wajib"), dataIndex: "required" }, { title: uiText("Keterangan"), dataIndex: "description" },
        ]} />}
      <div className={styles.columns}>
        <div className={styles.stack}>
          <ApiCodeBlock title={uiText("Request cURL")} value={integrationSample(endpoint, "curl")} copyLabel={uiText("Copy cURL")} />
          {Object.keys(endpoint.body).length > 0 && <ApiCodeBlock title={endpoint.encoding === "multipart" ? uiText("Field form-data") : endpoint.methods[0] === "GET" ? uiText("Parameter query") : uiText("Body JSON / parameter")} value={JSON.stringify(endpoint.body, null, 2)} />}
          {(dualTokenOperations.has(endpoint.key) || directoryOperations.has(endpoint.key)) && endpoint.auth !== "user" && <ApiCodeBlock title={directoryOperations.has(endpoint.key) ? uiText("Alternatif: token user (tanpa device_id)") : uiText("Alternatif: token user + device_id")} value={userTokenExample(endpoint)} copyLabel={uiText("Copy cURL token user")} />}
        </div>
        <div className={styles.stack}>
          <ApiCodeBlock title={uiText("Response sukses (ilustrasi)")} value={typeof endpoint.response === "string" ? endpoint.response : JSON.stringify(endpoint.response, null, 2)} />
          {(endpoint.variants.length > 0 || endpoint.errors.length > 0) && <Collapse items={[
            ...endpoint.variants.map((variant, index) => ({ key: `variant-${index}`, label: uiText("Variasi sukses / retry — HTTP {{v0}}", { v0: variant.status }), children: <ApiCodeBlock title={uiText("Response HTTP {{v0}}", { v0: variant.status })} value={JSON.stringify(variant.body, null, 2)} /> })),
            ...endpoint.errors.map((error, index) => ({ key: `error-${index}`, label: uiText("Error — HTTP {{v0}}", { v0: error.status }), children: <ApiCodeBlock title={uiText("Response HTTP {{v0}}", { v0: error.status })} value={error.body === null ? "Body kosong" : JSON.stringify(error.body, null, 2)} /> })),
          ]} />}
        </div>
      </div>
    </div>,
  });
  return <div className={styles.page}>
    <Typography.Paragraph>{uiText("Dokumentasi diperbarui 13 Oktober 2026 ·")} {catalogue.endpoints.length}  {uiText("operasi ·")} {catalogue.postmanRequests}  {uiText("request Postman. Base URL:")} <code>{catalogue.baseUrl}</code>{uiText(". Contoh respons menggunakan data ilustratif.")}</Typography.Paragraph>
    <Alert type="info" showIcon message={uiText("REST API: token device dan token user")} description={uiText("Seluruh API pengiriman dan send-status menerima token device tanpa wajib device_id, atau Bearer token user dengan device_id miliknya. list-phones/phone-detail menerima token user tanpa device_id. Jangan mencampur kredensial berbeda. Endpoint sesi/QR/check-number/disconnect tetap memakai token device. URL dengan dan tanpa /public memakai handler serta respons yang sama. send-message (termasuk v2), grup dan lampiran mengembalikan HTTP 200; API pengiriman antrean lain mengembalikan 202. queued=true berarti tersimpan, belum terkirim.")} />
    <Alert type="warning" message={uiText("Pesan dengan tombol atau daftar pilihan mungkin tidak tampil di semua versi WhatsApp penerima. Agar Token API lebih aman saat aplikasi digunakan, kirim permintaan dengan metode POST dan data JSON, lalu masukkan token pada header Authorization: Bearer TOKEN_DEVICE. Hindari menaruh api_key di URL karena token bisa tersimpan dalam catatan akses server (log).")} />
    <WhatsAppCompatibilityNotice />
    <Collapse items={[{ key: "downloads", label: uiText("Unduh Postman & panduan cURL PDF"), children:
      <div className={styles.stack}>
      <Space wrap>
        <Button href="/downloads/jeblast-api.postman_collection.json" download>{uiText("Download koleksi Postman")}</Button>
        <Button href="/downloads/jeblast-api.postman_environment.json" download>{uiText("Download environment Postman")}</Button>
        <Button href="/downloads/jeblast-api-curl-guide.pdf" target="_blank" rel="noopener noreferrer">{uiText("Download PDF cURL")}</Button>
      </Space>
<ApiGuideNotes label={uiText("Panduan Postman dan PDF")} sections={[{ title: uiText("Import & token"), items: [<>{uiText("Import kedua JSON, pilih environment Jeblast Production, lalu isi")} <code>device_token</code>  {uiText("dari kolom Token API pada Device.")}</>,
<>{uiText("Untuk")} <code>user_token</code>{uiText(", isi")} <code>account_email</code>/<code>account_password</code>  {uiText("lalu jalankan Login.")}</>,
<>{uiText("Token pengguna dipakai API media dan device dashboard.")}</>] },
{ title: uiText("ID pengiriman"), items: [<>{uiText("Isi")} <code>job_id</code>  {uiText("dengan ID request stabil dari aplikasi Anda;")} <code>dispatch_id</code>  {uiText("diisi otomatis dari")} <code>data[0].id</code>  {uiText("setelah kirim.")}</>,
<>{uiText("Gunakan job_id baru untuk pengiriman baru.")}</>] },
{ title: uiText("Aktifkan request tulis"), items: [<>{uiText("Request kirim/upload/ubah/hapus/disconnect/QR memiliki")} <code>allow_write_requests=false</code>{uiText("; ubah menjadi")} <code>true</code>  {uiText("ketika ingin menjalankannya.")}</>] },
{ title: uiText("Isi paket"), items: [<>{uiText("Koleksi memuat")} {catalogue.postmanRequests}  {uiText("request, termasuk token user + device_id untuk kirim pesan/cek status. PDF tetap memuat contoh integrasi token device.")}</>] },
{ title: uiText("Menjalankan cURL"), items: [<>{uiText("PDF memakai cURL Bash/sh; Windows dapat memakai Git Bash/WSL.")}</>] },
{ title: uiText("Cakupan integrasi"), items: [<>{uiText(catalogue.scope)}</>] }]} />
      </div>
    }]} />
    <Collapse items={[
      { key: "request-contract", label: uiText("Autentikasi, format request & error"), children: <Space direction="vertical" style={{ width: "100%" }}>

        <ApiGuideNotes label={uiText("Panduan autentikasi dan format request")} sections={[{ title: uiText("Token & autentikasi"), items: [<>{uiText("Device token tetap didukung:")} <code>Authorization: Bearer TOKEN_DEVICE</code>  {uiText("atau")} <code>api_key</code>  {uiText("pada body/form atau query, tanpa wajib device_id.")}</>,
<>{uiText("Seluruh API pengiriman dan send-status: token pengguna melalui")} <code>Authorization: Bearer TOKEN_USER</code>  {uiText("dengan")} <code>device_id</code>  {uiText("milik user. Alias yang sudah ada tetap didukung.")}</>,
<>{uiText("list-phones/phone-detail: token pengguna bisa langsung dipakai tanpa device_id, untuk menemukan ID perangkat.")}</>,
<>{uiText("Pada endpoint tersebut, kredensial berbeda dalam satu request ditolak; token device dengan device_id yang tidak cocok juga ditolak.")}</>,
<>{uiText("Login menghasilkan token pengguna; token device berasal dari menu Device.")}</>,
<>{uiText("Endpoint lain tetap mengikuti jenis token yang tercantum pada dokumentasi masing-masing.")}</>] },
{ title: uiText("Format request"), items: [<>{uiText("Gunakan POST JSON untuk pengiriman.")}</>,
<>{uiText("GET dan form-urlencoded memakai parameter yang sama; objek")} <code>payload</code>  {uiText("harus di-JSON-stringify pada query/form.")}</>,
<>{uiText("Upload media/lampiran memakai multipart/form-data; biarkan klien membuat boundary.")}</>,
<>{uiText("Metode tiap endpoint tercantum di bawah; legacy group/attachment hanya POST.")}</>] }]} /><Alert type="warning" showIcon message={uiText("dry_run hanya POST JSON boolean true")} description={<ul style={{ margin: 0, paddingInlineStart: 18, lineHeight: 1.75 }}><li>{uiText("Gunakan")} <code>{'{"dry_run":true}'}</code>  {uiText("pada send-message.")}</li><li>{uiText("String")} <code>&quot;true&quot;</code>  {uiText("pada GET/form tidak mengaktifkan dry run dan dapat menjalankan pengiriman.")}</li><li>{uiText("Dry run tidak membuat job atau mengirim pesan;")} <code>job_id</code>  {uiText("tetap memerlukan antrean aktif.")}</li></ul>} />

      <ApiGuideNotes label={uiText("Panduan error API")} sections={[{ title: uiText("Respons error"), items: [<>{uiText("Error API device:")} <code>{'{"result":false,"message":"...","curl_error":null}'}</code>.</>,
<><code>curl_error</code>  {uiText("selalu null di server; kegagalan DNS/koneksi/TLS/timeout cURL dibaca melalui")} <code>curl_error($ch)</code>  {uiText("dan")} <code>curl_errno($ch)</code>  {uiText("di klien PHP.")}</>,
<>{uiText("Periksa status HTTP dan")} <code>result</code>{uiText(": send-message serta API legacy dapat gagal dengan HTTP 200.")}</>] }]} /></Space> },
      { key: "job-id", label: uiText("Cegah request ganda dengan job_id & transaction_id"), children: <Space direction="vertical" style={{ width: "100%" }}>

      <ApiGuideNotes label={uiText("Panduan job-id")} sections={[{ title: uiText("Format job_id"), items: [<><code>job_id</code>  {uiText("opsional berupa string stabil 1–128 karakter tanpa karakter kontrol, peka huruf besar/kecil, dengan spasi awal/akhir dihapus.")}</>,
<>{uiText("Satu ID berlaku untuk satu device, termasuk lintas endpoint pengiriman antrean.")}</>,
<>{uiText("Kirim ID yang sama sejak request pertama dan saat retry.")}</>] },
{ title: uiText("Retry & job lama"), items: [<>{uiText("Job baru:")} <code>existing=false</code>.</>,
<>{uiText("Job sudah ada:")} <code>existing=true</code>  {uiText("dan status terakhir seluruh penerima asli; nomor/payload yang berubah tidak mengganti job lama dan tidak membuat pengiriman baru.")}</>,
<>{uiText("ID baru diperlukan untuk pesan baru.")}</>,
<>{uiText("Konfirmasi WhatsApp yang belum valid ditunggu hingga 40 detik, kemudian diulang otomatis dengan jeda 1, 2, 4, lalu 8 menit; maksimal 5 percobaan, lalu FAILED. Selama menunggu ulang status QUEUED dengan error ACK_TIMEOUT_RETRY; next_attempt_at berisi jadwal berikutnya. Konfirmasi terlambat membatalkan pengulangan. Penolakan WhatsApp kode 463 langsung FAILED tanpa pengulangan. Ada risiko pesan ganda. FAILED/UNCERTAIN tidak diulang otomatis.")}</>,
<>{uiText("Antrean harus aktif.")}</>,
<>{uiText("Legacy send-attachment/send-group-message tidak mendukung mekanisme ini.")}</>] },
{ title: uiText("Lookup status"), items: [<><code>job_id</code>  {uiText("adalah ID request klien;")} <code>data[].id</code>  {uiText("adalah UUID internal satu penerima.")}</>,
<>{uiText("Status menerima")} <code>job_id</code>, <code>id</code>{uiText(", atau")} <code>transaction_id</code>{uiText(", dengan prioritas tersebut.")}</>,
<>{uiText("Gunakan token device pengirim yang sama, termasuk untuk admin.")}</>,
<>{uiText("Maksimal 100 per halaman; lanjutkan")} <code>page</code>  {uiText("sampai seluruh")} <code>total</code>  {uiText("terbaca.")}</>] },
{ title: uiText("Dedupe tanpa job_id"), items: [<>{uiText("Tanpa job_id, dedupe memakai device + store_id + transaction_id + message_key + penerima.")}</>,
<>{uiText("Isi berbeda pada kunci yang sama ditolak 409.")}</>,
<><code>transaction_id</code>  {uiText("maksimal 128 karakter (default UUID otomatis),")} <code>store_id</code>/<code>message_key</code>  {uiText("maksimal 64 (default")} <code>default</code>).</>,
<>{uiText("Retry tanpa ID stabil dapat membuat pesan ganda.")}</>,
<>{uiText("Dedupe berlaku selama catatan tersimpan; riwayat terkirim/gagal dihapus setelah 180 hari.")}</>] }]} /></Space> },
      { key: "delivery-status", label: uiText("Status pengiriman, batas request & retry"), children: <Space direction="vertical" style={{ width: "100%" }}>
        <Table size="small" rowKey="status" pagination={false} dataSource={statuses(uiText)} columns={[{ title: uiText("Status"), dataIndex: "status", width: 140 }, { title: uiText("Arti"), dataIndex: "description" }]} />

      <ApiGuideNotes label={uiText("Panduan delivery-status")} sections={[{ title: uiText("Parameter & batas"), items: [<>{uiText("Maksimal 100 penerima per request, dipisahkan koma; nomor dinormalisasi dan duplikat digabung.")}</>,
<>{uiText("Pesan maksimal 10.000 karakter; image URL/base64 maksimal 700 KB.")}</>,
<>{uiText("Media File Manager memakai media_id milik akun device; sticker wajib WebP.")}</>,
<>{uiText("Device offline menunggu tanpa memakai percobaan. Usia maksimal data yang boleh diproses mengikuti Maksimal usia data antrean (hari) pada Pengaturan Global, default 1 hari sejak masuk antrean. Data yang melewati batas ditandai FAILED; perubahan batas berlaku juga untuk antrean yang masih menunggu.")}</>] },
{ title: uiText("Retry & pemeriksaan status"), items: [<>{uiText("Jika HTTP 503 atau koneksi terputus, retry dengan ID stabil yang sama dan jeda meningkat (2, 4, 8, 16 detik).")}</>,
<>{uiText("Perbaiki 400/409 sebelum mencoba lagi.")}</>,
<>{uiText("Periksa UNCERTAIN pada penerima sebelum membuat job baru.")}</>,
<>{uiText("queued=true juga muncul pada retry job yang sudah selesai; baca status tiap penerima.")}</>] }]} /></Space> },
      { key: "registered-phones", label: uiText("Daftar nomor WhatsApp terdaftar & detail nomor"), children: <Space direction="vertical" style={{ width: "100%" }}>

        <ApiGuideNotes label={uiText("Panduan registered-phones")} sections={[{ title: uiText("Hak akses & daftar device"), items: [<>{uiText("Bearer token user atau token salah satu device milik admin utama (admin@gmail.com, ADMIN, APPROVED) mendapat")} <code>access.scope=all</code>{uiText("; akun lain hanya device sendiri (")}<code>own</code>{uiText("). Token user tidak memerlukan device_id untuk daftar/detail nomor.")}</>,
<>{uiText("Parameter role/admin dari klien tidak mengubah hak akses.")}</>,
<>{uiText("Device nonaktif/offline dan yang belum tertaut tetap disertakan.")}</>,
<>{uiText("List tanpa pagination; phone-detail menerima satu nomor dan dapat mengembalikan beberapa device untuk nomor yang sama.")}</>] },
{ title: uiText("Field & token API"), items: [<>{uiText("Token API pada list-phones/phone-detail hanya disertakan untuk admin utama, bersama")} <code>userId</code>  {uiText("dan")} <code>user</code>.</>,
<>{uiText("QR tidak disertakan.")}</>,
<><code>name</code>  {uiText("adalah label perangkat;")} <code>account_name</code>  {uiText("nama akun WA.")}</>,
<>{uiText("Status berasal dari catatan terakhir server.")}</>,
<>{uiText("Nomor +62 pada query harus di-URL-encode.")}</>] }]} /><Collapse items={catalogue.endpoints.filter(endpoint => ["list-phones", "phone-detail"].includes(endpoint.key)).map(operation)} />
      </Space> },
    ]} />
    <ApiIntegrationExamples />
    <Collapse items={groups.map(group => ({ key: group, label: uiText(group), children: <Collapse items={catalogue.endpoints.filter(endpoint => endpoint.group === group && !["list-phones", "phone-detail"].includes(endpoint.key)).map(operation)} /> }))} />
    <Collapse items={[{ key: "dispatch-webhook", label: uiText("Webhook status antrean pengiriman"), children:
      <ApiGuideNotes label={uiText("Keterangan webhook status pengiriman")} sections={[
        { title: uiText("Konfigurasi"), items: [<>{uiText("Isi satu URL dan kunci autentikasi melalui")} <strong>{uiText("Admin Panel → Webhook Status Pengiriman")}</strong>{uiText(", lalu aktifkan.")}</>] },
        { title: uiText("Event & pemicu"), items: [
          <>{uiText("Event:")} <code>dispatch.status_changed</code>.</>,
          <>{uiText("Dikirim saat job masuk")} <code>QUEUED</code>  {uiText("dan setiap perubahan ke")} <code>PROCESSING</code>, <code>SENT</code>, <code>DELIVERED</code>, <code>READ</code>, <code>FAILED</code>{uiText(", atau")} <code>UNCERTAIN</code>.</>,
          <>{uiText("Berlaku untuk perubahan setelah aktivasi. Status yang sama dan receipt duplikat tidak memicu event.")}</>,
        ] },
        { title: uiText("Payload"), items: [
          <>{uiText("Field utama:")} <code>event_id</code>, <code>sequence</code>, <code>event</code>, <code>occurred_at</code>, <code>previous_status</code>{uiText(", dan")} <code>dispatch</code>.</>,
          <>{uiText("Objek")} <code>dispatch</code>  {uiText("berisi ID pengiriman,")} <code>job_id</code>  {uiText("(jika diisi saat request),")} <code>device_id</code>, <code>transaction_id</code>, <code>store_id</code>, <code>message_key</code>{uiText(", penerima, status, waktu, dan error.")}</>,
        ] },
        { title: uiText("Request & autentikasi"), items: [<>{uiText("POST JSON memakai")} <code>Authorization: Bearer &lt;kunci&gt;</code>  {uiText("dan")} <code>X-Jeblast-Event-Id</code>.</>] },
        { title: uiText("Penerimaan & retry"), items: [
          <>{uiText("Kasir menyimpan event sebelum memberi respons 2xx.")}</>,
          <>{uiText("Lakukan deduplikasi")} <code>event_id</code>  {uiText("dan abaikan")} <code>sequence</code>  {uiText("yang lebih kecil atau sama per")} <code>dispatch.id</code>.</>,
          <>{uiText("Retry maksimal 8 percobaan dalam 24 jam.")}</>,
        ] },
        { title: uiText("Tes webhook"), items: [<>{uiText("Tombol tes mengirim")} <code>dispatch.webhook.test</code>  {uiText("dengan")} <code>dispatch=null</code>.</>] },
      ]} />
    }, { key: "device-webhook", label: uiText("Webhook perubahan perangkat"), children:
      <ApiGuideNotes label={uiText("Keterangan webhook perangkat")} sections={[
        { title: uiText("Konfigurasi"), items: [<>{uiText("Konfigurasi melalui")} <strong>{uiText("Admin Panel → Webhook Perangkat")}</strong>.</>] },
        { title: uiText("Event & pemicu"), items: [
          <>{uiText("Event:")} <code>device.created</code>, <code>device.updated</code>, <code>device.deleted</code>, <code>device.active_changed</code>{uiText(", dan")} <code>device.token_rotated</code>.</>,
          <>{uiText("Perubahan online/offline tidak memicu event.")}</>,
        ] },
        { title: uiText("Payload"), items: [
          <>{uiText("Field utama:")} <code>event_id</code>, <code>sequence</code>, <code>event</code>, <code>occurred_at</code>, <code>changed_fields</code>, <code>device</code>{uiText(", dan")} <code>owner</code>.</>,
          <>{uiText("QR dan sesi tidak disertakan.")}</>,
        ] },
        { title: uiText("Request & autentikasi"), items: [<>{uiText("Dikirim sebagai POST JSON ke URL tersimpan, dengan Bearer kunci webhook dan")} <code>X-Jeblast-Event-Id</code>.</>] },
        { title: uiText("Penerimaan & retry"), items: [
          <>{uiText("Receiver memvalidasi Bearer dan menyimpan event secara durable sebelum memberi respons 2xx.")}</>,
          <>{uiText("Lakukan deduplikasi")} <code>event_id</code>  {uiText("dan periksa")} <code>sequence</code>  {uiText("per device.")}</>,
          <>{uiText("Pengiriman dapat berulang, maksimal 8 percobaan dalam 24 jam.")}</>,
        ] },
        { title: uiText("Sinkronisasi & cakupan"), items: [
          <>{uiText("Gunakan direktori nomor untuk sinkronisasi awal.")}</>,
          <>{uiText("Webhook ini berbeda dari")} <strong>{uiText("Webhook URL pada Edit Device")}</strong>  {uiText("untuk event pesan masuk")} <code>message.incoming</code>.</>,
        ] },
      ]} />
    }]} />
  </div>;
}
ApiDocs.getLayout = (page: ReactElement) => <Layout title="API DOCS">{page}</Layout>;
export const getStaticProps = async ({ locale }: { locale: string }) => ({ props: { ...(await serverSideTranslations(locale, ["common", "upgrade", "interface"])) } });
