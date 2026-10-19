import { useUiTranslation } from "@/lib/uiTranslation";
import { ReactElement, useState } from "react";
import { Alert, Button, Form, Input, Modal, Pagination, Space, Table, Typography, message } from "antd";
import axios from "axios";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import Layout from "@/components/Layout";
import { useDashboardApi } from "@/lib/useDashboardApi";
import { renderMessageTemplate, templateVariables } from "@/lib/messageTemplates";
type Template = { id: string; name: string; content: string };
export default function MessageTemplates() {
  const uiText = useUiTranslation();
  const [q, setQ] = useState(""), [page, setPage] = useState(1), [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Template>();
  const [form] = Form.useForm();
  const content = Form.useWatch("content", form) || "";
  const [modal, context] = Modal.useModal();
  const api = useDashboardApi<{ data: Template[]; total: number }>(`/api/message-templates?q=${encodeURIComponent(q)}&page=${page}`);
  const save = async (values: any) => {
    setBusy(true);
    try {
      if (editing) await axios.patch(`/api/message-templates/${editing.id}`, values, { headers: api.headers });
      else await axios.post("/api/message-templates", values, { headers: api.headers });
      setOpen(false); api.reload(); message.success(uiText("Template tersimpan."));
    } catch (e: any) { message.error(uiText(e.response?.data?.message || uiText("Template belum tersimpan."))); }
    finally { setBusy(false); }
  };
  return <Space direction="vertical" size="middle" style={{ width: "100%" }}>
    <Alert type="info" showIcon message={uiText("Template pesan internal")} description={<>{uiText("Simpan pesan siap pakai, lalu pilih saat membuat campaign, membalas percakapan, mengisi auto reply teks, atau mengirim pesan uji. Gunakan variabel seperti")} {"{nama}"}, {"{nomor}"}{uiText(", atau")} {"{produk}"}{uiText(". Perubahan template berlaku saat dipilih kembali; pesan yang sudah dijadwalkan tetap memakai isi sebelumnya.")}</>} />
    <Space wrap><Button type="primary" onClick={() => { setEditing(undefined); form.resetFields(); setOpen(true); }}>{uiText("Buat template")}</Button><Input.Search allowClear placeholder={uiText("Cari nama atau isi template")} onSearch={value => { setQ(value); setPage(1); }} /></Space>
    {api.error && <Alert type="error" message={uiText(api.error)} action={<Button onClick={api.reload}>{uiText("Coba lagi")}</Button>} />}
    <Table<Template> rowKey="id" loading={!api.data && !api.error} dataSource={api.data?.data || []} pagination={false} scroll={{ x: 650 }} columns={[
      { title: uiText("Nama template"), dataIndex: "name", width: 220 },
      { title: uiText("Isi pesan"), dataIndex: "content", render: text => <Typography.Paragraph ellipsis={{ rows: 3, expandable: true }} style={{ whiteSpace: "pre-wrap", margin: 0 }}>{text}</Typography.Paragraph> },
      { title: uiText("Aksi"), width: 160, render: (_, row) => <Space><Button size="small" onClick={() => { setEditing(row); form.setFieldsValue(row); setOpen(true); }}>{uiText("Edit")}</Button><Button size="small" danger onClick={() => modal.confirm({ title: uiText("Hapus template?"), content: row.name, okText: uiText("Hapus"), cancelText: uiText("Batal"), okButtonProps: { danger: true }, onOk: async () => {
        try { await axios.delete(`/api/message-templates/${row.id}`, { headers: api.headers }); if ((api.data?.data.length || 0) === 1 && page > 1) setPage(page - 1); else api.reload(); message.success(uiText("Template dihapus.")); }
        catch (e: any) { message.error(uiText(e.response?.data?.message || uiText("Template belum terhapus."))); throw e; }
      } })}>{uiText("Hapus")}</Button></Space> },
    ]} />
    <Pagination current={page} pageSize={20} total={api.data?.total || 0} onChange={setPage} />
    <Modal title={editing ? uiText("Edit template") : uiText("Template baru")} open={open} onCancel={() => !busy && setOpen(false)} onOk={() => form.submit()} confirmLoading={busy} okText={uiText("Simpan")} cancelText={uiText("Batal")} width={660}>
      <Form form={form} layout="vertical" onFinish={save} disabled={busy}>
        <Form.Item name="name" label={uiText("Nama template")} rules={[{ required: true, whitespace: true }]}><Input maxLength={200} /></Form.Item>
        <Form.Item name="content" label={uiText("Isi pesan")} extra={uiText("Format variabel: {nama_variabel}, memakai huruf, angka, dan garis bawah.")} rules={[{ required: true, whitespace: true }]}><Input.TextArea rows={7} maxLength={10000} showCount placeholder={uiText("Halo {nama}, pesanan {produk} Anda sudah siap.")} /></Form.Item>
        <Typography.Paragraph>{uiText("Variabel:")} {templateVariables(content).map(key => `{${key}}`).join(", ") || uiText("Tidak ada")}</Typography.Paragraph>
        <strong>{uiText("Contoh pratinjau")}</strong><div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{renderMessageTemplate(content, Object.fromEntries(templateVariables(content).map(key => [key, key === "nama" ? uiText("Budi") : key === "nomor" ? "6281234567890" : uiText("[{{v0}}]", { v0: key })])))}</div>
      </Form>
    </Modal>{context}
  </Space>;
}
MessageTemplates.getLayout = (page: ReactElement) => <Layout title="TEMPLATE PESAN">{page}</Layout>;
export const getStaticProps = async ({ locale }: { locale: string }) => ({ props: { ...(await serverSideTranslations(locale, ["common", "upgrade", "interface"])) } });
