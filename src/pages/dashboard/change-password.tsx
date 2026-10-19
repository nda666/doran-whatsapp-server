import { useUiTranslation } from "@/lib/uiTranslation";
import { ReactElement, useState } from "react";
import { Alert, Button, Card, Form, Input, Space, message } from "antd";
import axios from "axios";
import { signOut } from "next-auth/react";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import Layout from "@/components/Layout";

type Values = { currentPassword: string; password: string; passwordConfirm: string };
export default function ChangePassword() {
  const uiText = useUiTranslation();
  const [form] = Form.useForm<Values>();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const submit = async (values: Values) => {
    setBusy(true); setError("");
    try {
      const response = await axios.post("/api/change-password", values, { timeout: 25000 });
      setDone(true); form.resetFields(); message.success(uiText(response.data.message));
      try { await signOut({ callbackUrl: "/signin", redirect: true }); }
      catch { window.location.assign("/signin"); }
    } catch (error: unknown) {
      setError(uiText(axios.isAxiosError(error) ? error.response?.data?.message || uiText("Kata sandi belum berhasil diubah.") : uiText("Kata sandi belum berhasil diubah.")));
    } finally { setBusy(false); }
  };
  const rules = [{ required: true, message: uiText("Kata sandi wajib diisi.") }, { min: 6, message: uiText("Kata sandi minimal 6 karakter.") }, { max: 72 },
    { validator: (_: unknown, value: string) => !value || new TextEncoder().encode(value).length <= 72 ? Promise.resolve() : Promise.reject(new Error(uiText("Kata sandi maksimal 72 byte."))) }];
  return <Card title={uiText("Ganti password")} style={{ maxWidth: 600 }}>
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Alert type="info" showIcon message={uiText("Setelah password berhasil diubah, Anda akan diminta login kembali. Sesi login sebelumnya akan berakhir.")} />
      {error && <Alert type="error" showIcon message={uiText(error)} />}
      {done && <Alert type="success" showIcon message={uiText("Kata sandi berhasil diubah. Mengarahkan ke halaman login...")} />}
      {!done && <Form form={form} layout="vertical" onFinish={submit} disabled={busy} requiredMark={false}>
        <Form.Item name="currentPassword" label={uiText("Kata sandi saat ini")} rules={rules}><Input.Password autoComplete="current-password" maxLength={72} /></Form.Item>
        <Form.Item name="password" label={uiText("Kata sandi baru")} dependencies={["currentPassword"]} rules={[...rules, ({ getFieldValue }) => ({ validator: (_: unknown, value: string) => !value || value !== getFieldValue("currentPassword") ? Promise.resolve() : Promise.reject(new Error(uiText("Kata sandi baru harus berbeda dari password saat ini."))) })]}><Input.Password autoComplete="new-password" maxLength={72} /></Form.Item>
        <Form.Item name="passwordConfirm" label={uiText("Konfirmasi kata sandi baru")} dependencies={["password"]} rules={[{ required: true, message: uiText("Konfirmasi kata sandi wajib diisi.") }, ({ getFieldValue }) => ({ validator: (_: unknown, value: string) => !value || value === getFieldValue("password") ? Promise.resolve() : Promise.reject(new Error(uiText("Konfirmasi kata sandi tidak sama."))) })]}><Input.Password autoComplete="new-password" maxLength={72} /></Form.Item>
        <Button type="primary" htmlType="submit" loading={busy}>{uiText("Simpan password baru")}</Button>
      </Form>}
    </Space>
  </Card>;
}
ChangePassword.getLayout = (page: ReactElement) => <Layout title="Ganti kata sandi">{page}</Layout>;
export const getStaticProps = async ({ locale }: { locale: string }) => ({ props: { ...(await serverSideTranslations(locale, ["common", "upgrade", "interface"])) } });
