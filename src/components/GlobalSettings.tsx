import { useUiTranslation, type UiTranslator } from "@/lib/uiTranslation";
import { DEVICE_DAILY_QUOTA_KEY } from "@/lib/deviceQuota";
import { DEFAULT_WARMUP_DAILY_LIMITS, WARMUP_DAILY_LIMITS_KEY, WARMUP_LIMITS_ERROR, parseWarmupDailyLimits } from "@/lib/warmupSettings";
import { useState } from "react";
import { DEFAULT_QUOTA_RESET, QUOTA_RESET_KEY, parseQuotaReset, type QuotaReset } from "@/lib/quotaReset";
import { Alert, Button, Checkbox, Form, Input, InputNumber, Modal, Popover, Radio, Select, Space, Table, message } from "antd";
import { EditOutlined, InfoCircleOutlined, PlusOutlined } from "@ant-design/icons";
import axios from "axios";
import { EMAIL_FROM_KEY } from "@/lib/emailSettings";
import { useDashboardApi } from "@/lib/useDashboardApi";
import { DISPATCH_MAX_AGE_DAYS_KEY, MAX_DISPATCH_MAX_AGE_DAYS } from "@/lib/dispatchSettings";
import { DISPATCH_QUEUE_ORDER_KEY, DISPATCH_QUEUE_ORDER_OPTIONS } from "@/lib/dispatchSettings";
import { DISPATCH_DELAY_KEY, DEFAULT_DISPATCH_DELAY, MAX_DISPATCH_DELAY_SECONDS, parseDispatchDelayRange } from "@/lib/dispatchSettings";

import { DEFAULT_PHONE_FORM_FIELDS, PHONE_FORM_FIELDS, PHONE_FORM_FIELDS_KEY, parsePhoneFormFields } from "@/lib/phoneFormFields";

import styles from "@/styles/GlobalSettings.module.css";
import OperatingHoursFields from "./OperatingHoursFields";
import { DEFAULT_OPERATING_HOURS, OPERATING_HOURS_KEY, operatingHoursLabel, parseOperatingHours, type OperatingHours } from "@/lib/operatingHours";

const fieldDescriptions = (uiText: UiTranslator): Record<string, string> => ({
  saveIncomingMessages: uiText("Penyimpanan pesan di menu Percakapan."),
  autoReplyEnabled: uiText("Pengaturan balasan pesan otomatis."),
  readReceipt: uiText("Penanda pesan masuk sudah dibaca."),
  rejectCall: uiText("Penolakan panggilan WhatsApp masuk."),
  showOnline: uiText("Status online perangkat WhatsApp."),
  showTyping: uiText("Indikator mengetik saat mengirim pesan."),
});

