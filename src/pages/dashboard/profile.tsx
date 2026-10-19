import { useUiTranslation } from "@/lib/uiTranslation";
import { ReactElement, useEffect, useState } from "react";
import { Alert, Button, Card, Form, Input, Space, Spin, Typography, message } from "antd";
import { CopyOutlined } from "@ant-design/icons";
import axios from "axios";
import { useSession } from "next-auth/react";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import Layout from "@/components/Layout";
import { isSuperAdmin } from "@/lib/access";

type Profile = { id: string; name: string | null; email: string | null; token: string };
type ProfileValues = { name: string; email: string; currentPassword?: string };

export default function ProfilePage() {
  const uiText = useUiTranslation();
  const { data: session, status, update } = useSession();
  const userId = session?.user?.id;
  const [form] = Form.useForm<ProfileValues>();
  const [profile, setProfile] = useState<Profile>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const email = Form.useWatch("email", form);
  const emailChanged = !!profile && email?.trim().toLowerCase() !== profile.email;
  const admin = !!session?.user && isSuperAdmin(session.user);

  useEffect(() => {
    if (status === "loading") return;
    if (!userId) { setLoading(false); setProfile(undefined); return; }
    const controller = new AbortController();
    setLoading(true);
    setError("");
    // The profile page uses the signed-in session, including the existing origin check on writes.
    axios.get<Profile>("/api/profile", { signal: controller.signal, timeout: 15000 })
      .then(({ data }) => { setProfile(data); form.setFieldsValue({ name: data.name || "", email: data.email || "", currentPassword: "" }); })
      .catch(error => { if (!controller.signal.aborted) setError(error.response?.data?.message || "Profil belum dapat dimuat."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [status, userId, form, retry]);

  const save = async (values: ProfileValues) => {
    setBusy(true);
    try {
      const { data } = await axios.patch<Profile>("/api/profile", {
        name: values.name, email: values.email,
        ...(emailChanged ? { currentPassword: values.currentPassword } : {}),
      }, { timeout: 15000 });
      setProfile(data);
      form.setFieldsValue({ name: data.name || "", email: data.email || "", currentPassword: "" });
      message.success(uiText("Profil berhasil disimpan."));
      try { await update(); } catch { message.warning(uiText("Profil tersimpan. Muat ulang halaman untuk memperbarui nama di navbar.")); }
    } catch (error: unknown) {
      message.error(uiText(axios.isAxiosError(error) ? error.response?.data?.message || uiText("Profil belum berhasil disimpan.") : uiText("Profil belum berhasil disimpan.")));
    } finally { setBusy(false); }
  };

  if (loading) return <Spin tip={uiText("Memuat profil...")}><div style={{ minHeight: 160 }} /></Spin>;
  if (!session?.user) return <Alert type="error" showIcon message={uiText("Silakan login kembali untuk membuka profil.")} />;
  if (error || !profile) return <Alert type="error" showIcon message={uiText(error || uiText("Profil belum tersedia."))} action={<Button onClick={() => setRetry(value => value + 1)}>{uiText("Coba lagi")}</Button>} />;

  return <Space direction="vertical" size="large" style={{ width: "100%", maxWidth: 720 }}>
    <Card title={uiText("Edit profil")}>
      <Form form={form} layout="vertical" onFinish={save} disabled={busy} requiredMark={false}>
        <Form.Item name="name" label={uiText("Nama")} rules={[{ required: true, whitespace: true, message: uiText("Nama wajib diisi.") }, { max: 200 }]}>
          <Input autoComplete="name" maxLength={200} />
        </Form.Item>
        <Form.Item name="email" label={uiText("Email")} extra={admin ? uiText("Email administrator utama tidak dapat diubah.") : uiText("Gunakan email ini untuk login.")}
          rules={[{ required: true, message: uiText("Email wajib diisi.") }, { type: "email", message: uiText("Email tidak valid.") }, { max: 200 }]}>
          <Input autoComplete="email" maxLength={200} disabled={busy || admin} />
        </Form.Item>
        {emailChanged && !admin && <Form.Item name="currentPassword" label={uiText("Kata sandi saat ini")} extra={uiText("Diperlukan untuk mengonfirmasi perubahan email.")} rules={[{ required: true, message: uiText("Masukkan password saat ini.") }, { min: 6, message: uiText("Kata sandi minimal 6 karakter.") }]}>
          <Input.Password autoComplete="current-password" maxLength={72} />
        </Form.Item>}
        <Button type="primary" htmlType="submit" loading={busy}>{uiText("Simpan perubahan")}</Button>
      </Form>
    </Card>
    <div id="token-user" style={{ scrollMarginTop: 100 }}>
      <Card title={uiText("Token API user")}>
        <Typography.Paragraph>{uiText("Token ini milik akun Anda dan berbeda dari token pada masing-masing device.")}</Typography.Paragraph>
        <Space.Compact style={{ width: "100%", marginBottom: 16 }}>
          <Input.Password value={profile.token} readOnly aria-label={uiText("Token API user")} autoComplete="off" style={{ fontFamily: "monospace" }} />
          <Button icon={<CopyOutlined />} onClick={async () => {
            try { await navigator.clipboard.writeText(profile.token); message.success(uiText("Token user disalin.")); }
            catch { message.error(uiText("Token belum dapat disalin. Tampilkan token lalu salin secara manual.")); }
          }}>{uiText("Salin")}</Button>
        </Space.Compact>
        <Alert type="info" showIcon message={uiText("Simpan token di server aplikasi Anda dan jangan bagikan kepada orang lain. Endpoint pengiriman yang saat ini memakai token device tetap menggunakan token device.")} />
      </Card>
    </div>
  </Space>;
}

ProfilePage.getLayout = (page: ReactElement) => <Layout title="PROFIL SAYA">{page}</Layout>;
export const getStaticProps = async ({ locale }: { locale: string }) => ({ props: { ...(await serverSideTranslations(locale, ["common", "upgrade", "interface"])) } });
