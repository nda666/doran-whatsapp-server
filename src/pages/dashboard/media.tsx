import { useUiTranslation } from "@/lib/uiTranslation";
import ActionDropdown from "@/components/ActionDropdown";
import FilterSelect from "@/components/FilterSelect";
import { mediaTypeOptions } from "@/lib/mediaFilters";
import { ReactElement, useState } from "react";
import { Alert, Button, Checkbox, Form, Input, Modal, Space, Upload, message, Image, Card } from "antd";
import type { UploadFile } from "antd";
import { CopyOutlined, DeleteOutlined, EditOutlined, EyeOutlined, InboxOutlined } from "@ant-design/icons";
import axios from "axios";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import Layout from "@/components/Layout";
import Table from "@/components/DashboardTable";
import { useTableState } from "@/lib/useTableState";
import { useDashboardApi } from "@/lib/useDashboardApi";
dayjs.extend(utc);
export default function Media() {
  const uiText = useUiTranslation();
  const table = useTableState();
  const [modal, modalContext] = Modal.useModal();
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const api = useDashboardApi(`/api/media?${table.params}&q=${encodeURIComponent(q)}&type=${encodeURIComponent(type)}`);
  const [preview, setPreview] = useState<any>();
  const [asSticker, setAsSticker] = useState(false);
  const [files, setFiles] = useState<UploadFile[]>([]), [labels, setLabels] = useState<Record<string, string>>({}), [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<any>(), [label, setLabel] = useState("");
  const upload = async () => {
    if (!files.length) return;
    if (files.some(file => !labels[file.uid]?.trim())) { message.error(uiText("Isi label untuk setiap file.")); return; }
    if (files.reduce((sum, file) => sum + (file.size || 0), 0) > 100 * 1024 * 1024) { message.error(uiText("Total file maksimal 100 MB.")); return; }
    const data = new FormData();
    files.forEach(file => data.append("file", file.originFileObj!));
    data.append("labels", JSON.stringify(files.map(file => labels[file.uid].trim())));
    if (asSticker) data.append("asSticker", "1");
    setBusy(true);
    try { const r = await axios.post("/api/media", data, { headers: api.headers, timeout: 120000 }); setFiles([]); setLabels({}); api.reload(); message.success(uiText(r.data.message)); }
    catch (e: any) { message.error(uiText(e.response?.data?.message || uiText("Upload gagal."))); }
    finally { setBusy(false); }
  };
  const view = async (m: any) => {
    try { const r = await axios.get(`/api/media/${m.id}`, { headers: api.headers, responseType: "blob" }); setPreview({ ...m, url: URL.createObjectURL(r.data) }); }
    catch { message.error(uiText("File belum dapat dibuka.")); }
  };
  return <Space direction="vertical" style={{ width: "100%" }} size="middle">
    <Card title={uiText("Upload file")}>
      <Checkbox checked={asSticker} disabled={busy} onChange={event => setAsSticker(event.target.checked)} style={{ marginBottom: 16 }}>{uiText("Ubah foto menjadi stiker WhatsApp")}</Checkbox>
      {asSticker && <Alert type="info" showIcon message={uiText("Unggah JPG, PNG, atau WebP statis. Foto diubah menjadi stiker 512 × 512 tanpa dipotong, maksimal 100 KB. Hasilnya disimpan dan bisa digunakan kembali di Campaign atau Uji Kirim. Stiker tidak mendukung caption.")} style={{ marginBottom: 16 }} />}
      <Upload.Dragger multiple disabled={busy} maxCount={10} fileList={files} accept={asSticker ? ".jpg,.jpeg,.png,.webp" : ".jpg,.jpeg,.png,.gif,.webp,.mp4,.mp3,.ogg,.pdf,.doc,.docx,.xlsx,.txt"}
        beforeUpload={file => { if (file.size > 25 * 1024 * 1024) { message.error(uiText(`${file.name}: maksimal 25 MB.`)); return Upload.LIST_IGNORE; } setLabels(previous => ({ ...previous, [file.uid]: previous[file.uid] || file.name.replace(/\.[^.]+$/, "") })); return false; }}
        onChange={info => setFiles(info.fileList)}>
        <p className="ant-upload-drag-icon"><InboxOutlined /></p><p className="ant-upload-text">{uiText("Klik atau seret beberapa file ke sini")}</p><p className="ant-upload-hint">{uiText("Maksimal 10 file, 25 MB per file, total 100 MB.")}</p>
      </Upload.Dragger>
      {!!files.length && <Space direction="vertical" size="middle" style={{ width: "100%", marginTop: 20 }}>
        {files.map(file => <Form.Item key={file.uid} label={uiText("Label untuk {{v0}}", { v0: file.name })} style={{ marginBottom: 0 }}><Input value={labels[file.uid] || ""} maxLength={255} disabled={busy} placeholder={uiText("Contoh: Brosur promo Oktober")} onChange={event => setLabels(previous => ({ ...previous, [file.uid]: event.target.value }))} /></Form.Item>)}
        <Button type="primary" loading={busy} onClick={upload}>{asSticker ? uiText("Buat dan simpan") : uiText("Upload")} {files.length} {asSticker ? uiText("stiker") : uiText("file")}</Button>
      </Space>}
    </Card>
    <Form layout="inline" className="dashboard-filter" initialValues={{ type: "" }} onFinish={values => { setQ(values.q || ""); setType(values.type || ""); table.reset(); }}>
      <Form.Item name="q" label={uiText("Label / nama file")}><Input allowClear placeholder={uiText("Cari label atau nama file asli")} /></Form.Item>
      <Form.Item name="type" label={uiText("Tipe file")}><FilterSelect allLabel={uiText("Semua")} options={mediaTypeOptions.map(option => ({ ...option, label: uiText(option.label) }))} style={{ minWidth: 180 }} /></Form.Item>
      <Button type="primary" htmlType="submit">{uiText("Cari")}</Button>
    </Form>
    {api.error && <Alert type="error" message={uiText(api.error)} />}
    <Alert type="info" message={uiText("Saat membuat campaign, pilih file berdasarkan label yang Anda isi saat upload. URL/ID file tetap sama meskipun label diubah. File dalam antrean/riwayat belum dapat dihapus.")} />
    <Table table={table} total={api.data?.total} className="table-with-data-count" rowKey="id" scroll={{ x: true }} dataSource={api.data?.data || []} columns={[
      { title: uiText("Label file"), dataIndex: "name" }, { title: uiText("Nama file asli"), render: (_, m: any) => m.originalName || m.name }, { title: uiText("Tipe"), dataIndex: "mime" }, { title: uiText("Ukuran"), dataIndex: "size", render: n => `${(n / 1024).toFixed(1)} KB` },
      { title: uiText("Dibuat (WIB)"), dataIndex: "createdAt", width: 200, render: value => value ? dayjs(value).utcOffset(7).format("DD/MM/YYYY HH:mm:ss") : "—" },
      { title: uiText("Aksi"), key: "aksi", width: 120, render: (_, m: any) => <ActionDropdown ariaLabel={uiText("Aksi untuk {{v0}}", { v0: m.name })} items={[
        { key: "edit", label: uiText("Edit label"), icon: <EditOutlined />, onClick: () => { setEditing(m); setLabel(m.name); } },
        { key: "preview", label: uiText("Preview / Download"), icon: <EyeOutlined />, onClick: () => view(m) },
        { key: "copy", label: uiText("Copy URL"), icon: <CopyOutlined />, onClick: async () => { try { await navigator.clipboard.writeText(`${location.origin}/api/media/${m.id}`); message.success(uiText("URL disalin.")); } catch { message.error(uiText("Clipboard tidak tersedia.")); } } },
        { type: "divider" },
        { key: "delete", label: uiText("Hapus"), icon: <DeleteOutlined />, danger: true, onClick: () => modal.confirm({ title: uiText("Hapus file ini?"), content: m.name, okText: uiText("Hapus"), cancelText: uiText("Batal"), okButtonProps: { danger: true }, onOk: async () => { try { await axios.delete(`/api/media/${m.id}`, { headers: api.headers }); api.reload(); } catch (e: any) { message.error(uiText(e.response?.data?.message || uiText("Hapus gagal."))); } } }) },
      ]} /> },
    ]} />
    <Modal title={uiText("Edit label file")} open={!!editing} onCancel={() => !busy && setEditing(undefined)} confirmLoading={busy} okText={uiText("Simpan")} cancelText={uiText("Batal")} onOk={async () => { setBusy(true); try { await axios.patch(`/api/media/${editing.id}`, { name: label }, { headers: api.headers }); setEditing(undefined); api.reload(); message.success(uiText("Label tersimpan. Nama file asli tetap.")); } catch (e: any) { message.error(uiText(e.response?.data?.message || uiText("Label belum tersimpan."))); } finally { setBusy(false); } }} styles={{ body: { paddingTop: 16 } }}>
      <Form layout="vertical">
        <Form.Item label={uiText("Label file")}><Input value={label} disabled={busy} maxLength={255} aria-label={uiText("Label file")} onChange={event => setLabel(event.target.value)} /></Form.Item>
        <Form.Item label={uiText("Nama file asli")} extra={uiText("Nama file saat diunggah. Mengubah label tidak mengubah nama file asli.")}><Input value={editing?.originalName || editing?.name || ""} readOnly aria-label={uiText("Nama file asli")} /></Form.Item>
      </Form>
    </Modal>
    <Modal title={preview?.name} open={!!preview} footer={null} onCancel={() => { URL.revokeObjectURL(preview.url); setPreview(undefined); }}>
      {preview?.mime.startsWith("image/") ? <Image src={preview.url} alt={preview.name} style={{ maxWidth: "100%" }} /> : preview?.mime.startsWith("video/") ? <video src={preview.url} controls style={{ width: "100%" }} /> : preview?.mime.startsWith("audio/") ? <audio src={preview.url} controls /> : <a href={preview?.url} download={preview?.originalName || preview?.name}>{uiText("Download")} {preview?.name}</a>}
    </Modal>
    {modalContext}
  </Space>;
}
Media.getLayout = (page: ReactElement) => <Layout title="FILE MANAGER">{page}</Layout>;
export const getStaticProps = async ({ locale }: { locale: string }) => ({ props: { ...(await serverSideTranslations(locale, ["common", "upgrade", "interface"])) } });