type Setting = { id: string; label: string; key: string; value: string; secret: boolean };
type Values = { label: string; key?: string; value: string; minSeconds?: number; maxSeconds?: number; visibleFields?: string[]; operatingHours?: OperatingHours; quotaReset?: QuotaReset };
const generalHelp = (uiText: UiTranslator) => (uiText("Pengaturan global berlaku untuk seluruh aplikasi. Key dibuat sebagai slug dan tidak dapat diubah setelah disimpan."));
const settingHelp = (uiText: UiTranslator): Record<string, string> => ({
  [QUOTA_RESET_KEY]: uiText("Default: reset setiap pukul 00.00 WIB. Pada pilihan setelah kuota terpenuhi, jika sisa waktu menuju 00.00 WIB lebih dari 7 jam, reset pada 00.00 WIB. Jika 7 jam atau kurang, reset setelah durasi jeda yang diatur. Perbandingan dihitung saat kuota terpenuhi. Pengaturan khusus nomor dan jam operasional tetap berlaku."),
  [OPERATING_HOURS_KEY]: uiText("Jam pengiriman setiap hari dalam WIB. Nomor mengikuti jadwal global kecuali memiliki jadwal khusus. Jadwal khusus menggantikan jadwal global untuk nomor tersebut. Di luar jadwal, pesan antrean menunggu tanpa mengonsumsi percobaan atau kuota. Batas usia antrean tetap berlaku. Perubahan terbaca pada pemeriksaan berikutnya tanpa restart."),
  [WARMUP_DAILY_LIMITS_KEY]: uiText("Batas percobaan per hari untuk setiap tahap pemanasan, dipisahkan koma. Contoh: 25,50,100,200,350,500. Setiap tahap berlangsung dua hari, lalu mengikuti kuota perangkat. Kuota perangkat tetap menjadi batas maksimum. Perubahan berlaku pada pengiriman berikutnya tanpa mengulang tanggal mulai pemanasan."),
  [DEVICE_DAILY_QUOTA_KEY]: uiText("Kuota percobaan pengiriman per nomor per hari (WIB). Berlaku untuk nomor yang mengikuti kuota global. Nomor custom memakai batasnya sendiri; batas pemanasan tetap berlaku. Perubahan berlaku pada pengiriman berikutnya tanpa restart."),
  [EMAIL_FROM_KEY]: uiText("Alamat pengirim untuk seluruh email aplikasi, termasuk reset password, notifikasi admin, dan proses lain yang memerlukan pengiriman email. Gunakan alamat atau domain pengirim yang sudah diverifikasi pada server Postmark. Perubahan berlaku untuk pengiriman berikutnya tanpa restart."),
  [PHONE_FORM_FIELDS_KEY]: uiText("Centang input yang ingin ditampilkan pada form tambah dan edit perangkat untuk semua pengguna. Mengosongkan pilihan menyembunyikan keenam input. Nilai pengaturan perangkat yang sudah tersimpan tidak berubah; perangkat baru menggunakan nilai default. Perubahan berlaku saat form dibuka kembali."),
  [DISPATCH_DELAY_KEY]: uiText("Isi Mulai dan Hingga dalam detik. Rentang yang sama digunakan untuk pemeriksaan antrean dan jeda tiap perangkat, dengan angka acak terpisah. Perubahan berlaku pada proses berikutnya tanpa restart. Campaign dapat memakai jeda yang lebih panjang; perangkat offline tetap diperiksa dengan jeda 30 detik."),
  [DISPATCH_QUEUE_ORDER_KEY]: uiText("Pilih Data terlama dahulu atau Data terbaru dahulu berdasarkan waktu masuk antrean. Berlaku untuk semua perangkat, API, dan campaign, pada pesan berikutnya tanpa restart. Pesan yang sudah diproses tetap dilanjutkan. Jadwal, jeda, dan batas usia tetap berlaku. Pada pilihan terbaru, pesan lama dapat menunggu lebih lama jika pesan baru terus masuk."),
  [DISPATCH_MAX_AGE_DAYS_KEY]: uiText("Batas data yang boleh dikirim dan rentang data pengiriman pada dashboard, diagram, antrean, campaign, laporan, dan export CSV dihitung sejak masuk antrean (1 hari = 24 jam). Berlaku untuk seluruh perangkat, API, dan campaign, termasuk antrean yang masih menunggu, tanpa restart. Data yang melewati batas ditandai gagal dan tidak dikirim; data yang sudah gagal tidak otomatis diantrekan ulang. Untuk campaign terjadwal, pastikan batas hari mencakup waktu menunggu jadwal."),
  "postmark-server-token": uiText("Token server Postmark untuk seluruh pengiriman email aplikasi, termasuk reset password, notifikasi admin, dan proses lain yang memerlukan email. Gunakan Server API Token dari server Postmark yang digunakan aplikasi. Nilai token disimpan terenkripsi; ganti melalui Edit setting."),
});
function SettingInfo({ label, help }: { label: string; help: string }) {
  const uiText = useUiTranslation();
  return <Popover title={label} content={<div style={{ width: 360, maxWidth: "calc(100vw - 48px)", whiteSpace: "normal", overflowWrap: "anywhere" }}>{help}</div>} trigger={["hover", "focus", "click"]}>
    <Button type="text" size="small" icon={<InfoCircleOutlined />} aria-label={uiText("Informasi {{v0}}", { v0: label })} style={{ color: "#1677ff", width: 24, minWidth: 24, height: 24, padding: 0 }} />
  </Popover>;
}
export default function GlobalSettings() {
  const uiText = useUiTranslation();
  const api = useDashboardApi("/api/admin/global-settings");
  const [form] = Form.useForm<Values>();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Setting>();
  const [busy, setBusy] = useState(false);
  const selectedFields = Form.useWatch("visibleFields", form) || [];
  const formKey = Form.useWatch("key", form);
  const warmupSetting = (editing?.key || formKey) === WARMUP_DAILY_LIMITS_KEY;
  const quotaSetting = (editing?.key || formKey) === DEVICE_DAILY_QUOTA_KEY;
  const ageSetting = (editing?.key || formKey) === DISPATCH_MAX_AGE_DAYS_KEY;
  const orderSetting = (editing?.key || formKey) === DISPATCH_QUEUE_ORDER_KEY;
  const fieldsSetting = (editing?.key || formKey) === PHONE_FORM_FIELDS_KEY;
  const delaySetting = (editing?.key || formKey) === DISPATCH_DELAY_KEY;
  const senderSetting = (editing?.key || formKey) === EMAIL_FROM_KEY;
  const hoursSetting = (editing?.key || formKey) === OPERATING_HOURS_KEY;
  const resetSetting = (editing?.key || formKey) === QUOTA_RESET_KEY;
  const resetMode = Form.useWatch(["quotaReset", "mode"], form);
  const show = (setting?: Setting) => {
    setEditing(setting); form.resetFields();
    form.setFieldValue("quotaReset", setting?.key === QUOTA_RESET_KEY ? parseQuotaReset(setting.value) || DEFAULT_QUOTA_RESET : DEFAULT_QUOTA_RESET);
    const range = setting?.key === DISPATCH_DELAY_KEY ? parseDispatchDelayRange(setting.value) || DEFAULT_DISPATCH_DELAY : DEFAULT_DISPATCH_DELAY;
    form.setFieldsValue({ ...(setting || { label: "", key: "", value: "" }), ...range, operatingHours: setting?.key === OPERATING_HOURS_KEY ? parseOperatingHours(setting.value) || DEFAULT_OPERATING_HOURS : DEFAULT_OPERATING_HOURS, visibleFields: setting?.key === PHONE_FORM_FIELDS_KEY ? parsePhoneFormFields(setting.value) || DEFAULT_PHONE_FORM_FIELDS : DEFAULT_PHONE_FORM_FIELDS }); setOpen(true);
  };
  const save = async (values: Values) => {
    setBusy(true);
    try {
      const data = { label: values.label, value: resetSetting ? JSON.stringify(values.quotaReset) : hoursSetting ? JSON.stringify(values.operatingHours) : fieldsSetting ? JSON.stringify(values.visibleFields || []) : delaySetting ? JSON.stringify({ minSeconds: values.minSeconds, maxSeconds: values.maxSeconds }) : String(values.value), ...(editing ? { id: editing.id } : { key: values.key || "" }) };
      await axios({ method: editing ? "PATCH" : "POST", url: "/api/admin/global-settings", data, headers: api.headers, timeout: 15000 });
      message.success(uiText("Setting berhasil disimpan.")); setOpen(false); api.reload();
    } catch (error: unknown) {
      message.error(uiText(axios.isAxiosError(error) ? error.response?.data?.message || uiText("Setting belum tersimpan.") : uiText("Setting belum tersimpan.")));
    } finally { setBusy(false); }
  };
  return <Space direction="vertical" size="middle" style={{ width: "100%" }}>
    {api.error && <Alert type="error" message={uiText(api.error)} action={<Button onClick={api.reload}>{uiText("Coba lagi")}</Button>} />}
    <Space size={8}><Button type="primary" icon={<PlusOutlined />} onClick={() => show()}>{uiText("Tambah setting")}</Button><SettingInfo label={uiText("Pengaturan global")} help={generalHelp(uiText)} /></Space>
    <Table<Setting> rowKey="id" loading={!api.data && !api.error} dataSource={api.data || []} scroll={{ x: 720 }} pagination={{ pageSize: 10, showSizeChanger: true }} columns={[
      { title: uiText("Label"), dataIndex: "label", render: (label: string, row) => <Space size={4}><span>{label}</span><SettingInfo label={label} help={settingHelp(uiText)[row.key] || generalHelp(uiText)} /></Space> },
      { title: uiText("Key"), dataIndex: "key", render: (value: string) => <code>{value}</code> },
      { title: uiText("Value"), dataIndex: "value", width: 320, render: (value: string, row) => row.secret
        ? <Input.Password readOnly value={value} autoComplete="off" aria-label={uiText("Value {{v0}}", { v0: row.label })} />
        : <div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", maxHeight: 100, overflow: "auto" }}>{row.key === QUOTA_RESET_KEY ? (() => { const reset = parseQuotaReset(value); return reset ? reset.mode === "midnight" ? uiText("Pukul 00.00 WIB (default)") : uiText("00.00 WIB / jeda {{v0}} jam (batas 7 jam)", { v0: reset.hours }) : value; })() : row.key === OPERATING_HOURS_KEY ? (() => { const hours = parseOperatingHours(value); return hours ? operatingHoursLabel(hours) : value; })() : row.key === PHONE_FORM_FIELDS_KEY ? (() => { const fields = parsePhoneFormFields(value); return fields ? fields.length ? PHONE_FORM_FIELDS.filter(field => fields.includes(field.value)).map(field => uiText(field.label)).join(", ") : uiText("Semua input tambahan disembunyikan") : value; })() : row.key === DISPATCH_DELAY_KEY ? (() => { const range = parseDispatchDelayRange(value); return range ? uiText("{{v0}}–{{v1}} detik", { v0: range.minSeconds, v1: range.maxSeconds }) : value; })() : row.key === DISPATCH_QUEUE_ORDER_KEY ? uiText(DISPATCH_QUEUE_ORDER_OPTIONS.find(option => option.value === value)?.label || value) : value}</div> },
      { title: uiText("Aksi"), width: 90, render: (_, row) => <Button icon={<EditOutlined />} onClick={() => show(row)} aria-label={uiText("Edit setting {{v0}}", { v0: row.label })}>{uiText("Edit")}</Button> },
    ]} />
    <Modal centered={fieldsSetting || hoursSetting || resetSetting} width={fieldsSetting ? 680 : hoursSetting ? 600 : resetSetting ? 560 : 520} title={resetSetting ? uiText("Reset kuota pengiriman") : hoursSetting ? uiText("Jam operasional pengiriman") : fieldsSetting ? uiText("Tampilan form perangkat") : editing ? uiText("Edit setting") : uiText("Tambah setting")} open={open} onCancel={() => !busy && setOpen(false)} footer={fieldsSetting || hoursSetting || resetSetting ? <div className={styles.footer}>
      <Button disabled={busy} onClick={() => setOpen(false)}>{uiText("Batal")}</Button>
      <Button type="primary" htmlType="submit" form="global-setting-form" loading={busy}>{uiText("Simpan perubahan")}</Button>
    </div> : null} destroyOnHidden>
      <Form id="global-setting-form" className={resetSetting ? styles.resetBody : fieldsSetting ? styles.visibilityBody : hoursSetting ? styles.hoursBody : undefined} form={form} layout="vertical" disabled={busy} onFinish={save} requiredMark={false}>
        <Form.Item hidden={(fieldsSetting || hoursSetting || resetSetting) && !!editing} name="label" label={uiText("Label")} rules={[{ required: true, whitespace: true, message: uiText("Label wajib diisi.") }, { max: 200 }]}><Input maxLength={200} /></Form.Item>
        <Form.Item hidden={(fieldsSetting || hoursSetting || resetSetting) && !!editing} name="key" label={uiText("Key")} extra={editing ? uiText("Key tidak dapat diubah setelah dibuat.") : uiText("Opsional. Jika kosong, key dibuat dari label. Contoh: Postmark Server Token → postmark-server-token.")}><Input disabled={!!editing || busy} maxLength={200} placeholder={uiText("Otomatis dari label")} /></Form.Item>
        {resetSetting ? <>
          <p className={styles.resetIntro}>{uiText("Pilih kapan kuota pengiriman kembali tersedia. Nomor dengan pengaturan khusus mengikuti pilihannya sendiri.")}</p>
          <Form.Item name={["quotaReset", "mode"]} className={styles.resetChoiceField} rules={[{ required: true }]}>
            <Radio.Group className={styles.resetChoices} aria-label={uiText("Waktu reset kuota")}>
              <Radio value="midnight">
                <span className={styles.resetChoiceTitle}>{uiText("Setiap tengah malam")}<span className={styles.resetDefault}>{uiText("Default")}</span></span>
                <span className={styles.resetChoiceDescription}>{uiText("Kuota kembali penuh setiap pukul 00.00 WIB.")}</span>
              </Radio>
              <Radio value="after-full">
                <span className={styles.resetChoiceTitle}>{uiText("Setelah kuota terpenuhi")}</span>
                <span className={styles.resetChoiceDescription}>{uiText("Reset pukul 00.00 WIB atau gunakan durasi jeda di bawah.")}</span>
              </Radio>
            </Radio.Group>
          </Form.Item>
          <div className={styles.resetDuration} hidden={resetMode !== "after-full"}>
            <Form.Item name={["quotaReset", "hours"]} label={uiText("Durasi jeda")} extra={uiText("1–168 jam. Dipakai jika sisa waktu menuju 00.00 WIB maksimal 7 jam.")} rules={[{ required: true }, { type: "integer", min: 1, max: 168 }]}><InputNumber min={1} max={168} precision={0} addonAfter={uiText("jam")} style={{ width: "100%" }} /></Form.Item>
          </div>
          <div className={styles.resetNote}><InfoCircleOutlined /><span>{resetMode === "after-full" ? uiText("Saat kuota penuh: lebih dari 7 jam menuju 00.00 WIB → reset pukul 00.00. Jika 7 jam atau kurang → gunakan durasi jeda. Pengiriman tetap mengikuti jam operasional.") : uiText("Reset berlaku setiap hari, termasuk saat kuota belum habis.")}</span></div>
        </> : hoursSetting ? <><OperatingHoursFields name="operatingHours" stackedToggle /><Alert className={styles.hoursInfo} type="info" showIcon message={uiText("Nomor tanpa jadwal khusus mengikuti jam global ini.")} description={uiText("Di luar jadwal, pesan tetap mengantre tanpa memakai percobaan atau kuota. Batas usia antrean tetap berlaku.")} /></> : fieldsSetting ? <>
          <p className={styles.intro}>{uiText("Pilih input yang muncul saat menambah atau mengedit perangkat. Berlaku untuk semua pengguna.")}</p>
          <div className={styles.selectionHeading}>
            <div className={styles.selectionTitle}>{uiText("Input yang ditampilkan")}<span className={styles.count}>{selectedFields.length}  {uiText("dari")} {PHONE_FORM_FIELDS.length}</span></div>
            <Space size={0}>
              <Button type="link" size="small" onClick={() => form.setFieldValue("visibleFields", [...DEFAULT_PHONE_FORM_FIELDS])}>{uiText("Pilih semua")}</Button>
              <Button type="link" size="small" onClick={() => form.setFieldValue("visibleFields", [])}>{uiText("Sembunyikan semua")}</Button>
            </Space>
          </div>
          <Form.Item name="visibleFields" style={{ marginBottom: 0 }}>
            <Checkbox.Group className={styles.choices} aria-label={uiText("Input yang ditampilkan")}>
              {PHONE_FORM_FIELDS.map(field => <Checkbox key={field.value} value={field.value}>
                <span className={styles.choiceTitle}>{uiText(field.label)}</span>
                <span className={styles.choiceDescription}>{fieldDescriptions(uiText)[field.value]}</span>
              </Checkbox>)}
            </Checkbox.Group>
          </Form.Item>
          <div className={styles.note}><InfoCircleOutlined /><span>{uiText("Pengaturan ini hanya mengatur tampilan input. Nilai perangkat tetap tersimpan. Perubahan terlihat saat form dibuka kembali.")}</span></div>
        </> : delaySetting ? <>
          <Form.Item name="minSeconds" label={uiText("Mulai (detik)")} rules={[{ required: true, message: uiText("Isi jeda minimum.") }, { type: "number", min: 1, max: MAX_DISPATCH_DELAY_SECONDS }]}><InputNumber min={1} max={MAX_DISPATCH_DELAY_SECONDS} precision={0} style={{ width: "100%" }} /></Form.Item>
          <Form.Item name="maxSeconds" label={uiText("Hingga (detik)")} dependencies={["minSeconds"]} extra={uiText("1–30 detik. Hingga harus sama atau lebih besar dari Mulai.")} rules={[{ required: true, message: uiText("Isi jeda maksimum.") }, { type: "number", min: 1, max: MAX_DISPATCH_DELAY_SECONDS }, ({ getFieldValue }) => ({ validator(_, value) { return value == null || value >= getFieldValue("minSeconds") ? Promise.resolve() : Promise.reject(new Error(uiText("Hingga harus sama atau lebih besar dari Mulai."))); } })]}><InputNumber min={1} max={MAX_DISPATCH_DELAY_SECONDS} precision={0} style={{ width: "100%" }} /></Form.Item>
        </> : <Form.Item name="value" label={warmupSetting ? uiText("Batas percobaan pemanasan per hari") : quotaSetting ? uiText("Kuota per nomor per hari") : senderSetting ? uiText("Email pengirim") : orderSetting ? uiText("Urutan pengiriman") : ageSetting ? uiText("Maksimal usia data (hari)") : "Value"} extra={warmupSetting ? settingHelp(uiText)[WARMUP_DAILY_LIMITS_KEY] : quotaSetting ? settingHelp(uiText)[DEVICE_DAILY_QUOTA_KEY] : senderSetting ? settingHelp(uiText)[EMAIL_FROM_KEY] : orderSetting ? uiText("Berdasarkan waktu masuk antrean. Berlaku pada pemilihan pesan berikutnya tanpa restart.") : ageSetting ? uiText("Masukkan bilangan bulat 1–3650 hari. Batas berlaku untuk data yang masih menunggu.") : uiText("Disimpan sebagai teks. Karakter kontrol dibersihkan; HTML tidak dijalankan.")} rules={warmupSetting ? [{ validator: (_, value) => typeof value === "string" && parseWarmupDailyLimits(value) ? Promise.resolve() : Promise.reject(new Error(uiText(WARMUP_LIMITS_ERROR))) }] : quotaSetting ? [{ required: true, message: uiText("Kuota wajib diisi.") }, { validator: (_, value) => /^\d+$/.test(String(value)) && Number(value) >= 1 && Number(value) <= 100000 ? Promise.resolve() : Promise.reject(new Error(uiText("Masukkan bilangan bulat 1–100000."))) }] : senderSetting ? [{ required: true, message: uiText("Email pengirim wajib diisi.") }, { type: "email", message: uiText("Masukkan alamat email yang valid.") }, { max: 254 }] : orderSetting ? [{ required: true, message: uiText("Pilih urutan pengiriman.") }] : ageSetting ? [{ required: true, message: uiText("Jumlah hari wajib diisi.") }] : [{ required: true, message: uiText("Value wajib diisi.") }, { max: 16000 }]}>
          {warmupSetting ? <Input placeholder={DEFAULT_WARMUP_DAILY_LIMITS.join(",")} maxLength={16000} /> : quotaSetting ? <InputNumber min={1} max={100000} precision={0} style={{ width: "100%" }} /> : senderSetting ? <Input type="email" maxLength={254} placeholder={uiText("wa@dorandev.com")} /> : orderSetting ? <Select options={DISPATCH_QUEUE_ORDER_OPTIONS.map(option => ({ ...option, label: uiText(option.label) }))} /> : ageSetting ? <InputNumber min={1} max={MAX_DISPATCH_MAX_AGE_DAYS} precision={0} stringMode style={{ width: "100%" }} /> : editing?.secret ? <Input.Password autoComplete="new-password" maxLength={16000} /> : <Input.TextArea autoSize={{ minRows: 3, maxRows: 10 }} maxLength={16000} />}
        </Form.Item>}
        {!fieldsSetting && !hoursSetting && !resetSetting && <Button type="primary" htmlType="submit" loading={busy}>{uiText("Simpan setting")}</Button>}
      </Form>
    </Modal>
  </Space>;
}
