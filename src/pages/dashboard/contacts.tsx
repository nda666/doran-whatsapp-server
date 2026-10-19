import { useUiTranslation } from "@/lib/uiTranslation";
import RecipientSuppressions from "@/components/RecipientSuppressions";
import FilterSelect from "@/components/FilterSelect";
import ActionDropdown from "@/components/ActionDropdown";
import { DeleteOutlined, DownloadOutlined, EditOutlined, UploadOutlined } from "@ant-design/icons";
import Table from "@/components/DashboardTable";
import { useTableState } from "@/lib/useTableState";
import { useLocalizedTranslation as useTranslation } from "@/lib/uiTranslation";
import { ReactElement, useState } from "react";
import { Alert, Button, Form, Input, Modal, Popconfirm, Select, Space, Tabs, Upload, message } from "antd";
import type { UploadFile } from "antd";
import axios from "axios";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import Layout from "@/components/Layout";
import { useDashboardApi } from "@/lib/useDashboardApi";
import { parseCsv } from "@/server/campaigns/csv";
type SyncResult = { found: number; count: number; skipped: number };
dayjs.extend(utc);
export default function Contacts() {
  const uiText = useUiTranslation();
  const { t: ui } = useTranslation("upgrade");
  const table = useTableState();
  const [modal, modalContext] = Modal.useModal();
  const [q, setQ] = useState(""), [groupId, setGroupId] = useState("");
  const api = useDashboardApi(`/api/contacts?${table.params}&q=${encodeURIComponent(q)}&groupId=${groupId}`);
  const groups = useDashboardApi("/api/contacts/groups"), phones = useDashboardApi("/api/phones?options=1");
  const [open, setOpen] = useState(false), [groupOpen, setGroupOpen] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false), [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult>(), [syncError, setSyncError] = useState("");
  const [syncForm] = Form.useForm<{ phoneId: string; groupId?: string }>();
  const [form] = Form.useForm(), [groupForm] = Form.useForm();
  const [importOpen, setImportOpen] = useState(false), [importing, setImporting] = useState(false);
  const [importForm] = Form.useForm<{ groupId?: string; file: UploadFile[] }>();
  const mutate = async (url: string, data: any, method = "post") => {
    try { await axios({ url, data, method, headers: api.headers }); api.reload(); groups.reload(); return true; }
    catch (e: any) { message.error(uiText(e.response?.data?.message || uiText("Aksi gagal."))); return false; }
  };
  const importFile = async (values: { groupId?: string; file: UploadFile[] }) => {
    const file = values.file?.[0]?.originFileObj;
    if (!file) { message.error(uiText("Pilih file CSV atau Excel terlebih dahulu.")); return; }
    setImporting(true);
    try {
      if (!/\.(csv|xlsx)$/i.test(file.name)) throw new Error(uiText("Gunakan file CSV atau Excel (.xlsx)."));
      if (file.size > 3 * 1024 * 1024) throw new Error("Maksimal 3 MB.");
      const rows: any[][] = file.name.toLowerCase().endsWith(".xlsx") ? await (await import("read-excel-file/browser")).readSheet(file) : parseCsv(await file.text());
      const header = rows.shift()?.map(v => String(v || "").trim().toLowerCase());
      const nameIndex = header?.indexOf("nama") ?? -1, numberIndex = header?.indexOf("nomor") ?? -1;
      if (nameIndex < 0 || numberIndex < 0 || rows.length > 10000) throw new Error(uiText("Gunakan kolom nama,nomor; maksimal 10.000 kontak. Nomor Excel harus disimpan sebagai teks."));
      const contacts = rows.filter(r => String(r[numberIndex] ?? "").trim()).map(r => ({ name: String(r[nameIndex] || ""), number: String(r[numberIndex]), groupId: values.groupId || null }));
      if (!contacts.length) throw new Error(uiText("File tidak berisi kontak. Isi kolom nama dan nomor terlebih dahulu."));
      if (await mutate("/api/contacts", { contacts })) {
        message.success(uiText("Impor selesai. Nomor yang sudah ada dilewati."));
        setImportOpen(false);
        importForm.resetFields();
      }
    } catch (e: any) { message.error(uiText(e.message || uiText("Impor gagal."))); } finally { setImporting(false); }
  };
  const exportFile = async () => {
    try { const r = await axios.get(`/api/contacts?export=csv&q=${encodeURIComponent(q)}&groupId=${groupId}`, { headers: api.headers, responseType: "blob" }); const url = URL.createObjectURL(r.data); const a = document.createElement("a"); a.href = url; a.download = "kontak.csv"; a.click(); URL.revokeObjectURL(url); }
    catch { message.error(uiText("Ekspor gagal.")); }
  };
  const syncContacts = async (values: { phoneId: string; groupId?: string }) => {
    setSyncing(true);
    setSyncResult(undefined);
    setSyncError("");
    try {
      const response = await axios.post<SyncResult>("/api/contacts/sync", { phoneId: values.phoneId, groupId: values.groupId || null }, { headers: api.headers });
      setSyncResult(response.data);
      api.reload();
      groups.reload();
    } catch (e: any) {
      setSyncError(e.response?.data?.message || uiText("Sync gagal. Silakan coba lagi."));
    } finally { setSyncing(false); }
  };
  const options = (groups.data || []).map((g: any) => ({ value: g.id, label: `${g.name} (${g._count.contacts})` }));
  return <Tabs items={[{ key: "contacts", label: uiText("Kontak"), children: <Space direction="vertical" style={{ width: "100%" }} size="middle">
    <Space wrap><Button type="primary" onClick={() => { form.resetFields(); setOpen(true); }}>{ui("Tambah Kontak")}</Button><Button onClick={() => setGroupOpen(true)}>{ui("Kelola Grup")}</Button>
      <Button onClick={() => { importForm.resetFields(); importForm.setFieldsValue({ groupId: groupId || undefined, file: [] }); setImportOpen(true); }}>{ui("Import CSV / Excel")}</Button><Button onClick={exportFile}>{ui("Export CSV")}</Button>
      <Button onClick={() => { syncForm.resetFields(); syncForm.setFieldsValue({ groupId: groupId || undefined }); setSyncResult(undefined); setSyncError(""); setSyncOpen(true); }}>{ui("Sync Kontak")}</Button>
      <Popconfirm title={uiText("Hapus seluruh kontak milik Anda?")} onConfirm={() => mutate("/api/contacts", { all: true }, "delete")}><Button danger>{ui("Hapus Semua")}</Button></Popconfirm></Space>
    <Form layout="vertical" colon={false} className="dashboard-filter-grid" onFinish={values => { setQ(values.q || ""); setGroupId(values.groupId || ""); table.reset(); }}><Form.Item name="q" label={uiText("Nama / nomor")}><Input allowClear placeholder={uiText("Cari nama / nomor")} /></Form.Item><Form.Item name="groupId" label={uiText("Grup")}><FilterSelect allLabel={uiText("Semua grup")} options={options} /></Form.Item><div className="dashboard-filter-actions"><Button type="primary" htmlType="submit">{uiText("Cari")}</Button></div></Form>
    {api.error && <Alert type="error" message={uiText(api.error)} />}
    <Table className="table-with-data-count" rowKey="id" scroll={{ x: true }} dataSource={api.data?.data || []} table={table} total={api.data?.total} columns={[
      { title: ui("Nama"), dataIndex: "name" }, { title: ui("Nomor"), dataIndex: "number" }, { title: ui("Grup"), dataIndex: ["group", "name"], render: (_, r: any) => r.group?.name || "—" },
      { title: uiText("Dibuat (WIB)"), dataIndex: "createdAt", width: 200, render: value => value ? dayjs(value).utcOffset(7).format("DD/MM/YYYY HH:mm:ss") : "—" },
      { title: ui("Aksi"), key: "aksi", width: 120, render: (_, r: any) => <ActionDropdown ariaLabel={uiText("Aksi kontak {{v0}}", { v0: r.name || r.number })} items={[
        { key: "edit", label: ui("Edit"), icon: <EditOutlined />, onClick: () => { form.setFieldsValue(r); setOpen(true); } },
        { key: "delete", label: ui("Hapus"), icon: <DeleteOutlined />, danger: true, onClick: () => modal.confirm({ title: uiText("Hapus kontak ini?"), content: r.name || r.number, okText: ui("Hapus"), cancelText: uiText("Batal"), okButtonProps: { danger: true }, onOk: () => mutate("/api/contacts", { id: r.id }, "delete") }) },
      ]} /> },
    ]} />
    <Modal title={ui("Sync Kontak")} open={syncOpen} onCancel={() => { if (!syncing) setSyncOpen(false); }} closable={!syncing} maskClosable={!syncing} keyboard={!syncing} footer={null}>
      <Form form={syncForm} layout="vertical" onFinish={syncContacts} disabled={syncing} onValuesChange={() => { setSyncResult(undefined); setSyncError(""); }}>
        <Form.Item name="phoneId" label={uiText("Perangkat")} rules={[{ required: true, message: uiText("Pilih perangkat terlebih dahulu.") }]}><Select showSearch optionFilterProp="label" placeholder={uiText("Pilih perangkat WhatsApp")} loading={!phones.data && !phones.error} options={(phones.data || []).map((p: any) => ({ value: p.id, label: p.name }))} /></Form.Item>
        <Form.Item name="groupId" label={uiText("Grup tujuan")} extra={uiText("Kosongkan untuk menyimpan kontak tanpa grup.")}><Select allowClear showSearch optionFilterProp="label" placeholder={uiText("Tanpa grup")} options={options} /></Form.Item>
        <Form.Item>
          <Alert type="info" showIcon message={uiText("Sync menyalin kontak WhatsApp dari device yang dipilih ke daftar ini.")} description={uiText("Sebagian kontak di HP mungkin belum muncul karena aplikasi hanya bisa menyalin kontak yang sudah terbaca dari WhatsApp. Maksimal 10.000 kontak diproses setiap sync. Kontak yang sudah ada akan dilewati.")} />
        </Form.Item>
        {(phones.error || groups.error) && <Form.Item><Alert type="error" showIcon message={uiText(phones.error || groups.error)} /></Form.Item>}
        {syncError && <Form.Item><Alert type="error" showIcon message={uiText(syncError)} /></Form.Item>}
        {syncResult && <Form.Item><Alert type={syncResult.found ? "success" : "info"} showIcon message={uiText("Sync selesai. {{v0}} kontak ditemukan.", { v0: syncResult.found.toLocaleString(uiText.locale) })} description={syncResult.found ? `${syncResult.count.toLocaleString(uiText.locale)} kontak berhasil ditambahkan. ${syncResult.skipped.toLocaleString(uiText.locale)} kontak dilewati karena sudah ada di daftar kontak.` : "Belum ada kontak yang terbaca dari device ini. Tunggu WhatsApp selesai menyinkronkan kontak, lalu coba lagi, atau gunakan import CSV / Excel."} /></Form.Item>}
        <Space style={{ width: "100%", justifyContent: "flex-end" }}><Button disabled={syncing} onClick={() => setSyncOpen(false)}>{syncResult ? uiText("Tutup") : uiText("Batal")}</Button><Button type="primary" htmlType="submit" loading={syncing} disabled={!phones.data || !!phones.error || !!groups.error}>{uiText("Proses sync")}</Button></Space>
      </Form>
    </Modal>
    <Modal title={ui("Import CSV / Excel")} open={importOpen} onCancel={() => { if (!importing) setImportOpen(false); }} closable={!importing} maskClosable={!importing} keyboard={!importing} footer={null}>
      <Form form={importForm} layout="vertical" onFinish={importFile} disabled={importing}>
        <Form.Item name="groupId" label={uiText("Grup tujuan")} extra={uiText("Kosongkan untuk mengimpor kontak tanpa grup.")}><Select allowClear showSearch optionFilterProp="label" placeholder={uiText("Tanpa grup")} options={options} /></Form.Item>
        <Form.Item name="file" label={uiText("File kontak")} valuePropName="fileList" getValueFromEvent={event => event.fileList} rules={[{ required: true, type: "array", min: 1, message: uiText("Pilih file CSV atau Excel terlebih dahulu.") }]} extra={uiText("Format .csv atau .xlsx, maksimal 3 MB dan 10.000 kontak.")}>
          <Upload accept=".csv,.xlsx" maxCount={1} beforeUpload={file => {
            if (!/\.(csv|xlsx)$/i.test(file.name)) { message.error(uiText("Gunakan file CSV atau Excel (.xlsx).")); return Upload.LIST_IGNORE; }
            if (file.size > 3 * 1024 * 1024) { message.error("Maksimal 3 MB."); return Upload.LIST_IGNORE; }
            return false;
          }}><Button icon={<UploadOutlined />}>{uiText("Pilih file")}</Button></Upload>
        </Form.Item>
        <Form.Item label={uiText("Contoh template file")}>
          <Space direction="vertical" style={{ width: "100%" }}>
            <Button href="/templates/kontak.csv" download="template-kontak.csv" icon={<DownloadOutlined />}>{uiText("Unduh template CSV")}</Button>
            <Alert type="info" showIcon message={uiText("Import memakai kolom nama dan nomor. Pilih grup tujuan di modal ini untuk memasukkan kontak ke grup tersebut.")} description={uiText("Isi nomor dengan kode negara, misalnya 6281234567890. Jika menggunakan Excel, simpan kolom nomor sebagai teks agar angka tidak berubah. Ganti kontak contoh dengan data Anda sebelum import.")} />
          </Space>
        </Form.Item>
        <Space style={{ width: "100%", justifyContent: "flex-end" }}><Button disabled={importing} onClick={() => setImportOpen(false)}>{uiText("Batal")}</Button><Button type="primary" htmlType="submit" loading={importing}>{uiText("Mulai import")}</Button></Space>
      </Form>
    </Modal>
    <Modal title={ui("Kontak")} open={open} onCancel={() => setOpen(false)} footer={null}><Form form={form} layout="vertical" onFinish={async values => { if (await mutate("/api/contacts", values)) setOpen(false); }}>
      <Form.Item name="id" hidden><Input /></Form.Item><Form.Item name="name" label={ui("Nama")}><Input maxLength={200} /></Form.Item><Form.Item name="number" label={ui("Nomor")} rules={[{ required: true }]}><Input /></Form.Item><Form.Item name="groupId" label={ui("Grup")}><Select allowClear options={options} /></Form.Item><Button type="primary" htmlType="submit">{ui("Simpan")}</Button></Form></Modal>
    <Modal title={ui("Grup kontak")} open={groupOpen} onCancel={() => setGroupOpen(false)} footer={null} styles={{ body: { paddingTop: 20 } }}>
      <Space direction="vertical" size={24} style={{ width: "100%" }}>
      <Form form={groupForm} layout="inline" style={{ rowGap: 12 }} onFinish={async values => { if (await mutate("/api/contacts/groups", values)) groupForm.resetFields(); }}><Form.Item name="id" hidden><Input /></Form.Item><Form.Item name="name" style={{ flex: "1 1 180px" }} rules={[{ required: true }]}><Input placeholder={uiText("Nama grup")} aria-label={uiText("Nama grup")} /></Form.Item><Button htmlType="submit">{ui("Simpan")}</Button></Form>
      <Table className="table-with-data-count" rowKey="id" dataSource={groups.data || []} columns={[{ title: ui("Nama"), dataIndex: "name" }, { title: ui("Aksi"), key: "aksi", width: 120, render: (_, g: any) => <ActionDropdown ariaLabel={uiText("Aksi grup {{v0}}", { v0: g.name })} items={[
        { key: "edit", label: ui("Edit"), icon: <EditOutlined />, onClick: () => groupForm.setFieldsValue(g) },
        { key: "delete", label: ui("Hapus"), icon: <DeleteOutlined />, danger: true, onClick: () => modal.confirm({ title: uiText("Hapus grup? Kontaknya tetap tersimpan."), content: g.name, okText: ui("Hapus"), cancelText: uiText("Batal"), okButtonProps: { danger: true }, onOk: () => mutate("/api/contacts/groups", { id: g.id }, "delete") }) },
      ]} /> }]} />
      </Space>
    </Modal>
    {modalContext}
  </Space> }, { key: "suppressions", label: uiText("Daftar blokir"), children: <RecipientSuppressions /> }]} />;
}
Contacts.getLayout = (page: ReactElement) => <Layout title="PHONEBOOK / KONTAK">{page}</Layout>;
export const getStaticProps = async ({ locale }: { locale: string }) => ({ props: { ...(await serverSideTranslations(locale, ["common", "upgrade", "interface"])) } });
