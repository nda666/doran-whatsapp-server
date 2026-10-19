import { useUiTranslation, type UiTranslator } from "@/lib/uiTranslation";
import CampaignReport from "@/components/CampaignReport";
import { statusLabel } from "@/lib/messagingLabels";
import FilterSelect from "@/components/FilterSelect";
import ActionDropdown from "@/components/ActionDropdown";
import { EditOutlined, HistoryOutlined, PauseCircleOutlined, PlayCircleOutlined, StopOutlined } from "@ant-design/icons";
import Table from "@/components/DashboardTable";
import { useTableState } from "@/lib/useTableState";
import { useLocalizedTranslation as useTranslation } from "@/lib/uiTranslation";
import { ReactElement, useState } from "react";
import { Alert, Button, Card, Checkbox, DatePicker, Form, Input, InputNumber, Modal, Select, Space, Tag, message } from "antd";
import axios from "axios";
import dayjs from "dayjs";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import Layout from "@/components/Layout";
import StickerPreview from "@/components/StickerPreview";
import StickerPhotoUpload from "@/components/StickerPhotoUpload";
import MessageTemplatePicker from "@/components/MessageTemplatePicker";
import CampaignRecipientData, { campaignRecipientsCsv, readCampaignRecipientCsv } from "@/components/CampaignRecipientData";
import { renderCampaignMessage } from "@/lib/campaignPersonalization";
import { useDashboardApi } from "@/lib/useDashboardApi";
const labels = (uiText: UiTranslator): Record<string, string> => ({ WAITING: uiText("Menunggu"), PROCESSING: "Memproses", COMPLETED: uiText("Selesai"), PAUSED: uiText("Dijeda"), CLEARED: "Dikosongkan" });
export default function Campaigns() {
  const uiText = useUiTranslation();
  const { t: ui } = useTranslation("upgrade");
  const [contactSearch, setContactSearch] = useState("");
  const contacts = useDashboardApi(`/api/contacts?q=${encodeURIComponent(contactSearch)}`);
  const table = useTableState(), historyTable = useTableState();
  const [modal, modalContext] = Modal.useModal();
  const [status, setStatus] = useState(""), [phoneId, setPhoneId] = useState("");
  const api = useDashboardApi(`/api/campaigns?${table.params}&status=${status}&phoneId=${phoneId}`, 5000);
  const phones = useDashboardApi("/api/phones?options=1"), groups = useDashboardApi("/api/contacts/groups"), media = useDashboardApi("/api/media?options=1");
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [history, setHistory] = useState(""), [editing, setEditing] = useState(false);
  const detail = useDashboardApi(history ? `/api/campaigns/${history}?${historyTable.params}` : "", 5000);
  const [form] = Form.useForm();
  const [recipientBusy, setRecipientBusy] = useState(false);
  const [stickerBusy, setStickerBusy] = useState(false);
  const [uploadedStickers, setUploadedStickers] = useState<{ id: string; name: string; mime: string; size: number }[]>([]);
  const selectedMediaId = Form.useWatch("mediaId", form);
  const messageType = Form.useWatch("messageType", form) || "message";
  const mediaOptions = [...uploadedStickers, ...(media.data?.data || []).filter((m: any) => !uploadedStickers.some(s => s.id === m.id))];
  const sendNow = Form.useWatch("sendNow", form);
  const watchedMessage = Form.useWatch("message", form);
  const campaignMessage = messageType === "sticker" ? "" : watchedMessage || "";
  const action = async (id: string, action: string) => { try { await axios.patch(`/api/campaigns/${id}`, { action }, { headers: api.headers }); api.reload(); } catch (e: any) { message.error(uiText(e.response?.data?.message || uiText("Aksi gagal."))); } };
  const save = async (values: any) => {
    setBusy(true);
    try {
      const recipients = [...(values.manual || "").split(/[\n;,]+/).map((v: string) => v.trim()).filter(Boolean).map((v: string) => { const [number, ...name] = v.split("|"); return { number: number.trim(), name: name.join("|").trim() }; }), ...readCampaignRecipientCsv(values.recipientCsv)];
      const { recipientCsv: _recipientCsv, manual: _manual, ...fields } = values;
      const data = { ...fields, message: values.messageType === "sticker" ? "" : values.message, contactIds: (values.contactIds || []).map((c: any) => c.value), recipients, scheduledAt: values.sendNow ? undefined : values.scheduledAt?.toISOString() };
      if (editing) await axios.patch(`/api/campaigns/${values.id}`, { ...data, action: "edit" }, { headers: api.headers });
      else await axios.post("/api/campaigns", data, { headers: api.headers });
      setOpen(false); form.resetFields(); api.reload(); message.success(uiText(editing ? uiText("Campaign diperbarui.") : uiText("Campaign tersimpan dalam antrean.")));
    } catch (e: any) { message.error(uiText(e.response?.data?.message || e.message || uiText("Campaign belum tersimpan. Coba lagi dengan formulir yang sama."))); }
    finally { setBusy(false); }
  };
  const phoneOptions = (phones.data || []).map((p: any) => ({ value: p.id, label: `${p.name} (${p.number || uiText("belum dipasangkan")})`, disabled: p.active !== 1 }));
  return <Space direction="vertical" size="middle" style={{ width: "100%" }}>
    <Alert type="info" showIcon message={uiText("Kampanye pesan")} description={<Space direction="vertical" size={4}>
      <div><strong>{uiText("Isi pesan otomatis:")}</strong>  {uiText("tulis")} <code>{"{nama}"}</code>  {uiText("untuk memasukkan nama penerima dan")} <code>{"{nomor}"}</code>  {uiText("untuk memasukkan nomor WhatsApp penerima. Contoh:")} <code>{"Halo {nama}"}</code>  {uiText("menjadi")} <code>Halo Budi</code>  {uiText("untuk kontak bernama Budi.")}</div>
      <div><strong>{uiText("Kolom tambahan:")}</strong>  {uiText("impor data penerima CSV/Excel di formulir campaign untuk memakai")} <code>{"{no_invoice}"}</code>, <code>{"{nominal}"}</code>, <code>{"{nama_produk}"}</code>{uiText(", atau kolom Anda sendiri. Lihat pratinjau sebelum menyimpan.")}</div>
      <div><strong>{uiText("Perangkat pengirim:")}</strong>  {uiText("jika memilih beberapa perangkat, pesan dibagi bergiliran sesuai urutan perangkat yang Anda pilih. Contoh: pesan pertama memakai perangkat A, pesan kedua memakai B, lalu pesan ketiga kembali memakai A.")}</div>
      <div>{uiText("Jeda pengiriman berlaku pada masing-masing perangkat. Jeda dan pergiliran perangkat tidak menjamin akun bebas pembatasan WhatsApp. Jeda campaign atau kosongkan antrean hanya berlaku untuk pesan yang belum mulai dikirim.")}</div>
    </Space>} />
    <Space wrap><Button type="primary" onClick={() => { if (editing || !form.getFieldValue("id")) { form.resetFields(); form.setFieldsValue({ id: crypto.randomUUID(), delayMin: 5, delayMax: 15, phoneIds: [], messageType: "message", sendNow: true }); } groups.reload(); setEditing(false); setOpen(true); }}>{ui("Buat Campaign")}</Button>
    </Space>
    <Card title={uiText("Pencarian")}><Form layout="vertical" colon={false} className="dashboard-filter-grid" onFinish={values => { setStatus(values.status || ""); setPhoneId(values.phoneId || ""); table.reset(); api.reload(); }}>
      <Form.Item name="status" label={uiText("Status campaign")}><FilterSelect allLabel={uiText("Semua status")} options={Object.entries(labels(uiText)).map(([value, label]) => ({ value, label }))} /></Form.Item>
      <Form.Item name="phoneId" label={uiText("Perangkat")}><FilterSelect allLabel={uiText("Semua perangkat")} options={phoneOptions.map((phone: any) => ({ ...phone, disabled: false }))} /></Form.Item>
      <div className="dashboard-filter-actions"><Button type="primary" htmlType="submit">{uiText("Cari")}</Button></div>
    </Form></Card>
    <Alert type="info" message={uiText("Daftar mencakup jadwal mendatang dan aktivitas terbaru. Laporan setiap kampanye memakai seluruh pesan dalam kampanye tersebut.")} />
    {api.error && <Alert type="error" message={uiText(api.error)} />}
    <Table className="table-with-data-count" rowKey="id" scroll={{ x: 1100 }} dataSource={api.data?.data || []} table={table} total={api.data?.total} columns={[
      { title: uiText("Campaign"), dataIndex: "name" }, { title: ui("Status"), dataIndex: "status", render: s => <Tag>{ui(labels(uiText)[s])}</Tag> },
      { title: ui("Jadwal"), dataIndex: "scheduledAt", render: v => dayjs(v).format("DD/MM/YYYY HH:mm") },
      { title: uiText("Ringkasan pengiriman"), width: 220, render: (_, c: any) => <Space direction="vertical" size={4}>
        <Tag color="green">{uiText("Terkirim:")} {(c.counts.SENT || 0) + (c.counts.DELIVERED || 0) + (c.counts.READ || 0)}</Tag>
        <Tag color="red">{uiText("Gagal:")} {c.counts.FAILED || 0}</Tag>
        <Tag color="blue">{uiText("Antrean:")} {(c.counts.QUEUED || 0) + (c.counts.PROCESSING || 0)}</Tag>
        <Tag color="orange">{uiText("Perlu diperiksa:")} {c.counts.UNCERTAIN || 0}</Tag>
      </Space> },
      { title: ui("Aksi"), key: "aksi", width: 120, render: (_, c: any) => <ActionDropdown ariaLabel={uiText("Aksi campaign {{v0}}", { v0: c.name })} items={[
        { key: "history", label: uiText("Laporan dan riwayat"), icon: <HistoryOutlined />, onClick: () => { setHistory(c.id); historyTable.reset(); } },
        ...(["WAITING", "PAUSED"].includes(c.status) ? [{ key: "edit", label: uiText("Edit"), icon: <EditOutlined />, onClick: async () => { try {
          const audience = c.audience || {};
          let targets = audience.recipients || [];
          if (!c.audience) { const rows = await axios.get(`/api/campaigns/${c.id}?limit=100`, { headers: api.headers }); if (rows.data.total > 100) { message.error(uiText("Campaign lama dengan lebih dari 100 penerima perlu dibuat ulang untuk mengubah target.")); return; } targets = rows.data.data.map((job: any) => ({ number: job.recipient, name: "" })); }
          const hasData = targets.some((recipient: any) => recipient.data && Object.keys(recipient.data).length);
          form.resetFields(); form.setFieldsValue({ ...c, messageType: audience.messageType || "message", sendNow: false, scheduledAt: dayjs(c.scheduledAt), phoneIds: c.phoneIds, allContacts: audience.allContacts || false, groupIds: audience.groupIds || [], contactIds: (audience.contactIds || []).map((id: string) => ({ value: id, label: (contacts.data?.data || []).find((contact: any) => contact.id === id)?.name || id })), recipientCsv: hasData ? campaignRecipientsCsv(targets) : "", manual: hasData ? "" : targets.map((recipient: any) => `${recipient.number}|${recipient.name || ""}`).join("\n") }); groups.reload(); setEditing(true); setOpen(true);
        } catch { message.error(uiText("Campaign belum dapat dibuka.")); } } }] : []),
        ...(["WAITING", "PROCESSING", "PAUSED"].includes(c.status) ? [
          { key: "pause", label: c.status === "PAUSED" ? "Lanjutkan" : "Jeda", icon: c.status === "PAUSED" ? <PlayCircleOutlined /> : <PauseCircleOutlined />, onClick: () => action(c.id, c.status === "PAUSED" ? "resume" : "pause") },
          { key: "clear", label: ui("Kosongkan"), icon: <StopOutlined />, danger: true, onClick: () => modal.confirm({ title: uiText("Batalkan semua pesan yang belum dikirim?"), content: c.name, okText: ui("Kosongkan"), cancelText: uiText("Batal"), okButtonProps: { danger: true }, onOk: () => action(c.id, "clear") }) },
        ] : []),
      ]} /> },
    ]} />
    <Modal title={editing ? uiText("Edit campaign") : uiText("Campaign baru")} open={open} width={720} onCancel={() => !busy && !stickerBusy && !recipientBusy && setOpen(false)} okText={uiText("Simpan")} cancelText={uiText("Batal")} confirmLoading={busy} okButtonProps={{ disabled: stickerBusy || recipientBusy }} onOk={() => form.submit()} styles={{ body: { paddingTop: 16 } }}>
      <Form form={form} layout="vertical" onFinish={save} disabled={busy || stickerBusy || recipientBusy}>
        <Form.Item name="id" hidden><Input /></Form.Item>
        <Form.Item name="name" label={ui("Nama campaign")} rules={[{ required: true }]}><Input maxLength={200} /></Form.Item>
        <Form.Item name="phoneIds" label={uiText("Perangkat pengirim (pilih beberapa untuk rotasi)")} rules={[{ required: true, message: uiText("Pilih perangkat pengirim.") }]}><Select mode="multiple" showSearch optionFilterProp="label" placeholder={uiText("Pilih perangkat pengirim campaign")} options={phoneOptions} /></Form.Item>
        <Form.Item name="messageType" label={uiText("Kirim sebagai")} initialValue="message"><Select options={[{ value: "message", label: uiText("Pesan / media") }, { value: "sticker", label: uiText("Stiker") }]} onChange={() => form.setFieldValue("mediaId", undefined)} /></Form.Item>
        {messageType !== "sticker" && <>
        <Form.Item label={uiText("Gunakan pesan tersimpan")}><MessageTemplatePicker disabled={busy} preserveRecipient preserveVariables onApply={text => form.setFieldValue("message", text)} /></Form.Item>
        <Form.Item name="message" label={ui("Pesan / caption")} extra={<>
          <div>{uiText("Tulis")} <code>{"{nama}"}</code>  {uiText("untuk nama penerima atau")} <code>{"{nomor}"}</code>  {uiText("untuk nomor WhatsApp penerima.")}</div>
          <div>{uiText("Kolom tambahan mengikuti header data penerima. Contoh:")} <code>{"Halo {nama}, invoice {no_invoice} sebesar {nominal} untuk {nama_produk}."}</code></div>
          <div>{uiText("Jika kontak tidak memiliki nama,")} <code>{"{nama}"}</code>  {uiText("akan diisi dengan nomor penerima.")}</div>
        </>} rules={[{ required: true }]}><Input.TextArea rows={4} maxLength={10000} showCount={{ formatter: ({ count }) => `${count} / 10.000 karakter` }} placeholder={uiText("Halo {nama}, terima kasih sudah menghubungi kami.")} /></Form.Item>
        </>}
        <Form.Item name="mediaId" label={messageType === "sticker" ? uiText("Stiker dari File Manager") : uiText("Media dari File Manager")} rules={messageType === "sticker" ? [{ required: true, message: uiText("Pilih stiker atau unggah foto terlebih dahulu.") }] : []}><Select allowClear showSearch optionFilterProp="label" options={mediaOptions.filter((m: any) => messageType !== "sticker" || (m.mime === "image/webp" && m.size <= 100 * 1024)).map((m: any) => ({ value: m.id, label: m.name }))} /></Form.Item>
        {messageType === "sticker" && <Space direction="vertical" style={{ marginBottom: 16 }}>
          <StickerPhotoUpload headers={api.headers} busy={busy || stickerBusy} onBusy={setStickerBusy} onUploaded={asset => { setUploadedStickers(previous => [asset, ...previous]); form.setFieldValue("mediaId", asset.id); media.reload(); }} />
          <StickerPreview id={selectedMediaId} headers={api.headers} />
          <span>{uiText("JPG, PNG, atau WebP statis, maksimal 25 MB. Foto diubah sekali menjadi stiker 512 × 512 tanpa dipotong dan disimpan untuk semua penerima. Stiker dikirim tanpa caption.")}</span>
        </Space>}
        {groups.error && <Alert type="error" showIcon message={uiText(groups.error)} action={<Button size="small" onClick={groups.reload}>{uiText("Coba lagi")}</Button>} style={{ marginBottom: 16 }} />}
        <Form.Item name="groupIds" label={uiText("Pilih grup dari menu Kontak")} extra={uiText("Semua kontak dalam grup yang dipilih akan menjadi penerima campaign. Anda dapat memilih lebih dari satu grup.")}><Select mode="multiple" showSearch optionFilterProp="label" loading={!groups.data && !groups.error} placeholder={uiText("Pilih grup kontak")} notFoundContent={groups.error ? uiText("Grup kontak belum dapat dimuat") : groups.data ? uiText("Tidak ada grup yang cocok. Kelola grup di menu Kontak.") : uiText("Memuat grup kontak...")} options={(groups.data || []).map((g: any) => ({ value: g.id, label: uiText("{{v0}} ({{v1}} kontak)", { v0: g.name, v1: g._count.contacts }) }))} /></Form.Item>
        <Form.Item name="contactIds" label={uiText("Pilih kontak phonebook")}><Select mode="multiple" labelInValue showSearch filterOption={false} onSearch={setContactSearch} options={(contacts.data?.data || []).map((c: any) => ({ value: c.id, label: `${c.name} (${c.number})` }))} /></Form.Item>
        <Form.Item name="allContacts" valuePropName="checked"><Checkbox>{uiText("Semua kontak phonebook (maks. 10.000)")}</Checkbox></Form.Item>
        <Form.Item name="manual" label={uiText("Input manual (satu baris: nomor|nama)")}><Input.TextArea rows={4} placeholder={"081234567890|Budi\n+628134567890|Sari"} /></Form.Item>
        <Form.Item name="recipientCsv" label={uiText("Data penerima & kolom tambahan")} dependencies={["message", "messageType"]} rules={[{ validator: async (_, value) => {
          const recipients = readCampaignRecipientCsv(value);
          if (campaignMessage.trim()) for (const recipient of recipients) renderCampaignMessage(campaignMessage, recipient);
        } }]}><CampaignRecipientData template={campaignMessage} disabled={busy || stickerBusy} onBusy={setRecipientBusy} /></Form.Item>
        <Form.Item name="sendNow" valuePropName="checked"><Checkbox>{uiText("Kirim sekarang")}</Checkbox></Form.Item>
        {!sendNow && <Form.Item name="scheduledAt" label={uiText("Tanggal dan jam pengiriman")} rules={[{ required: true, message: uiText("Pilih tanggal dan jam pengiriman.") }]}><DatePicker showTime={{ format: "HH:mm", use12Hours: false }} format="DD/MM/YYYY HH:mm" style={{ width: "100%" }} /></Form.Item>}
        <fieldset style={{ border: 0, margin: 0, padding: 0 }}>
          <legend style={{ marginBottom: 8, fontSize: 14, fontWeight: 600 }}>{uiText("Jeda pengiriman antarpesan")}</legend>
          <p style={{ marginTop: 0 }}>{uiText("Jeda dipilih secara acak antara nilai minimum dan maksimum untuk setiap perangkat. Contoh: minimum 5 dan maksimum 15 berarti perangkat menunggu 5 sampai 15 detik sebelum mengirim pesan berikutnya.")}</p>
          <Space wrap><Form.Item name="delayMin" label={uiText("Jeda minimum (detik)")}><InputNumber min={1} max={3600} /></Form.Item><Form.Item name="delayMax" label={uiText("Jeda maksimum (detik)")}><InputNumber min={1} max={3600} /></Form.Item></Space>
        </fieldset>
      </Form>
    </Modal>
    {modalContext}
    <Modal title={uiText("Laporan kampanye dan riwayat penerima")} open={!!history} width={1100} onCancel={() => setHistory("")} footer={null}>
      {history && <CampaignReport campaignId={history} />}
      {detail.error && <Alert type="error" message={uiText(detail.error)} />}
      <Table className="table-with-data-count" rowKey="id" scroll={{ x: true }} dataSource={detail.data?.data || []} table={historyTable} total={detail.data?.total} columns={[
        { title: ui("Penerima"), dataIndex: "recipient" }, { title: ui("Device"), dataIndex: "phoneId" }, { title: ui("Status"), dataIndex: "status", render: (value: string) => uiText(statusLabel(value)) }, { title: ui("Keterangan"), dataIndex: "lastError" }, { title: ui("Terkirim"), dataIndex: "sentAt", render: v => v ? dayjs(v).format("DD/MM HH:mm:ss") : "—" },
      ]} />
    </Modal>
  </Space>;
}
Campaigns.getLayout = (page: ReactElement) => <Layout title="Kampanye pesan">{page}</Layout>;
export const getStaticProps = async ({ locale }: { locale: string }) => ({ props: { ...(await serverSideTranslations(locale, ["common", "upgrade", "interface"])) } });
