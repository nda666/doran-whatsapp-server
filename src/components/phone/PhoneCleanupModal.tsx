import { useUiTranslation } from "@/lib/uiTranslation";
import { useRef, useState } from "react";
import { Alert, Checkbox, Modal, Space, Typography } from "antd";
import type { Phone } from "@prisma/client";
import { cleanupLabels, defaultCleanupOptions, PhoneCleanupOptions } from "@/lib/phoneCleanup";

export default function PhoneCleanupModal({ phone, onCancel, onSubmit }: {
  phone: Phone; onCancel: () => void; onSubmit: (options: PhoneCleanupOptions) => Promise<void>;
}) {
  const uiText = useUiTranslation();
  const [options, setOptions] = useState({ ...defaultCleanupOptions });
  const [loading, setLoading] = useState(false);
  const submitting = useRef(false);
  const [modal, contextHolder] = Modal.useModal();
  const keys = Object.keys(cleanupLabels) as (keyof PhoneCleanupOptions)[];
  const change = (key: keyof PhoneCleanupOptions, checked: boolean) => {
    const next = { ...options, [key]: checked };
    if (key === "clearAuth" && checked) next.disconnect = true;
    if (key === "deleteRecord" && checked) { next.disconnect = true; next.clearAuth = true; next.clearAutoReplies = true; next.resetToken = true; }
    setOptions(next);
  };
  const confirm = () => {
    if (submitting.current) return;
    const selected = { ...options };
    modal.confirm({
      title: uiText("{{v0}} perangkat {{v1}}?", { v0: selected.deleteRecord ? uiText("Hapus") : uiText("Bersihkan/reset"), v1: phone.name }),
      okText: uiText("Ya, jalankan"), cancelText: uiText("Kembali"), okButtonProps: { danger: true },
      content: <Space direction="vertical">
        <span>{uiText("Tindakan berikut akan dijalankan. Data yang dihapus tidak dapat dikembalikan.")}</span>
        <ul>{keys.filter(key => selected[key]).map(key => <li key={key}>{uiText(cleanupLabels[key])}</li>)}</ul>
        <span>{selected.deleteRecord ? uiText("Entri perangkat akan hilang dari dashboard.") : uiText("Entri perangkat tetap ada di dashboard.")}</span>
        {selected.resetToken && <span>{selected.deleteRecord ? uiText("Token API ikut dihapus bersama entri perangkat.") : uiText("Token API lama akan diganti dan langsung tidak berlaku. Perbarui integrasi API Anda setelah selesai.")}</span>}
        {!selected.resetToken && !selected.deleteRecord && <span>{uiText("Token API saat ini tetap dipertahankan.")}</span>}
      </Space>,
      onOk: async () => {
        if (submitting.current) return;
        submitting.current = true; setLoading(true);
        try { await onSubmit(selected); }
        finally { submitting.current = false; setLoading(false); }
      },
    });
  };
  const fullReset = keys.filter(key => key !== "deleteRecord").every(key => options[key]) && !options.deleteRecord;
  return <>
    {contextHolder}
    <Modal open title={uiText("Hapus / reset perangkat: {{v0}}", { v0: phone.name })} onCancel={onCancel} closable={!loading}
      maskClosable={false} keyboard={!loading} onOk={confirm} okText={uiText("Lanjutkan")} cancelText={uiText("Batal")}
      confirmLoading={loading} cancelButtonProps={{ disabled: loading }} okButtonProps={{ danger: true, disabled: !Object.values(options).some(Boolean) }}>
      <Space direction="vertical" style={{ width: "100%" }} size="middle">
        <Alert type="info" showIcon message={uiText("Pilih data perangkat yang ingin dibersihkan di Jeblast.")}
          description={uiText("Chat, kontak, foto, dan file di HP tetap ada. Riwayat yang dibersihkan adalah pengiriman perangkat di Jeblast. Saat koneksi aktif, penghapusan autentikasi juga melakukan logout WhatsApp; jika offline, periksa perangkat tertaut di HP.")} />
        <fieldset style={{ margin: 0, padding: "8px 14px 14px", border: "1px solid #d9d9d9", borderRadius: 8 }}>
          <legend style={{ width: "auto", margin: 0, padding: "0 6px", fontSize: 14, fontWeight: 600 }}>{uiText("Pilihan cepat")}</legend>
          <Space direction="vertical" size={8} style={{ width: "100%" }}>
            <Checkbox disabled={loading} checked={keys.every(key => options[key])} indeterminate={keys.some(key => options[key]) && !keys.every(key => options[key])}
          onChange={e => setOptions(Object.fromEntries(keys.map(key => [key, e.target.checked])) as PhoneCleanupOptions)}>{uiText("Pilih semua")}</Checkbox>
            <Checkbox disabled={loading} checked={fullReset}
          onChange={e => setOptions(Object.fromEntries(keys.map(key => [key, key !== "deleteRecord" && e.target.checked])) as PhoneCleanupOptions)}>
          {uiText("Reset seperti perangkat baru")}</Checkbox>
          </Space>
        </fieldset>
        <section aria-label={uiText("Tindakan perangkat")} style={{ borderTop: "1px solid #d9d9d9", paddingTop: 14 }}>
          <div style={{ fontWeight: 600, marginBottom: 12 }}>{uiText("Tindakan perangkat")}</div>
          <Space direction="vertical" size="middle" style={{ width: "100%" }}>
        {keys.map(key => <div key={key}><Checkbox checked={options[key]}
          disabled={loading || (options.deleteRecord && ["disconnect", "clearAuth", "clearAutoReplies", "resetToken"].includes(key)) || (key === "disconnect" && options.clearAuth)}
          onChange={e => change(key, e.target.checked)}>{uiText(cleanupLabels[key])}</Checkbox>
          {key === "resetSettings" && <Typography.Paragraph type="secondary" style={{ margin: "4px 0 0 24px", fontSize: 12 }}>
            {uiText("Webhook dikosongkan. Save Group, Simpan Pesan Masuk, tanda dibaca, tolak panggilan, indikator mengetik, dan auto-reply dinonaktifkan; tampil online diaktifkan. Token, sesi, file autentikasi, kontak, riwayat, dan aturan auto-reply mengikuti checkbox masing-masing.")}</Typography.Paragraph>}
        </div>)}
          </Space>
        </section>
        {options.deleteRecord && <Alert type="warning" showIcon message={uiText("Hapus entri juga wajib membersihkan koneksi, autentikasi, auto-reply, dan token API terkait.")} />}
        {options.disconnect && !options.clearAuth && !options.deleteRecord && <Alert type="info" showIcon
          message={uiText("Perangkat akan dinonaktifkan. Autentikasi disimpan agar dapat diaktifkan kembali tanpa scan QR.")} />}
        {fullReset && <Alert type="success" showIcon message={uiText("Perangkat akan siap scan QR ulang")}
          description={uiText("ID, nama, dan pemilik perangkat dipertahankan. Token diganti, pengaturan kembali ke nilai awal, dan WhatsApp perlu scan QR lagi.")} />}
      </Space>
    </Modal>
  </>;
}
