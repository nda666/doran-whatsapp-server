import { useUiTranslation } from "@/lib/uiTranslation";
import { ReactElement, useState } from "react";
import { Alert, Button, Card, Form, Input, InputNumber, Modal, Space, Switch, Tag, message } from "antd";
import { DeleteOutlined, EditOutlined } from "@ant-design/icons";
import ActionDropdown from "@/components/ActionDropdown";
import axios from "axios";
import { superAdminPageProps } from "@/lib/superAdminPageProps";
import Layout from "@/components/Layout";
import Table from "@/components/DashboardTable";
import { useTableState } from "@/lib/useTableState";
import { useDashboardApi } from "@/lib/useDashboardApi";
export default function Plans() {
  const uiText = useUiTranslation();
  const table = useTableState(); const [q, setQ] = useState("");
  const [modal, modalContext] = Modal.useModal();
  const plans = useDashboardApi(`/api/admin/plans?${table.params}&q=${encodeURIComponent(q)}`);
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false); const [form] = Form.useForm();
  const save = async (values: any) => { setBusy(true); try { await axios.post("/api/admin/plans", values, { headers: plans.headers }); setOpen(false); plans.reload(); message.success(uiText("Paket tersimpan.")); } catch (e: any) { message.error(uiText(e.response?.data?.message || uiText("Paket gagal disimpan."))); } finally { setBusy(false); } };
  return <Space direction="vertical" size="middle" style={{ width: "100%" }}>
    <Alert type="info" showIcon message={uiText("Paket menentukan batas device awal pengguna.")} description={uiText("Perubahan batas paket berlaku saat paket dipilih di form pengguna; batas akun lama tetap dapat disesuaikan admin. Standard adalah paket default pendaftaran.")} />
    <Button type="primary" onClick={() => { form.resetFields(); setOpen(true); }}>{uiText("Tambah paket")}</Button>
    <Card title={uiText("Pencarian")}><Form layout="vertical" colon={false} className="dashboard-filter-grid" onFinish={values => { setQ(values.q || ""); table.reset(); plans.reload(); }}><Form.Item name="q" label={uiText("Nama paket")}><Input allowClear placeholder={uiText("Cari nama paket")} /></Form.Item><div className="dashboard-filter-actions"><Button type="primary" htmlType="submit">{uiText("Cari")}</Button></div></Form></Card>
    {plans.error && <Alert type="error" message={uiText(plans.error)} />}
    <Table table={table} total={plans.data?.total} rowKey="id" scroll={{ x: true }} dataSource={plans.data?.data || []} columns={[
      { title: uiText("Paket"), dataIndex: "name" }, { title: uiText("Batas device"), dataIndex: "deviceLimit" }, { title: uiText("Deskripsi"), dataIndex: "description" }, { title: uiText("Status"), dataIndex: "active", render: value => <Tag color={value ? "green" : "default"}>{value ? uiText("Aktif") : uiText("Nonaktif")}</Tag> },
      { title: uiText("Aksi"), key: "aksi", width: 120, render: (_, plan: any) => <ActionDropdown ariaLabel={uiText("Aksi paket {{v0}}", { v0: plan.name })} items={[
        { key: "edit", label: uiText("Edit"), icon: <EditOutlined />, onClick: () => { form.setFieldsValue(plan); setOpen(true); } },
        { key: "delete", label: uiText("Hapus"), icon: <DeleteOutlined />, danger: true, disabled: plan.name === "Standard", onClick: () => modal.confirm({ title: uiText("Hapus paket ini?"), content: plan.name, okText: uiText("Hapus"), cancelText: uiText("Batal"), okButtonProps: { danger: true }, onOk: async () => { try { await axios.delete("/api/admin/plans", { headers: plans.headers, data: { id: plan.id } }); plans.reload(); message.success(uiText("Paket dihapus.")); } catch (e: any) { message.error(uiText(e.response?.data?.message || uiText("Paket tidak dapat dihapus."))); } } }) },
      ]} /> },
    ]} />
    <Modal title={form.getFieldValue("id") ? uiText("Edit paket") : uiText("Tambah paket")} open={open} onCancel={() => !busy && setOpen(false)} okText={uiText("Simpan")} cancelText={uiText("Batal")} confirmLoading={busy} onOk={() => form.submit()} styles={{ body: { paddingTop: 16 } }}>
      <Form form={form} layout="vertical" initialValues={{ active: true, deviceLimit: 100 }} onFinish={save} disabled={busy}>
        <Form.Item name="id" hidden><Input /></Form.Item><Form.Item name="name" label={uiText("Nama paket")} rules={[{ required: true }]}><Input maxLength={100} /></Form.Item>
        <Form.Item name="deviceLimit" label={uiText("Batas device")} rules={[{ required: true }]}><InputNumber min={0} max={10000} /></Form.Item>
        <Form.Item name="description" label={uiText("Deskripsi")}><Input.TextArea maxLength={500} /></Form.Item><Form.Item name="active" label={uiText("Paket aktif")} valuePropName="checked"><Switch /></Form.Item>
      </Form>
    </Modal>
    {modalContext}
  </Space>;
}
Plans.getLayout = (page: ReactElement) => <Layout title="MASTER PAKET">{page}</Layout>;
export const getServerSideProps = superAdminPageProps;
