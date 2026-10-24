import { useUiTranslation, type UiTranslator } from "@/lib/uiTranslation";
import { useEffect, useState } from "react";
import { Alert, Button, Form, Input, InputNumber, Modal, Select, Space, Typography } from "antd";
import axios from "axios";
import type { Phone } from "@prisma/client";
import { normalizePhoneRecipient } from "@/utils/normalizePhoneRecipient";
import { matchesTestMedia, testSendTypes } from "@/lib/testSend";
import MessageTemplatePicker from "@/components/MessageTemplatePicker";
import StickerPhotoUpload from "@/components/StickerPhotoUpload";
import StickerPreview from "@/components/StickerPreview";
import { isTelegramDevice, telegramMessageTypes } from "@/lib/messagingChannel";

const required = (uiText: UiTranslator) => ([{ required: true, message: uiText("Isi bagian ini.") }]);
const requiredText = (uiText: UiTranslator) => ([{ required: true, whitespace: true, message: uiText("Isi bagian ini.") }]);
type MediaOption = { id: string; name: string; mime: string };

export default function TestSendModal({ open, phone, token, onClose }: { open: boolean; phone?: Phone; token?: string; onClose: () => void }) {
  const uiText = useUiTranslation();
  const [form] = Form.useForm();
  const phoneId = phone?.id;
  const telegram = !!phone && isTelegramDevice(phone);
  const type = Form.useWatch("type", form) || "text";
  const recipient = Form.useWatch("number", form) || "";
  const [sending, setSending] = useState(false);
  const [stickerBusy, setStickerBusy] = useState(false);
  const [uploadedMedia, setUploadedMedia] = useState<MediaOption[]>([]);
  const selectedMediaId = Form.useWatch("mediaId", form);
  const headers = { Authorization: token ? `Bearer ${token}` : "" };
  const busy = sending || stickerBusy;
  const [media, setMedia] = useState<MediaOption[]>([]);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [mediaError, setMediaError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [result, setResult] = useState<{ success: boolean; message: string; queued?: boolean }>();
  useEffect(() => {
    if (open) {
      form.resetFields();
      form.setFieldsValue({ number: "", type: "text", message: telegram ? "Pesan test dari dashboard Telegram." : "Pesan test dari dashboard WhatsApp.",
        buttons: [{ id: "test-1", text: "Pilihan 1" }, { id: "test-2", text: "Pilihan 2" }],
        rows: [{ id: "opsi-1", title: "Pilihan 1" }, { id: "opsi-2", title: "Pilihan 2" }],
        title: "Daftar pilihan", buttonText: "Lihat pilihan", pollName: "Pilih opsi test", values: ["Pilihan 1", "Pilihan 2"], selectableCount: 1 });
      setResult(undefined);
      setUploadedMedia([]);
    }
  }, [open, phone?.id, form, telegram]);
  useEffect(() => {
    if (!open || !phoneId) return;
    let current = true;
    setLoadingMedia(true); setMedia([]); setMediaError("");
    axios.get(`/api/phones/${phoneId}/test-send`, { headers: token ? { Authorization: `Bearer ${token}` } : undefined })
      .then(response => { if (current) setMedia(response.data.data || []); })
      .catch(() => { if (current) setMediaError("Daftar file belum dapat dimuat. Klik Muat ulang file."); })
      .finally(() => { if (current) setLoadingMedia(false); });
    return () => { current = false; };
  }, [open, phoneId, token, refresh]);
  const send = async (values: any) => {
    if (!phone || busy) return;
    const body: any = { number: values.number, type: values.type, message: values.type === "sticker" ? "" : values.message || "" };
    if (["image", "video", "audio", "document", "sticker"].includes(values.type)) body.mediaId = values.mediaId;
    if (values.type === "button") body.payload = { text: values.message, buttons: values.buttons };
    if (values.type === "list") body.payload = { text: values.message, title: values.title, buttonText: values.buttonText, rows: values.rows };
    if (values.type === "poll") body.payload = { name: values.pollName, values: values.values, selectableCount: values.selectableCount };
    if (values.type === "location") body.payload = { latitude: values.latitude, longitude: values.longitude, ...(values.locationName?.trim() ? { name: values.locationName.trim() } : {}) };
    if (values.type === "vcard") body.payload = { name: values.contactName, number: normalizePhoneRecipient(values.contactNumber) };
    setSending(true); setResult(undefined);
    try {
      const response = await axios.post(`/api/phones/${phone.id}/test-send`, body, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined, timeout: 45_000,
      });
      setResult({ success: response.data.result === true, message: response.data.message, queued: response.data.queued });
    } catch (error) {
      setResult({ success: false, message: axios.isAxiosError(error)
        ? error.response?.data?.message || uiText("Belum mendapat konfirmasi. Periksa HP tujuan sebelum mencoba lagi.")
        : uiText("Pengiriman belum dapat dikonfirmasi. Periksa HP tujuan.") });
    } finally { setSending(false); }
  };
  const hasMedia = ["image", "video", "audio", "document", "sticker"].includes(type);
  const hasMessage = ["text", "image", "video", "document", "button", "list"].includes(type);
  const needsMessage = ["text", "button", "list"].includes(type);
  const options = [...uploadedMedia, ...media.filter(item => !uploadedMedia.some(uploaded => uploaded.id === item.id))].filter(item => matchesTestMedia(type, item.mime));
  return (
    <Modal title={uiText(telegram ? "Test Kirim Telegram" : "Test Kirim WhatsApp")} open={open} onCancel={() => !busy && onClose()} width={640} style={{ top: 24 }}
      styles={{ body: { maxHeight: "calc(100dvh - 200px)", overflowY: "auto" } }}
      closable={!busy} maskClosable={!busy} keyboard={!busy}
      okText={uiText("Kirim 1 Pesan Test")} cancelText={uiText("Tutup")} confirmLoading={sending}
      cancelButtonProps={{ disabled: busy }} okButtonProps={{ disabled: stickerBusy }} onOk={() => form.submit()}>
      <Typography.Paragraph>{uiText("Pengirim:")} <strong>{phone?.number || phone?.name}</strong></Typography.Paragraph>
      <Form form={form} layout="vertical" onFinish={send} disabled={busy} onValuesChange={changed => {
        setResult(undefined);
        if (changed.type) form.setFieldValue("mediaId", undefined);
      }}>
        <Form.Item name="number" label={uiText("Nomor tujuan")} extra={uiText("Boleh memakai 08…, 62…, atau +62…; spasi dan tanda hubung juga diterima.")} rules={[...required(uiText), { validator: async (_, value) => { if (!value) return; try { normalizePhoneRecipient(value); } catch { throw new Error(uiText("Isi satu nomor yang valid, contoh 0812… atau 62812…")); } } }]}>
          <Input placeholder={uiText("0812… atau 62812…")} inputMode="tel" autoComplete="tel" maxLength={32} />
        </Form.Item>
        <Form.Item name="type" label={uiText("Tipe pengiriman")} rules={required(uiText)}><Select options={testSendTypes.filter(option => !telegram || (telegramMessageTypes as readonly string[]).includes(option.value)).map(option => ({ ...option, label: uiText(option.label) }))} /></Form.Item>
        {hasMedia && <>
          <Form.Item name="mediaId" label={type === "sticker" ? uiText("File sticker WebP") : uiText("File yang dikirim")} rules={required(uiText)}
            extra={type === "sticker" ? uiText("Pilih WebP yang sudah tersedia atau unggah foto untuk diubah menjadi stiker. Stiker dikirim tanpa caption.") : uiText("File berasal dari File Manager milik pemilik perangkat. Maksimal 25 MB/file.")}>
            <Select showSearch optionFilterProp="label" loading={loadingMedia} placeholder={uiText("Pilih file")} options={options.map(item => ({ value: item.id, label: `${item.name} (${item.mime})` }))} />
          </Form.Item>
          {type === "sticker" && <Space direction="vertical" style={{ marginBottom: 16 }}>
            <StickerPhotoUpload headers={headers} phoneId={phoneId} busy={busy} onBusy={setStickerBusy} onUploaded={asset => {
              setUploadedMedia(previous => [asset, ...previous]);
              form.setFieldValue("mediaId", asset.id);
              setResult(undefined);
            }} />
            <Typography.Text type="secondary">{uiText("JPG, PNG, atau WebP statis, maksimal 25 MB. Hasil 512 × 512, maksimal 100 KB, otomatis dipilih dan disimpan di File Manager. Klik Kirim setelah stiker siap.")}</Typography.Text>
            <StickerPreview id={selectedMediaId} headers={headers} />
          </Space>}
          <Space style={{ marginBottom: 16 }}><Typography.Link href="/dashboard/media" target="_blank" rel="noopener noreferrer">{uiText("Buka File Manager / upload file")}</Typography.Link><Button size="small" loading={loadingMedia} onClick={() => setRefresh(value => value + 1)}>{uiText("Muat ulang file")}</Button></Space>
          {mediaError && <Alert type="warning" message={uiText(mediaError)} style={{ marginBottom: 16 }} />}
          {!loadingMedia && !mediaError && !options.length && <Alert type="info" message={uiText(type === "sticker" ? uiText("Belum ada stiker. Unggah foto melalui tombol di atas untuk membuat stiker.") : uiText("Belum ada file dengan format sesuai. Upload melalui File Manager lalu muat ulang file."))} style={{ marginBottom: 16 }} />}
        </>}
        {hasMessage && <Form.Item label={uiText("Gunakan pesan tersimpan")}><MessageTemplatePicker maxLength={1000} disabled={sending} defaults={recipient ? { nomor: recipient } : {}} onApply={text => { form.setFieldValue("message", text); setResult(undefined); }} /></Form.Item>}
        {hasMessage && <Form.Item name="message" label={needsMessage ? uiText("Pesan test") : "Caption (opsional)"} rules={needsMessage ? requiredText(uiText) : []}>
          <Input.TextArea rows={3} maxLength={1000} showCount />
        </Form.Item>}
        {(type === "button" || type === "list") && <Alert showIcon type="info" message={uiText("Tampilan button/list bergantung pada versi WhatsApp penerima. Periksa hasilnya di HP tujuan.")} style={{ marginBottom: 16 }} />}
        {type === "button" && <Form.List name="buttons" rules={[{ validator: async (_, rows) => { if (!rows?.length || rows.length > 3 || new Set(rows.map((row: any) => row?.id?.trim())).size !== rows.length) throw new Error(uiText("Isi 1–3 tombol dengan ID unik.")); } }]}>
          {(fields, { add, remove }, { errors }) => <>
            {fields.map(field => <Space key={field.key} align="start" wrap>
              <Form.Item name={[field.name, "id"]} label={uiText("ID tombol {{v0}}", { v0: field.name + 1 })} rules={requiredText(uiText)}><Input maxLength={200} /></Form.Item>
              <Form.Item name={[field.name, "text"]} label={uiText("Teks tombol")} rules={requiredText(uiText)}><Input maxLength={200} /></Form.Item>
              <Button onClick={() => remove(field.name)} disabled={sending || fields.length <= 1} style={{ marginTop: 30 }}>{uiText("Hapus")}</Button>
            </Space>)}
            <Button onClick={() => add({ id: `test-${Date.now()}`, text: "" })} disabled={sending || fields.length >= 3}>{uiText("Tambah tombol")}</Button><Form.ErrorList errors={errors} />
          </>}
        </Form.List>}
        {type === "list" && <>
          <Form.Item name="title" label={uiText("Judul daftar")} rules={requiredText(uiText)}><Input maxLength={200} /></Form.Item>
          <Form.Item name="buttonText" label={uiText("Teks tombol pembuka")} rules={requiredText(uiText)}><Input maxLength={200} /></Form.Item>
          <Form.List name="rows" rules={[{ validator: async (_, rows) => { if (!rows?.length || rows.length > 10 || new Set(rows.map((row: any) => row?.id?.trim())).size !== rows.length) throw new Error(uiText("Isi 1–10 pilihan dengan ID unik.")); } }]}>
            {(fields, { add, remove }, { errors }) => <>
              {fields.map(field => <div key={field.key} style={{ padding: 12, border: "1px solid #eee", borderRadius: 8, marginBottom: 12 }}>
                <Space align="start" wrap><Form.Item name={[field.name, "id"]} label={uiText("ID pilihan {{v0}}", { v0: field.name + 1 })} rules={requiredText(uiText)}><Input maxLength={200} /></Form.Item>
                  <Form.Item name={[field.name, "title"]} label={uiText("Judul pilihan")} rules={requiredText(uiText)}><Input maxLength={200} /></Form.Item></Space>
                <Form.Item name={[field.name, "description"]} label={uiText("Deskripsi (opsional)")}><Input maxLength={200} /></Form.Item>
                <Button onClick={() => remove(field.name)} disabled={sending || fields.length <= 1}>{uiText("Hapus pilihan")}</Button>
              </div>)}
              <Button onClick={() => add({ id: `opsi-${Date.now()}`, title: "" })} disabled={sending || fields.length >= 10}>{uiText("Tambah pilihan")}</Button><Form.ErrorList errors={errors} />
            </>}
          </Form.List>
        </>}
        {type === "poll" && <>
          <Form.Item name="pollName" label={uiText("Pertanyaan polling")} rules={requiredText(uiText)}><Input maxLength={200} /></Form.Item>
          <Form.List name="values" rules={[{ validator: async (_, values) => { if (!values || values.length < 2 || values.length > 12 || new Set(values.map((value: string) => value?.trim())).size !== values.length) throw new Error(uiText("Isi 2–12 opsi yang berbeda.")); } }]}>
            {(fields, { add, remove }, { errors }) => <>
              {fields.map(field => <Space key={field.key} align="start"><Form.Item name={field.name} label={uiText("Opsi {{v0}}", { v0: field.name + 1 })} rules={requiredText(uiText)}><Input maxLength={200} /></Form.Item><Button onClick={() => remove(field.name)} disabled={sending || fields.length <= 2} style={{ marginTop: 30 }}>{uiText("Hapus")}</Button></Space>)}
              <div><Button onClick={() => add("")} disabled={sending || fields.length >= 12}>{uiText("Tambah opsi")}</Button></div><Form.ErrorList errors={errors} />
            </>}
          </Form.List>
          <Form.Item name="selectableCount" label={uiText("Jumlah opsi yang boleh dipilih")} dependencies={["values"]} rules={[...required(uiText), { validator: async (_, value) => { if (!Number.isInteger(value) || value < 1 || value > (form.getFieldValue("values") || []).length) throw new Error(uiText("Jumlah harus 1 sampai jumlah opsi polling.")); } }]}><InputNumber min={1} max={12} precision={0} /></Form.Item>
        </>}
        {type === "location" && <>
          <Form.Item name="locationName" label={uiText("Nama lokasi (opsional)")}><Input maxLength={200} /></Form.Item>
          <Space align="start" wrap>
            <Form.Item name="latitude" label={uiText("Latitude")} rules={[...required(uiText), { type: "number", min: -90, max: 90 }]}><InputNumber min={-90} max={90} placeholder="-6.200000" style={{ width: 200 }} /></Form.Item>
            <Form.Item name="longitude" label={uiText("Longitude")} rules={[...required(uiText), { type: "number", min: -180, max: 180 }]}><InputNumber min={-180} max={180} placeholder="106.816666" style={{ width: 200 }} /></Form.Item>
          </Space>
        </>}
        {type === "vcard" && <>
          <Form.Item name="contactName" label={uiText("Nama kontak")} rules={requiredText(uiText)}><Input maxLength={200} /></Form.Item>
          <Form.Item name="contactNumber" label={uiText("Nomor kontak yang dibagikan")} rules={[...required(uiText), { validator: async (_, value) => { if (!value) return; try { normalizePhoneRecipient(value); } catch { throw new Error(uiText("Isi nomor kontak yang valid.")); } } }]}><Input inputMode="tel" placeholder={uiText("0812… atau +62812…")} maxLength={32} /></Form.Item>
        </>}
      </Form>
      {result && <Alert style={{ marginTop: 16 }} showIcon type={result.success ? "success" : "warning"} message={uiText(result.message)} />}
      {result?.queued && <Typography.Paragraph style={{ marginTop: 12 }}><Typography.Link href="/dashboard/dispatch">{uiText("Lihat Antrean Pengiriman")}</Typography.Link></Typography.Paragraph>}
    </Modal>
  );
}
