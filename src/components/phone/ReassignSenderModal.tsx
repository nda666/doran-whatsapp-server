import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { Alert, Modal, Select, Space, Typography } from "antd";
import type { Phone } from "@prisma/client";
import { useUiTranslation } from "@/lib/uiTranslation";

type Preview = { count: number; options: { id: string; name: string; number: string | null; remaining: number; limit: number }[] };
export default function ReassignSenderModal({ phone, token, onClose, onSaved }: {
  phone: Phone; token?: string; onClose: () => void; onSaved: (count: number) => void;
}) {
  const uiText = useUiTranslation();
  const [preview, setPreview] = useState<Preview>();
  const [target, setTarget] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const busy = useRef(false);
  const endpoint = `/api/phones/${phone.id}/reassign-sender`;
  useEffect(() => {
    const controller = new AbortController();
    axios.get<Preview>(endpoint, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal })
      .then(response => { if (!controller.signal.aborted) setPreview(response.data); })
      .catch(e => { if (!controller.signal.aborted) setError(e.response?.data?.message || "Daftar nomor belum dapat dimuat. Tutup lalu buka kembali."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [endpoint, token]);
  const save = async () => {
    if (!target || busy.current) return;
    busy.current = true;
    setSaving(true); setError(undefined);
    try {
      const response = await axios.post<{ count: number }>(endpoint, { targetPhoneId: target }, { headers: { Authorization: `Bearer ${token}` } });
      onSaved(response.data.count);
    } catch (e: any) {
      setError(e.response?.data?.message || "Hasil pengalihan belum dapat dipastikan. Tutup dan muat ulang sebelum mencoba kembali.");
    } finally { busy.current = false; setSaving(false); }
  };
  return <Modal open title={uiText("Ubah nomor pengiriman")} onCancel={onClose} onOk={save}
    okText={uiText("Simpan")} cancelText={uiText("Batal")} confirmLoading={saving} closable={!saving} maskClosable={!saving} keyboard={!saving}
    cancelButtonProps={{ disabled: saving }} okButtonProps={{ disabled: loading || !target || !preview?.count }}>
    <Space direction="vertical" style={{ width: "100%" }} size="middle">
      <Typography.Text>{phone.name} · {phone.number || "—"}</Typography.Text>
      {error && <Alert type="error" showIcon message={uiText(error)} />}
      <Typography.Text>{loading ? uiText("Memuat antrean dan nomor pengganti…") : uiText("{{v0}} pesan menunggu koneksi, tertahan karena pembatasan WhatsApp, atau menunggu kuota tersedia dapat dialihkan, termasuk antrean hari sebelumnya.", { v0: preview?.count || 0 })}</Typography.Text>
      <Select style={{ width: "100%" }} showSearch optionFilterProp="label" loading={loading} disabled={loading || saving}
        aria-label={uiText("Nomor pengganti")} placeholder={uiText("Pilih nomor pengganti")} value={target} onChange={setTarget}
        notFoundContent={uiText("Tidak ada nomor sehat dengan kuota tersedia.")}
        options={preview?.options.map(p => ({ value: p.id, label: `${p.name} · ${p.number || "—"} · ${uiText("Sisa kuota")}: ${p.remaining}` }))} />
      <Alert type="info" showIcon message={uiText("Pesan tetap mengikuti seluruh aturan pengiriman nomor pengganti.")}
        description={uiText("Termasuk kuota, kesehatan, pemanasan, jam operasional, jeda, urutan antrean, dan batas usia pesan. Nomor ini dipakai untuk antrean yang dialihkan; pengiriman baru tetap memakai pengaturan asal.")} />
    </Space>
  </Modal>;
}
