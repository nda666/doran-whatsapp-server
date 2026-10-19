import { useUiTranslation } from "@/lib/uiTranslation";
import { useState } from "react";
import { Alert, Button, Card, Input, Modal, Space, Table, Tag, Upload, message } from "antd";
import axios from "axios";
import dayjs from "dayjs";
import { useDashboardApi } from "@/lib/useDashboardApi";
export default function RecipientSuppressions() {
  const uiText = useUiTranslation();
  const [page, setPage] = useState(1), [query, setQuery] = useState("");
  const list = useDashboardApi(`/api/suppressions?page=${page}&q=${encodeURIComponent(query)}`);
  const [busy, setBusy] = useState(false), [numbers, setNumbers] = useState(""), [reason, setReason] = useState("");
  const add = async () => {
    setBusy(true);
    try { const result = await axios.post("/api/suppressions", { numbers: numbers.split(/[\n,;]+/).map(n => n.trim()).filter(Boolean), reason }, { headers: list.headers }); message.success(uiText(result.data.message)); setNumbers(""); list.reload(); }
    catch (e: any) { message.error(uiText(e.response?.data?.message || uiText("Daftar blokir gagal diperbarui."))); } finally { setBusy(false); }
  };
  return <Space direction="vertical" style={{ width: "100%" }}>
{list.error && <Alert type="error" message={uiText(list.error)} />}
    <Card title={uiText("Tambah atau impor daftar blokir")}>
      <Space direction="vertical" style={{ width: "100%" }}>
        <Alert type="info" showIcon message={uiText("Daftar blokir berlaku untuk seluruh pengiriman dalam akun Anda. Maksimal 1.000 nomor per impor; satu nomor per baris atau dipisahkan koma.")} />
        <Input.TextArea rows={4} value={numbers} onChange={e => setNumbers(e.target.value)} placeholder={uiText("081234567890 atau +6281234567890")} aria-label={uiText("Nomor yang diblokir")} />
        <Input value={reason} maxLength={255} onChange={e => setReason(e.target.value)} placeholder={uiText("Alasan pemblokiran")} />
        <Space><Button type="primary" loading={busy} disabled={!numbers.trim()} onClick={add}>{uiText("Tambahkan ke daftar blokir")}</Button><Upload accept=".csv,.txt" showUploadList={false} beforeUpload={file => { if (file.size > 100000) { message.error(uiText("Berkas maksimal 100 KB.")); return false; } void file.text().then(setNumbers).catch(() => message.error(uiText("Berkas tidak dapat dibaca."))); return false; }}><Button>{uiText("Impor CSV / TXT")}</Button></Upload></Space>
      </Space>
    </Card>
    <Card title={uiText("Daftar blokir")} extra={<Input.Search placeholder={uiText("Cari nomor")} onSearch={q => { setQuery(q); setPage(1); }} />}>
      <Table rowKey="id" dataSource={list.data?.data || []} pagination={{ current: page, pageSize: 50, total: list.data?.total || 0, onChange: setPage, showSizeChanger: false }} columns={[
        { title: uiText("Nomor"), dataIndex: "number" }, { title: uiText("Sumber"), dataIndex: "source", render: v => <Tag>{v === "MANUAL" ? uiText("Admin") : v === "IMPORT" ? uiText("Impor") : uiText("Balasan STOP")}</Tag> },
        { title: uiText("Alasan"), dataIndex: "reason" }, { title: uiText("Diblokir pada"), dataIndex: "createdAt", render: v => dayjs(v).format("DD/MM/YYYY HH:mm") },
        { title: uiText("Tindakan"), render: (_, row: any) => <Button danger onClick={() => Modal.confirm({ title: uiText("Penerima sudah memberikan persetujuan baru?"), content: uiText("Hapus blokir hanya setelah penerima menyetujui untuk menerima pesan kembali. Pesan yang sebelumnya diblokir tidak dikirim ulang otomatis."), okText: uiText("Ya, hapus blokir"), cancelText: uiText("Batal"), onOk: async () => { try { await axios.delete("/api/suppressions", { headers: list.headers, data: { id: row.id, consentConfirmed: true } }); list.reload(); } catch { message.error(uiText("Blokir gagal dihapus.")); throw new Error(uiText("Hapus gagal")); } } })}>{uiText("Hapus blokir")}</Button> },
      ]} scroll={{ x: true }} />
    </Card>
  </Space>;
}
