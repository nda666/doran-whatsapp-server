import { useUiTranslation, type UiTranslator } from "@/lib/uiTranslation";
import { Alert, Button, Card, Collapse, Space, Typography } from "antd";
import { ExportOutlined } from "@ant-design/icons";
import { providerNames, type AiProvider } from "@/lib/aiPlugins";

const guides = (uiText: UiTranslator): Record<AiProvider, { portal: string; portalName: string; docs: string; models: string; billing: string; steps: string[]; cost: string }> => ({
  openai: {
    portal: "https://platform.openai.com/api-keys", portalName: uiText("OpenAI Platform"),
    docs: "https://developers.openai.com/api/docs/quickstart",
    models: "https://developers.openai.com/api/docs/models",
    billing: "https://platform.openai.com/account/billing/overview",
    steps: [
      uiText("Buka halaman API key OpenAI melalui tombol di atas. Masuk ke akun OpenAI, atau daftar jika belum punya akun."),
      uiText("Pilih opsi untuk membuat API key baru. Jika diminta memilih proyek, pilih proyek yang akan digunakan untuk Doran WA. Beri nama yang mudah dikenali, misalnya Doran WA."),
      uiText("Salin seluruh kode key yang diberikan. Simpan di tempat aman saat key ditampilkan; jika tidak bisa melihatnya lagi, buat key pengganti."),
      uiText("Kembali ke halaman ini, pilih Atur OpenAI, lalu tempel kode tersebut ke kolom API key. Cara melengkapi kolom lainnya ada pada bagian 2 di bawah."),
    ],
    cost: uiText("Periksa menu Billing (penagihan) pada OpenAI Platform dan tambahkan saldo atau metode pembayaran bila diminta. Pemakaian API mengikuti model dan jumlah pemakaian. Pastikan akun API memiliki kuota yang cukup sebelum menguji balasan."),
  },
  gemini: {
    portal: "https://aistudio.google.com/api-keys", portalName: uiText("Google AI Studio"),
    docs: "https://ai.google.dev/gemini-api/docs/api-key",
    models: "https://ai.google.dev/gemini-api/docs/models",
    billing: "https://ai.google.dev/gemini-api/docs/billing",
    steps: [
      uiText("Buka Google AI Studio melalui tombol di atas dan masuk dengan akun Google. Ikuti persetujuan layanan jika baru pertama kali masuk."),
      uiText("Buka halaman API Keys. Untuk akun baru, proyek dan key bisa sudah dibuat otomatis. Jika belum ada, klik Create API key (buat API key)."),
      uiText("Pilih proyek yang akan digunakan, atau buat proyek baru jika pilihan itu tersedia. Proyek adalah wadah pengaturan kuota dan tagihan. Jika proyek lama tidak muncul, buka Projects lalu Import projects."),
      uiText("Salin key dari halaman API Keys. Gunakan key baru dari AI Studio jika key lama diblokir. Bila tombol pembuatan key tidak bisa diklik karena izin, minta bantuan admin akun/proyek Google Anda."),
      uiText("Kembali ke halaman ini, pilih Atur Gemini AI, lalu tempel ke kolom API key. Lanjutkan ke bagian 2 untuk melengkapi pengaturan."),
    ],
    cost: uiText("Gemini menyediakan kuota gratis untuk model tertentu dengan batas pemakaian. Jika model atau kebutuhan Anda memerlukan paket berbayar, buka Set up billing pada proyek di AI Studio dan ikuti petunjuknya. Kuota gratis, model, serta ketersediaannya mengikuti ketentuan Google."),
  },
  claude: {
    portal: "https://platform.claude.com/settings/keys", portalName: uiText("Claude Console"),
    docs: "https://platform.claude.com/docs/en/get-api-key",
    models: "https://platform.claude.com/docs/en/models/overview",
    billing: "https://platform.claude.com/settings/billing",
    steps: [
      uiText("Buka Claude Console melalui tombol di atas. Masuk atau buat akun, lalu selesaikan pengaturan akun yang diminta."),
      uiText("Buka Settings → API keys, kemudian klik Create key (buat key). Beri nama, misalnya Doran WA, lalu pilih masa berlaku dan akun/workspace sesuai akses Anda."),
      uiText("Salin seluruh kode key saat muncul. Claude menampilkan key lengkap hanya sekali. Jika lupa menyimpannya, buat key baru. Jika tombol Create key tidak aktif, minta bantuan admin organisasi Anda."),
      uiText("Kembali ke halaman ini, pilih Atur Claude AI, lalu tempel kode ke kolom API key. Lanjutkan ke bagian 2 untuk melengkapi pengaturan."),
    ],
    cost: uiText("Periksa Billing (penagihan) pada Claude Console dan pastikan kredit atau metode pembayaran API siap. Biaya mengikuti model serta jumlah pemakaian; kredit percobaan atau promosi, jika tersedia, mengikuti ketentuan akun Anda."),
  },
});
function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
}

