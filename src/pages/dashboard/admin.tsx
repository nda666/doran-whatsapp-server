import { useUiTranslation } from "@/lib/uiTranslation";
import ActionDropdown from "@/components/ActionDropdown";
import { CheckOutlined, CloseOutlined, CopyOutlined, EditOutlined, KeyOutlined, PoweroffOutlined } from "@ant-design/icons";
import FilterSelect from "@/components/FilterSelect";
import Table from "@/components/DashboardTable";
import { useTableState } from "@/lib/useTableState";
import { useLocalizedTranslation as useTranslation } from "@/lib/uiTranslation";
import { ReactElement, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { Alert, Button, Card, Form, Input, InputNumber, Modal, Select, Space, DatePicker, Tabs, Tag, Switch, message } from "antd";
import axios from "axios";
import dayjs from "dayjs";
import { superAdminPageProps } from "@/lib/superAdminPageProps";
import Layout from "@/components/Layout";
import { useDashboardApi } from "@/lib/useDashboardApi";
import DispatchWebhookSettings from "@/components/phone/DispatchWebhookSettings";
import DeviceWebhookSettings from "@/components/phone/DeviceWebhookSettings";
import WebhookLogs from "@/components/WebhookLogs";
import SystemInformation from "@/components/SystemInformation";
import MessagingPreferences from "@/components/MessagingPreferences";
import GlobalSettings from "@/components/GlobalSettings";
import { useSession } from "next-auth/react";
import { isSuperAdmin } from "@/lib/access";
export default function Admin() {
  const uiText = useUiTranslation();
  const router = useRouter();
  const { data: session } = useSession();
  const mainAdmin = !!session?.user && isSuperAdmin({ id: session.user.id, email: session.user.email, role: session.user.role || "USER", approvalStatus: session.user.approvalStatus || "" });
  const [activeTab, setActiveTab] = useState<string>();
  const [logType, setLogType] = useState("all");
  const openLogs = (type: string) => { setLogType(type); setActiveTab("webhook-logs"); };
  const { t: ui } = useTranslation("upgrade");
  const [approvalStatus, setApprovalStatus] = useState("");
  const [activeStatus, setActiveStatus] = useState("");
  const table = useTableState();
  const [modal, modalContext] = Modal.useModal();
  const [q, setQ] = useState(""), [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
  const [tokenUser, setTokenUser] = useState<{ id: string; name?: string; email?: string; token: string }>();
  const users = useDashboardApi(`/api/admin/users?${table.params}&q=${encodeURIComponent(q)}&status=${approvalStatus}&active=${activeStatus}`, approvalStatus === "PENDING" ? 30000 : 0), settings = useDashboardApi("/api/admin/settings"), update = useDashboardApi("/api/admin/update");
  const plans = useDashboardApi("/api/admin/plans?options=1");
  const [form] = Form.useForm(), [settingsForm] = Form.useForm();
  const [filterForm] = Form.useForm();
  useEffect(() => {
    const showUsers = (status: string) => {
      setActiveTab("users"); setApprovalStatus(status); setActiveStatus(""); setQ(""); table.reset();
      filterForm.setFieldsValue({ status, active: "", q: "" });
    };
    const showPending = () => showUsers("PENDING");
    if (router.isReady && router.query.tab === "system-info") setActiveTab("system-info");
    if (router.isReady && router.query.tab === "global-settings") setActiveTab("global-settings");
    window.addEventListener("dashboard:pending-users", showPending);
    if (router.isReady && router.query.tab === "users") showUsers(router.query.status === "PENDING" ? "PENDING" : "");
    return () => window.removeEventListener("dashboard:pending-users", showPending);
  // Apply notification links on first load and when navigating within the admin page.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, router.query.tab, router.query.status, filterForm]);
  const editedEmail = Form.useWatch("email", form), editedRole = Form.useWatch("role", form);
  const editingSuperAdmin = editedEmail === "admin@gmail.com" && editedRole === "ADMIN";
  const save = async (url: string, data: any) => {
    setBusy(true); try { const r = await axios.post(url, data, { headers: users.headers, timeout: 100000 }); message.success(uiText(r.data.message || uiText("Tersimpan."))); return true; }
    catch (e: any) { message.error(uiText(e.response?.data?.message || uiText("Aksi gagal."))); return false; } finally { setBusy(false); }
  };
  const approve = async (id: string, status: "APPROVED" | "REJECTED") => {
    setBusy(true);
    try {
      const response = await axios.patch(`/api/admin/users/${id}/approval`, { approvalStatus: status }, { headers: users.headers });
      message.success(uiText(response.data.message)); users.reload();
      window.dispatchEvent(new Event("dashboard:users-updated"));
    } catch (error: any) { message.error(uiText(error.response?.data?.message || uiText("Persetujuan gagal disimpan."))); }
    finally { setBusy(false); }
  };
  const setActive = async (id: string, isActive: boolean) => {
    setBusy(true);
    try {
      const response = await axios.patch(`/api/admin/users/${id}/active`, { isActive }, { headers: users.headers });
      message.success(uiText(response.data.message)); users.reload();
    } catch (error: any) { message.error(uiText(error.response?.data?.message || uiText("Status pengguna gagal disimpan."))); }
    finally { setBusy(false); }
  };
  return <Space direction="vertical" style={{ width: "100%" }}>
    {users.error && <Alert type="error" message={uiText(users.error)} />}
    <Tabs activeKey={activeTab || (router.query.tab === "messaging-settings" ? "messaging-settings" : undefined)} onChange={setActiveTab} items={[
      ...(mainAdmin ? [{ key: "system-info", label: uiText("Informasi Sistem"), children: <SystemInformation /> }] : []),
      ...(mainAdmin ? [{ key: "dispatch-webhook", label: uiText("Webhook Status Pengiriman"), children: <DispatchWebhookSettings onViewLogs={() => openLogs("dispatch")} /> }, { key: "device-webhook", label: uiText("Webhook Perangkat"), children: <DeviceWebhookSettings onViewLogs={() => openLogs("device")} /> }, { key: "webhook-logs", label: uiText("Log Pengiriman Webhook"), children: <WebhookLogs key={logType} initialType={logType} /> }] : []),
      { key: "users", label: ui("Manage Users"), children: <Space direction="vertical" style={{ width: "100%" }}><Alert type="info" showIcon message={uiText("Pendaftaran mandiri perlu persetujuan admin. Pengguna yang ditambahkan admin langsung dapat masuk.")} /><Space wrap><Button type="primary" onClick={() => { form.resetFields(); setOpen(true); }}>{ui("Tambah Pengguna")}</Button></Space><Card title={uiText("Pencarian")}><Form form={filterForm} layout="vertical" colon={false} className="dashboard-filter-grid" onFinish={values => { setApprovalStatus(values.status || ""); setActiveStatus(values.active || ""); setQ(values.q || ""); table.reset(); users.reload(); }}><Form.Item name="status" label={uiText("Status persetujuan")}><FilterSelect allLabel={uiText("Semua status persetujuan")} options={[{ value: "PENDING", label: uiText("Menunggu persetujuan") }, { value: "APPROVED", label: uiText("Disetujui") }, { value: "REJECTED", label: uiText("Ditolak") }]} /></Form.Item><Form.Item name="active" label={uiText("Status user")}><FilterSelect allLabel={uiText("Semua status user")} options={[{ value: "true", label: uiText("Aktif") }, { value: "false", label: uiText("Tidak aktif") }]} /></Form.Item><Form.Item name="q" label={uiText("Nama / email")}><Input allowClear placeholder={uiText("Cari pengguna")} /></Form.Item><div className="dashboard-filter-actions"><Button type="primary" htmlType="submit">{uiText("Cari")}</Button></div></Form></Card>
        <Table className="table-with-data-count" rowKey="id" scroll={{ x: true }} dataSource={users.data?.data || []} table={table} total={users.data?.total} columns={[{ title: ui("Nama"), dataIndex: "name" }, { title: uiText("Email"), dataIndex: "email" }, { title: uiText("Role"), dataIndex: "role" }, { title: uiText("Status persetujuan"), dataIndex: "approvalStatus", render: value => <Tag color={value === "APPROVED" ? "green" : value === "REJECTED" ? "red" : "gold"}>{value === "APPROVED" ? uiText("Disetujui") : value === "REJECTED" ? uiText("Ditolak") : uiText("Menunggu persetujuan")}</Tag> }, { title: uiText("Status user"), dataIndex: "isActive", render: value => <Tag color={value ? "green" : "default"}>{value ? uiText("Aktif") : uiText("Tidak aktif")}</Tag> }, { title: uiText("Perangkat / batas"), dataIndex: "deviceLimit", render: (_, r: any) => r.email === "admin@gmail.com" && r.role === "ADMIN" ? String(r._count.phones) : `${r._count.phones} / ${r.deviceLimit}` }, { title: ui("Paket"), dataIndex: "plan" }, { title: ui("Aksi"), key: "aksi", width: 120, render: (_, r: any) => <ActionDropdown ariaLabel={uiText("Aksi pengguna {{v0}}", { v0: r.name || r.email })} items={[
          ...(r.approvalStatus !== "APPROVED" ? [{ key: "approve", label: uiText("Setujui"), icon: <CheckOutlined />, disabled: busy, onClick: () => approve(r.id, "APPROVED") }] : []),
          ...(r.approvalStatus === "PENDING" ? [{ key: "reject", label: uiText("Tolak"), icon: <CloseOutlined />, danger: true, disabled: busy, onClick: () => modal.confirm({ title: uiText("Tolak pendaftaran pengguna ini?"), content: r.name || r.email, okText: uiText("Tolak"), cancelText: uiText("Batal"), okButtonProps: { danger: true }, onOk: () => approve(r.id, "REJECTED") }) }] : []),
          ...(r.email !== "admin@gmail.com" ? [{ key: "active", label: r.isActive ? "Nonaktifkan" : "Aktifkan", icon: <PoweroffOutlined />, disabled: busy, danger: r.isActive, onClick: () => r.isActive ? modal.confirm({ title: uiText("Nonaktifkan pengguna ini?"), content: uiText("{{v0}} tidak dapat login dan sesi yang berjalan akan dikeluarkan.", { v0: r.name || r.email }), okText: uiText("Nonaktifkan"), cancelText: uiText("Batal"), okButtonProps: { danger: true }, onOk: () => setActive(r.id, false) }) : setActive(r.id, true) }] : []),
          { key: "edit", label: ui("Edit"), icon: <EditOutlined />, onClick: () => { form.setFieldsValue({ ...r, password: undefined, subscriptionExpiresAt: r.subscriptionExpiresAt ? dayjs(r.subscriptionExpiresAt) : null }); setOpen(true); } },
          { key: "token", label: uiText("Token user"), icon: <KeyOutlined />, onClick: () => setTokenUser({ id: r.id, name: r.name, email: r.email, token: r.token }) },
        ]} /> }]} /></Space> },
      { key: "messaging-settings", label: uiText("Pesan dan notifikasi"), children: <MessagingPreferences /> },
      { key: "global-settings", label: uiText("Pengaturan Global"), children: <GlobalSettings /> },
      { key: "server", label: ui("Server Settings"), children: <Space direction="vertical" style={{ width: "100%" }}>
        {settings.error && <Alert type="error" message={uiText(settings.error)} />}
        <Alert type="info" message={uiText("Node {{v0}} · Koneksi: {{v1}} · Port aktif: {{v2}}", { v0: settings.data?.runtime.nodeVersion || "—", v1: settings.data?.runtime.connected ? uiText("Terhubung") : "—", v2: settings.data?.runtime.port || "—" })} description={uiText("Konfigurasi ini menyimpan profil server. Perubahan port/URL runtime perlu diterapkan melalui environment dan restart terkontrol.")} />
        <Button onClick={() => settingsForm.setFieldsValue(settings.data?.settings || { serverType: "VPS", nodeUrl: "http://127.0.0.1", nodePort: 3000 })}>{ui("Muat konfigurasi")}</Button>
        <Form form={settingsForm} layout="vertical" onFinish={async v => { if (await save("/api/admin/settings", v)) settings.reload(); }}><Form.Item name="serverType" label={uiText("Server type")} rules={[{ required: true }]}><Select options={["VPS", "LOCALHOST", "SHARED_HOSTING"].map(value => ({ value, label: value }))} /></Form.Item><Form.Item name="nodeUrl" label={uiText("Node URL")} rules={[{ required: true }]}><Input /></Form.Item><Form.Item name="nodePort" label={uiText("Node port")} rules={[{ required: true }]}><InputNumber min={1} max={65535} /></Form.Item><Button htmlType="submit" loading={busy}>{ui("Simpan")}</Button></Form>
        <Card title={uiText("SSL Certificate (VPS)")}><Form layout="vertical" onFinish={v => save("/api/admin/settings", { ...v, action: "ssl" })}><Form.Item name="domain" label={uiText("Domain")} rules={[{ required: true }]}><Input /></Form.Item><Form.Item name="email" label={uiText("Email")} rules={[{ required: true, type: "email" }]}><Input /></Form.Item><Button htmlType="submit" loading={busy}>{uiText("Generate Certificate")}</Button></Form></Card></Space> },
      { key: "update", label: ui("Update Sistem"), children: <Card title={uiText("Versi {{v0}}", { v0: update.data?.version || "—" })}>
        {update.error && <Alert type="error" message={uiText(update.error)} />}
        <p>{uiText("Migration belum diterapkan:")} {(update.data?.pendingMigrations || []).join(", ") || uiText("Tidak ada")}</p>
        <Button onClick={update.reload}>{ui("Periksa status")}</Button><p>{uiText("Update dilakukan melalui deployment: backup database/source, pasang dependency terkunci, jalankan migration, build, lalu restart aplikasi. Panduan ada di deployment/upgrade-jeblast.md.")}</p>
      </Card> },
    ]} />
    <Modal title={ui("Pengguna")} open={open} onCancel={() => !busy && setOpen(false)} footer={null}><Form form={form} layout="vertical" initialValues={{ role: "USER", isActive: true, deviceLimit: 100, plan: "Standard" }} onFinish={async values => { if (await save("/api/admin/users", { ...values, password: values.password || undefined, subscriptionExpiresAt: values.subscriptionExpiresAt?.toISOString() || null })) { setOpen(false); users.reload(); } }}>
      <Form.Item name="id" hidden><Input /></Form.Item><Form.Item name="name" label={ui("Nama")} rules={[{ required: true }]}><Input /></Form.Item><Form.Item name="email" label={uiText("Email")} rules={[{ required: true, type: "email" }]}><Input /></Form.Item><Form.Item name="password" label={uiText("Kata sandi baru (min. 6 karakter; kosong = pertahankan)")} rules={[{ min: 6, message: uiText("Kata sandi minimal 6 karakter.") }]}><Input.Password /></Form.Item><Form.Item name="role" label={uiText("Role")}><Select options={[{ value: "USER", label: uiText("User") }, { value: "ADMIN", label: uiText("Admin") }]} /></Form.Item><Form.Item hidden={editingSuperAdmin} name="isActive" valuePropName="checked" label={uiText("Status user")} extra={uiText("User tidak aktif tidak dapat login dan sesi yang berjalan akan dikeluarkan.")}><Switch checkedChildren={uiText("Aktif")} unCheckedChildren={uiText("Tidak aktif")} /></Form.Item><Form.Item hidden={editingSuperAdmin} name="plan" label={ui("Paket")} rules={[{ required: true }]}><Select showSearch optionFilterProp="label" options={(plans.data || []).map((plan: any) => ({ value: plan.name, label: uiText("{{v0}} ({{v1}} device)", { v0: plan.name, v1: plan.deviceLimit }), disabled: !plan.active && form.getFieldValue("plan") !== plan.name }))} onChange={name => { const plan = (plans.data || []).find((item: any) => item.name === name); if (plan) form.setFieldValue("deviceLimit", plan.deviceLimit); }} /></Form.Item><Form.Item hidden={editingSuperAdmin} name="deviceLimit" label={ui("Limit device")}><InputNumber min={0} max={10000} /></Form.Item><Form.Item hidden={editingSuperAdmin} name="subscriptionExpiresAt" label={ui("Tanggal berakhir paket")}><DatePicker showTime={{ format: "HH:mm", use12Hours: false }} format="DD/MM/YYYY HH:mm" style={{ width: "100%" }} /></Form.Item><Button type="primary" htmlType="submit" loading={busy}>{ui("Simpan")}</Button>
    </Form></Modal>
    <Modal title={uiText("Token API user")} open={!!tokenUser} onCancel={() => setTokenUser(undefined)} destroyOnHidden
      footer={<Button onClick={() => setTokenUser(undefined)}>{uiText("Tutup")}</Button>}>
      <p><strong>{tokenUser?.name || uiText("Pengguna")}</strong><br />{tokenUser?.email}</p>
      <Space.Compact style={{ width: "100%", marginBottom: 16 }}>
        <Input.Password value={tokenUser?.token || ""} readOnly autoComplete="off" aria-label={uiText("Token API user")} style={{ fontFamily: "monospace" }} />
        <Button icon={<CopyOutlined />} disabled={!tokenUser?.token} onClick={async () => {
          try { await navigator.clipboard.writeText(tokenUser!.token); message.success(uiText("Token user disalin.")); }
          catch { message.error(uiText("Token belum dapat disalin. Tampilkan token lalu salin secara manual.")); }
        }}>{uiText("Salin")}</Button>
      </Space.Compact>
    </Modal>
    {modalContext}
  </Space>;
}
Admin.getLayout = (page: ReactElement) => <Layout title="ADMIN PANEL">{page}</Layout>;
export const getServerSideProps = superAdminPageProps;
