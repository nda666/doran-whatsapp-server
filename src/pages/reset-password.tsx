import { useUiTranslation } from "@/lib/uiTranslation";
import { ReactElement, useEffect, useRef, useState } from "react";
import { Alert, Button, Form, Input, Space } from "antd";
import axios from "axios";
import Head from "next/head";
import Link from "next/link";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import GuestLayout from "@/components/GuestLayout";

export default function ResetPassword() {
  const uiText = useUiTranslation();
  const [token, setToken] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [notice, setNotice] = useState("");
  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const value = new URLSearchParams(window.location.hash.slice(1)).get("token") || "";
    setToken(/^[a-f0-9]{64}$/.test(value) ? value : "");
    setReady(true);
    // Keep the fragment during hydration/remounts so the next page instance can read it.
    // Fragments are not sent in HTTP requests; clear it only after a successful reset.
  }, []);
  const submit = async (values: { password: string; passwordConfirm: string }) => {
    setBusy(true); setNotice("");
    try {
      const response = await axios.post("/api/reset-password", { ...values, token }, { timeout: 25000 });
      setDone(true); setToken(""); setNotice(uiText(response.data.message));
      window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
    } catch (error: unknown) {
      setNotice(uiText(axios.isAxiosError(error) ? error.response?.data?.message || uiText("Password belum dapat diubah.") : uiText("Password belum dapat diubah.")));
    } finally { setBusy(false); }
  };
  return <Space direction="vertical" size="middle" style={{ width: "100%", maxWidth: 420 }}>
    <Head><meta name="referrer" content="no-referrer" /><meta name="robots" content="noindex, nofollow" /></Head>
    {notice && <Alert type={done ? "success" : "error"} showIcon message={uiText(notice)} />}
    {ready && !token && !done && <Alert type="error" showIcon message={uiText("Tautan reset tidak valid. Minta tautan baru.")} />}
    {ready && !!token && !done && <Form layout="vertical" onFinish={submit} disabled={busy} requiredMark={false}>
      <Form.Item name="password" label={uiText("Password baru")} rules={[{ required: true, message: uiText("Password wajib diisi.") }, { min: 6, message: uiText("Password minimal 6 karakter.") }, { max: 72 }, { validator: (_, value: string) => !value || new TextEncoder().encode(value).length <= 72 ? Promise.resolve() : Promise.reject(new Error(uiText("Password maksimal 72 byte."))) }]}><Input.Password autoComplete="new-password" maxLength={72} /></Form.Item>
      <Form.Item name="passwordConfirm" label={uiText("Konfirmasi password")} dependencies={["password"]} rules={[{ required: true, message: uiText("Konfirmasi password wajib diisi.") }, ({ getFieldValue }) => ({ validator: (_, value: string) => !value || getFieldValue("password") === value ? Promise.resolve() : Promise.reject(new Error(uiText("Konfirmasi password tidak sama."))) })]}><Input.Password autoComplete="new-password" maxLength={72} /></Form.Item>
      <Button type="primary" block htmlType="submit" loading={busy}>{uiText("Simpan password baru")}</Button>
    </Form>}
    {done ? <Link href="/signin">{uiText("Login dengan password baru")}</Link> : <Link href="/forgot-password">{uiText("Minta tautan reset baru")}</Link>}
  </Space>;
}
ResetPassword.getLayout = (page: ReactElement) => <GuestLayout title="RESET PASSWORD">{page}</GuestLayout>;
export const getStaticProps = async ({ locale }: { locale: string }) => ({ props: { ...(await serverSideTranslations(locale, ["common", "interface"])) } });
