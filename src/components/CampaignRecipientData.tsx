import { useUiTranslation } from "@/lib/uiTranslation";
import { useMemo, useState } from "react";
import { Alert, Button, Input, Select, Space, Table, Tag, Upload, message as toast } from "antd";
import { campaignVariables, parseCampaignRows, renderCampaignMessage, type CampaignRecipient } from "@/lib/campaignPersonalization";
import { parseCsv } from "@/server/campaigns/csv";

export function campaignRecipientsCsv(recipients: CampaignRecipient[]): string {
  if (!recipients.length) return "";
  const keys = Array.from(new Set(recipients.flatMap(recipient => Object.keys(recipient.data || {}))));
  const quote = (cell: unknown) => `"${String(cell ?? "").replace(/"/g, '""')}"`;
  return [["nomor", "nama", ...keys], ...recipients.map(recipient => [recipient.number, recipient.name, ...keys.map(key => recipient.data?.[key] || "")])]
    .map(row => row.map(quote).join(",")).join("\r\n");
}

export function readCampaignRecipientCsv(value?: string): CampaignRecipient[] {
  return value?.trim() ? parseCampaignRows(parseCsv(value)) : [];
}

export default function CampaignRecipientData({ value = "", onChange, template = "", disabled = false, onBusy }: {
  value?: string; onChange?: (value: string) => void; template?: string; disabled?: boolean; onBusy?: (busy: boolean) => void;
}) {
  const uiText = useUiTranslation();
  const [loading, setLoading] = useState(false), [selected, setSelected] = useState("");
  const parsed = useMemo(() => {
    try { return { recipients: readCampaignRecipientCsv(value), error: "" }; }
    catch (error) { return { recipients: [] as CampaignRecipient[], error: error instanceof Error ? error.message : "Data tidak valid." }; }
  }, [value]);
  const keys = Array.from(new Set(parsed.recipients.flatMap(recipient => Object.keys(recipient.data || {}))));
  const target = parsed.recipients.find(recipient => recipient.number === selected) || parsed.recipients[0];
  const validation = useMemo(() => {
    if (!template.trim()) return "";
    try { for (const recipient of parsed.recipients) renderCampaignMessage(template, recipient); return ""; }
    catch (error) { return error instanceof Error ? error.message : "Personalisasi tidak valid."; }
  }, [template, parsed.recipients]);
  let preview = "";
  if (target && template.trim()) {
    try { preview = renderCampaignMessage(template, target); }
    catch (error) { preview = error instanceof Error ? error.message : uiText("Pratinjau tidak tersedia."); }
  }
  return <Space direction="vertical" style={{ width: "100%" }}>
    <div>{uiText("Tambahkan kolom seperti")} <code>no_invoice</code>, <code>nominal</code>{uiText(", atau")} <code>nama_produk</code>{uiText(", lalu gunakan")} <code>{"{no_invoice}"}</code>  {uiText("di pesan. Maksimal 30 kolom tambahan.")}</div>
    <Space wrap>
      <Upload accept=".csv,.xlsx" showUploadList={false} disabled={disabled || loading} beforeUpload={async file => {
        setLoading(true);
        onBusy?.(true);
        try {
          if (!/\.(csv|xlsx)$/i.test(file.name)) throw new Error(uiText("Gunakan file CSV atau Excel (.xlsx)."));
          if (file.size > 3_000_000) throw new Error(uiText("File maksimal 3 MB."));
          const rows = /\.xlsx$/i.test(file.name) ? await (await import("read-excel-file/browser")).readSheet(file) : parseCsv(await file.text());
          const recipients = parseCampaignRows(rows);
          const text = campaignRecipientsCsv(recipients);
          if (text.length > 3_000_000) throw new Error(uiText("Data penerima maksimal 3 MB setelah dibaca."));
          onChange?.(text); setSelected(""); toast.success(uiText(`${recipients.length.toLocaleString(uiText.locale)} penerima dibaca. Data sebelumnya pada bagian ini diganti.`));
        } catch (error) { toast.error(uiText(error instanceof Error ? error.message : uiText("File gagal dibaca."))); }
        finally { setLoading(false); onBusy?.(false); }
        return Upload.LIST_IGNORE;
      }}><Button loading={loading} disabled={disabled}>{uiText("Import data CSV / Excel")}</Button></Upload>
      <Button href="/templates/campaign-personalisasi.csv" download="campaign-personalisasi.csv">{uiText("Unduh contoh CSV")}</Button>
      <Button disabled={disabled || !value} onClick={() => { onChange?.(""); setSelected(""); }}>{uiText("Kosongkan data")}</Button>
    </Space>
    <div>{uiText("Simpan nomor, tanggal, kode invoice, dan nominal berformat khusus sebagai teks di Excel. Header dinormalisasi ke huruf kecil; spasi menjadi underscore. Impor memakai sheet pertama dan mengganti data pada bagian ini.")}</div>
    <Input.TextArea aria-label={uiText("Data personalisasi CSV")} value={value} disabled={disabled || loading} onChange={event => onChange?.(event.target.value)} rows={5}
      placeholder={'nomor,nama,no_invoice,nominal,nama_produk\n6281234567890,Budi,INV-001,Rp 150.000,Headset'} />
    <div>{uiText("Anda juga dapat menempel atau mengedit CSV langsung di atas. Satu baris per nomor; maksimal 10.000 penerima. Data ini hanya disimpan dalam campaign dan tidak mengubah phonebook.")}</div>
    {parsed.error && <Alert type="error" showIcon message={uiText(parsed.error)} />}
    {!!parsed.recipients.length && <>
      <div><strong>{parsed.recipients.length.toLocaleString(uiText.locale)}  {uiText("penerima")}</strong>  {uiText("— kolom pesan:")} <Tag>{"{nama}"}</Tag><Tag>{"{nomor}"}</Tag>{keys.map(key => <Tag key={key}>{`{${key}}`}</Tag>)}</div>
      <Table size="small" rowKey="number" scroll={{ x: true }} dataSource={parsed.recipients} pagination={{ pageSize: 5, showSizeChanger: false }} columns={[
        { title: uiText("Nomor"), dataIndex: "number" }, { title: uiText("Nama"), dataIndex: "name" },
        ...keys.map(key => ({ title: key, render: (_: unknown, recipient: CampaignRecipient) => recipient.data?.[key] || "—" })),
      ]} />
      {validation && <Alert type="error" showIcon message={uiText(validation)} description={uiText("Lengkapi data atau ubah placeholder pesan sebelum menyimpan campaign.")} />}
      <div><strong>{uiText("Pratinjau pesan")}</strong></div>
      <Select aria-label={uiText("Penerima pratinjau")} style={{ width: "100%" }} value={target?.number} showSearch optionFilterProp="label" onChange={setSelected}
        options={parsed.recipients.slice(0, 100).map(recipient => ({ value: recipient.number, label: `${recipient.name || recipient.number} (${recipient.number})` }))} />
      {parsed.recipients.length > 100 && <div>{uiText("Pratinjau pilihan menampilkan 100 penerima pertama. Seluruh penerima tetap divalidasi.")}</div>}
      <div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", padding: 12, border: "1px solid #ddd", borderRadius: 8, maxHeight: 240, overflow: "auto" }}>{preview || uiText("Isi pesan campaign untuk melihat pratinjau.")}</div>
    </>}
    {!!campaignVariables(template).filter(key => !["nama", "nomor"].includes(key)).length && <Alert type="info" showIcon message={uiText("Setiap penerima harus memiliki nilai untuk seluruh kolom yang digunakan di pesan. Kontak dari grup/phonebook dapat dilengkapi dengan baris bernomor sama di bagian ini. Nomor yang sama pada input manual harus dihapus dari input manual.")} />}
  </Space>;
}
