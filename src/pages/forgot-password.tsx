import { useUiTranslation } from "@/lib/uiTranslation";
import { ReactElement, useState } from "react";
import { Alert, Button, Form, Input, Space, Typography } from "antd";
import axios from "axios";
import Link from "next/link";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import GuestLayout from "@/components/GuestLayout";

export default function ForgotPassword() {
  const uiText = useUiTranslation();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string }>();
  const submit = async (values: { email: string }) => {
    setBusy(true); setNotice(uiText(undefined));
    try {
      const response = await axios.post("/api/forgot-password", values, { timeout: 25000 });
      setNotice(uiText({ type: "success", text: response.data.message }));
    } catch (error: unknown) {
      setNotice(uiText({ type: "error", text: axios.isAxiosError(error) ? error.response?.data?.message || uiText("Permintaan belum berhasil. Coba lagi nanti.") : uiText("Permintaan belum berhasil.") }));
    } finally { setBusy(false); }
  };
  return <Space direction="vertical" size="middle" style={{ width: "100%", maxWidth: 420 }}>
    <Typography.Paragraph>{uiText("Masukkan email akun Anda untuk menerima tautan reset password.")}</Typography.Paragraph>
    {notice && <Alert type={notice.type} showIcon message={uiText(notice.text)} />}
    <Form layout="vertical" disabled={busy} onFinish={submit} requiredMark={false}>
      <Form.Item name="email" label={uiText("Email")} rules={[{ required: true, message: uiText("Email wajib diisi.") }, { type: "email", message: uiText("Email tidak valid.") }, { max: 200 }]}><Input autoComplete="email" maxLength={200} /></Form.Item>
      <Button type="primary" block htmlType="submit" loading={busy}>{uiText("Kirim tautan reset")}</Button>
    </Form>
    <Link href="/signin">{uiText("Kembali ke login")}</Link>
  </Space>;
}
ForgotPassword.getLayout = (page: ReactElement) => <GuestLayout title="LUPA PASSWORD">{page}</GuestLayout>;
export const getStaticProps = async ({ locale }: { locale: string }) => ({ props: { ...(await serverSideTranslations(locale, ["common", "interface"])) } });
