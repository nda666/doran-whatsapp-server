import { ReactElement, useState } from "react";
import { Alert, Button, Form, Input, Modal, Popconfirm, Select, Space, Switch, Table, Tag, Typography, message } from "antd";
import axios from "axios";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import Layout from "@/components/Layout";
import { useDashboardApi } from "@/lib/useDashboardApi";

type Device = { id: string; name: string; number: string | null; userId: string; senderGroupId: string | null; user: { name: string | null; email: string | null } };
type Group = { id: string; userId: string; name: string; enabled: boolean; phones: { id: string; name: string; number: string | null; active: number; isOnline: boolean }[] };
type Values = { userId: string; name: string; enabled: boolean; phoneIds: string[] };
type Conflict = { phoneId: string; deviceName: string; number: string; groupId: string | null; groupName: string | null; otherGroupName: string; otherDeviceName: string };

export default function SenderGroups() {
  const api = useDashboardApi<{ groups: Group[]; phones: Device[]; conflicts: Conflict[] }>("/api/sender-groups", 10000);
  const [form] = Form.useForm<Values>();
  const userId = Form.useWatch("userId", form);
  const selected = Form.useWatch("phoneIds", form) || [];
  const [open, setOpen] = useState(false), [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Group>();
  const phones = api.data?.phones || [];
  const owners = Array.from(new Map(phones.map(phone => [phone.userId, { value: phone.userId, label: phone.user.email || phone.user.name || phone.userId }])).values());
  const save = async (values: Values) => {
    setSaving(true);
    try {
      await axios({ method: editing ? "put" : "post", url: "/api/sender-groups", headers: api.headers, data: { ...values, ...(editing ? { id: editing.id } : {}) } });
      setOpen(false); api.reload(); message.success("Grup pengirim tersimpan.");
    } catch (error: any) { message.error(error.response?.data?.message || "Grup belum dapat disimpan."); }
    finally { setSaving(false); }
  };
  const remove = async (id: string) => {
    try { await axios.delete("/api/sender-groups", { headers: api.headers, data: { id } }); api.reload(); }
    catch (error: any) { message.error(error.response?.data?.message || "Grup belum dapat dihapus."); }
  };
  const edit = (group?: Group) => {
    setEditing(group); form.resetFields();
    form.setFieldsValue(group ? { userId: group.userId, name: group.name, enabled: group.enabled, phoneIds: group.phones.map(phone => phone.id) } : { enabled: true, phoneIds: [] });
    setOpen(true);
  };
  const move = (index: number, offset: number) => {
    const order = [...selected]; [order[index], order[index + offset]] = [order[index + offset], order[index]];
    form.setFieldValue("phoneIds", order);
  };
  return <Space direction="vertical" size="middle" style={{ width: "100%" }}>
    <Alert type="info" showIcon message="Kasir tetap memakai token API yang sama." description="Nomor pemilik token diutamakan. Jika tidak tersedia, sistem memilih nomor cadangan dalam grup yang aktif, online, tidak dijeda, dan memiliki kuota. Semua anggota harus dimiliki akun yang sama. Pesan dengan hasil kirim belum pasti tetap memakai nomor sebelumnya." />
    <Space><Button type="primary" onClick={() => edit()}>Tambah grup pengirim</Button><Button onClick={api.reload}>Muat ulang</Button></Space>
    {api.error && <Alert type="error" showIcon message={api.error} />}
    {!!api.data?.conflicts?.length && <Alert type="warning" showIcon message="Nomor WA terdaftar pada beberapa perangkat" description={<Space direction="vertical">{api.data.conflicts.map(conflict => <span key={conflict.phoneId}>{conflict.number} · {conflict.deviceName} ({conflict.groupName || "Tanpa grup"}) juga digunakan oleh {conflict.otherDeviceName} di {conflict.otherGroupName}. {conflict.groupId ? "Nomor ini tidak dipilih untuk pengiriman grup baru sampai konflik diselesaikan." : "Perangkat ini tidak dapat dimasukkan ke grup lain."}</span>)}</Space>} />}
    <Table<Group> rowKey="id" loading={!api.data && !api.error} dataSource={api.data?.groups || []} scroll={{ x: 850 }} columns={[
      { title: "Grup", dataIndex: "name" },
      { title: "Pemilik", render: (_, group) => owners.find(owner => owner.value === group.userId)?.label || group.userId },
      { title: "Status", render: (_, group) => <Tag color={group.enabled ? "green" : "default"}>{group.enabled ? "Aktif" : "Nonaktif"}</Tag> },
      { title: "Urutan cadangan", render: (_, group) => <Space direction="vertical">{group.phones.map((phone, index) => <span key={phone.id}>{index + 1}. {phone.name} · {phone.number || "Belum terhubung"} <Tag color={phone.isOnline && phone.active === 1 ? "green" : "default"}>{phone.isOnline && phone.active === 1 ? "Online" : "Tidak tersedia"}</Tag></span>)}</Space> },
      { title: "Aksi", render: (_, group) => <Space><Button onClick={() => edit(group)}>Edit</Button><Popconfirm title="Hapus grup? Perangkat akan kembali mengirim tanpa cadangan." onConfirm={() => remove(group.id)}><Button danger>Hapus</Button></Popconfirm></Space> },
    ]} />
    <Modal title={editing ? "Edit grup pengirim" : "Tambah grup pengirim"} open={open} onCancel={() => { if (!saving) setOpen(false); }} footer={null} destroyOnHidden>
      <Form form={form} layout="vertical" onFinish={save} disabled={saving}>
        <Form.Item name="name" label="Nama grup / store" rules={[{ required: true, whitespace: true }]}><Input maxLength={100} /></Form.Item>
        <Form.Item name="userId" label="Pemilik perangkat" rules={[{ required: true }]}><Select disabled={!!editing} showSearch optionFilterProp="label" options={owners} onChange={() => form.setFieldValue("phoneIds", [])} /></Form.Item>
        <Form.Item name="enabled" label="Aktifkan cadangan otomatis" valuePropName="checked"><Switch /></Form.Item>
        <Form.Item name="phoneIds" label="Anggota grup" rules={[{ required: true, type: "array", min: 1 }]} extra="Satu perangkat dan satu nomor WA hanya boleh berada dalam satu grup. Format 08, 628, dan +628 dianggap sama. Saat koneksi mengungkap nomor yang sudah dipakai grup lain, perangkat yang baru terhubung dikeluarkan dari grupnya. Token setiap anggota tetap dapat digunakan oleh kasir."><Select mode="multiple" showSearch optionFilterProp="label" disabled={!userId} options={phones.filter(phone => phone.userId === userId && (!phone.senderGroupId || phone.senderGroupId === editing?.id)).map(phone => ({ value: phone.id, label: `${phone.name} · ${phone.number || "Tanpa nomor"}` }))} /></Form.Item>
        {!!selected.length && <Form.Item label="Prioritas nomor cadangan"><Space direction="vertical" style={{ width: "100%" }}>{selected.map((id: string, index: number) => <Space key={id}><Typography.Text>{index + 1}. {phones.find(phone => phone.id === id)?.name || id}</Typography.Text><Button size="small" disabled={!index} onClick={() => move(index, -1)}>Naik</Button><Button size="small" disabled={index === selected.length - 1} onClick={() => move(index, 1)}>Turun</Button></Space>)}</Space></Form.Item>}
        <Space><Button onClick={() => setOpen(false)}>Batal</Button><Button type="primary" htmlType="submit" loading={saving}>Simpan</Button></Space>
      </Form>
    </Modal>
  </Space>;
}

SenderGroups.getLayout = (page: ReactElement) => <Layout title="Grup pengirim">{page}</Layout>;
export const getStaticProps = async ({ locale }: { locale: string }) => ({ props: { ...(await serverSideTranslations(locale, ["common", "upgrade"])) } });