export default function AiProviderGuide({ provider }: { provider: AiProvider }) {
  const uiText = useUiTranslation();
  const guide = guides(uiText)[provider], name = providerNames[provider];
  return <section id="panduan-api-key" aria-label={uiText("Panduan API key {{v0}}", { v0: name })} style={{ scrollMarginTop: 110 }}>
    <Card title={uiText("Panduan mulai menggunakan {{v0}}", { v0: name })}>
      <Typography.Paragraph><strong>{uiText("API key adalah kode rahasia")}</strong>  {uiText("agar Doran WA dapat memakai layanan AI dari akun Anda. Cukup buat key di situs penyedia, lalu salin ke formulir di halaman ini. Anda tidak perlu menulis kode program.")}</Typography.Paragraph>
      <Collapse key={provider} defaultActiveKey={["key"]} items={[
        { key: "key", label: uiText("1. Cara mendapatkan API key {{v0}}", { v0: name }), children: <>
          <Space wrap style={{ marginBottom: 12 }}><Button href={guide.portal} target="_blank" rel="noopener noreferrer" icon={<ExportOutlined />}>{uiText("Buka API key di")} {guide.portalName}</Button></Space>
          <ol style={{ margin: "0 0 16px", paddingLeft: 24 }}>{guide.steps.map(step => <li key={step} style={{ marginBottom: 10, lineHeight: 1.7 }}>{step}</li>)}</ol>
          <Alert type="info" showIcon message={uiText("Apakah harus membayar?")} description={<>{guide.cost} <ExternalLink href={guide.billing}>{uiText("Lihat informasi penagihan")}</ExternalLink>.</>} />
          <Typography.Paragraph style={{ marginTop: 12, marginBottom: 0 }} type="secondary">{uiText("Nama atau letak tombol di situs penyedia dapat berubah.")} <ExternalLink href={guide.docs}>{uiText("Buka panduan resmi")} {name}</ExternalLink>  {uiText("jika tampilan akun Anda berbeda.")}</Typography.Paragraph>
        </> },
        { key: "setup", label: uiText("2. Isi pengaturan di Doran WA dan uji balasan"), children: <>
          <ol style={{ margin: "0 0 12px", paddingLeft: 24, lineHeight: 1.8 }}>
            <li><strong>{uiText("API key:")}</strong>  {uiText("tempel seluruh kode yang tadi disalin, tanpa menambahkan spasi atau tanda kutip. Satu penyedia memakai key miliknya sendiri.")}</li>
            <li><strong>{uiText("ID model:")}</strong>  {uiText("model adalah jenis AI yang akan menjawab. Buka")} <ExternalLink href={guide.models}>{uiText("daftar model resmi")} {name}</ExternalLink>{uiText(", pilih model yang mendukung jawaban teks dan tersedia untuk akun Anda, lalu salin kode pada bagian Model ID / API ID ke kolom ID model. Gunakan kode lengkapnya; nama tampilan saja belum tentu sama.")}</li>
            <li><strong>{uiText("Instruksi bisnis / sistem:")}</strong>  {uiText("tulis peran AI dan informasi usaha. Contoh: “Anda admin Toko Doran. Jam layanan Senin–Sabtu 09.00–17.00 WIB. Jawab singkat dan ramah. Untuk harga atau stok yang belum diketahui, arahkan ke admin.”")}</li>
            <li><strong>{uiText("Batas token jawaban:")}</strong>  {uiText("token adalah potongan teks yang dihitung oleh AI. Untuk uji awal, biarkan nilai bawaan 1024. Jika jawaban terpotong, naikkan batas sesuai kebutuhan dan kemampuan model.")}</li>
            <li><strong>{uiText("Batas permintaan:")}</strong>  {uiText("atur jumlah pemakaian per menit dan per hari. Ini membatasi jumlah permintaan di Doran WA, bukan batas tagihan dalam rupiah. Pantau juga biaya pada akun penyedia.")}</li>
            <li>{uiText("Centang")} <strong>{uiText("Aktifkan plugin ini")}</strong>{uiText(", klik")} <strong>{uiText("Simpan pengaturan")}</strong>{uiText(", lalu klik")} <strong>{uiText("Uji koneksi & balasan")}</strong>{uiText(". Coba pesan sederhana, misalnya “Jam layanan toko sampai pukul berapa?”. Uji ini memakai kuota API dan hasilnya hanya ditampilkan di dashboard.")}</li>
            <li>{uiText("Jika uji berhasil, buka")} <strong>{uiText("Perangkat HP → Auto Reply")}</strong>{uiText(". Buat aturan berjenis")} <strong>{uiText("Balasan AI")}</strong>{uiText(", pilih")} {name}{uiText(", tentukan kata kunci dan cakupan pesan, lalu aktifkan aturan serta Balasan Otomatis pada perangkat.")}</li>
          </ol>
          <Typography.Paragraph style={{ marginBottom: 0 }}>{uiText("Pengaturan plugin saja belum membuat bot membalas. Aturan Auto Reply dan perangkat WhatsApp juga harus siap.")}</Typography.Paragraph>
        </> },
        { key: "help", label: uiText("3. Jika key atau uji balasan belum berhasil"), children: <>
          <ul style={{ margin: "0 0 12px", paddingLeft: 24, lineHeight: 1.8 }}>
            <li><strong>{uiText("Key atau akses model ditolak:")}</strong>  {uiText("periksa apakah key berasal dari penyedia yang dipilih, masih aktif, dan diizinkan memakai model tersebut. Salin ulang jika ada bagian key yang terlewat.")}</li>
            <li><strong>{uiText("Kuota / batas permintaan tercapai:")}</strong>  {uiText("periksa sisa kuota atau kredit di situs penyedia. Jika batas per menit tercapai, tunggu lalu coba lagi; jika batas harian Doran WA tercapai, kuota aplikasi kembali pada pukul 00.00 WIB.")}</li>
            <li><strong>{uiText("Model tidak tersedia / permintaan ditolak:")}</strong>  {uiText("cocokkan kembali ID model dengan daftar resmi dan akses akun Anda. Periksa juga status penagihan.")}</li>
            <li><strong>{uiText("Jawaban belum lengkap:")}</strong>  {uiText("minta AI menjawab lebih singkat melalui instruksi, atau sesuaikan batas token jawaban.")}</li>
            <li><strong>{uiText("Tombol uji belum bisa diklik:")}</strong>  {uiText("pastikan key dan ID model sudah diisi, plugin aktif, dan pengaturan berhasil disimpan. Jika enkripsi belum siap, hubungi admin Doran WA.")}</li>
          </ul>
          <Alert type="warning" showIcon message={uiText("Perlakukan API key seperti kata sandi")} description={uiText("Jangan kirim key melalui chat atau membagikan screenshot yang memperlihatkannya. Jika key bocor, cabut key di situs penyedia, buat key baru, lalu perbarui di Doran WA. Setelah key tersimpan, kosongkan kolom API key saat mengubah pengaturan lain agar key lama tetap digunakan.")} />
        </> },
      ]} />
    </Card>
  </section>;
}
