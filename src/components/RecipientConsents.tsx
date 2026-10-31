import { useState } from "react";
import { Alert, Button, Card, Checkbox, Form, Input, Modal, Select, Space, Table, Tag, message } from "antd";
import axios from "axios";
import { useDashboardApi } from "@/lib/useDashboardApi";

export default function RecipientConsents() {
  const [q, setQ] = useState(""), [page, setPage] = useState(1), [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
  const api = useDashboardApi<{ data: any[]; total: number }>(`/api/recipient-consents?page=${page}&q=${encodeURIComponent(q)}`);
  const [form] = Form.useForm();
  const save = async (values: any) => {
    setBusy(true);
    try {
      const grantedAt = new Date(values.grantedAt).toISOString();
      await axios.post("/api/recipient-consents", { ...values, grantedAt }, { headers: api.headers });
      message.success("Bukti izin disimpan."); setOpen(false); form.resetFields(); api.reload();
    } catch (error: any) { message.error(error.response?.data?.message || "Periksa waktu dan bukti izin."); }
    finally { setBusy(false); }
  };
  return <Card title="Izin penerima" extra={<Button onClick={() => setOpen(true)}>Catat izin</Button>}>
    <Space direction="vertical" style={{ width: "100%" }}>
      <Alert type="info" showIcon message="Catat izin yang benar-benar diberikan pelanggan sesuai kategori pesan. Riwayat kirim, scan QR, dan pemanasan nomor bukan bukti izin atau jaminan bebas pembatasan." />
      {api.error && <Alert type="error" message={api.error} />}
      <Input.Search placeholder="Cari nomor penerima" onSearch={value => { setQ(value); setPage(1); }} allowClear />
      <Table size="small" rowKey={row => `${row.userId}:${row.number}:${row.purpose}`} dataSource={api.data?.data || []} scroll={{ x: 850 }}
        pagination={{ current: page, pageSize: 50, total: api.data?.total || 0, onChange: setPage, showSizeChanger: false }} columns={[
          { title: "Nomor", dataIndex: "number" }, { title: "Kategori", dataIndex: "purpose" },
          { title: "Sumber", dataIndex: "source" }, { title: "Bukti", dataIndex: "evidence", ellipsis: true },
          { title: "Waktu izin", dataIndex: "grantedAt", render: value => new Date(value).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) },
          { title: "Status", render: (_, row) => <Tag color={row.revokedAt ? "red" : "green"}>{row.revokedAt ? "Dicabut" : "Tercatat"}</Tag> },
          { title: "Tindakan", render: (_, row) => <Button danger size="small" disabled={!!row.revokedAt} onClick={() => Modal.confirm({ title: "Cabut izin dan hentikan seluruh pesan ke nomor ini?", content: row.number,
            onOk: async () => { await axios.delete("/api/recipient-consents", { headers: api.headers, data: { number: row.number, reason: "Permintaan berhenti dicatat operator" } }); api.reload(); } })}>Cabut izin</Button> },
        ]} />
    </Space>
    <Modal title="Catat bukti izin penerima" open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} confirmLoading={busy}>
      <Form form={form} layout="vertical" onFinish={save} initialValues={{ purpose: "ORDER_UPDATES", resumeAfterOptOut: false }}>
        <Form.Item name="number" label="Nomor" rules={[{ required: true }]}><Input maxLength={40} /></Form.Item>
        <Form.Item name="purpose" label="Kategori" rules={[{ required: true }]}><Select options={[{ value: "ORDER_UPDATES", label: "Nota dan pembaruan pesanan" }, { value: "MARKETING", label: "Promosi" }, { value: "SUPPORT", label: "Layanan pelanggan" }]} /></Form.Item>
        <Form.Item name="source" label="Sumber izin" rules={[{ required: true }]}><Input placeholder="Contoh: formulir checkout toko" maxLength={100} /></Form.Item>
        <Form.Item name="evidence" label="Bukti / referensi izin" rules={[{ required: true, min: 5 }]}><Input.TextArea placeholder="Referensi formulir atau percakapan yang berisi persetujuan pelanggan" maxLength={1000} /></Form.Item>
        <Form.Item name="grantedAt" label="Waktu pelanggan memberikan izin (waktu lokal perangkat)" rules={[{ required: true }]}><Input type="datetime-local" /></Form.Item>
        <Form.Item name="consentConfirmed" valuePropName="checked" rules={[{ validator: (_, value) => value ? Promise.resolve() : Promise.reject(new Error("Konfirmasi izin pelanggan.")) }]}><Checkbox>Pelanggan telah memberikan izin untuk kategori ini.</Checkbox></Form.Item>
        <Form.Item name="resumeAfterOptOut" valuePropName="checked"><Checkbox>Buka blokir berdasarkan izin baru setelah permintaan berhenti sebelumnya.</Checkbox></Form.Item>
      </Form>
    </Modal>
  </Card>;
}
