import { useUiTranslation } from "@/lib/uiTranslation";
import { useEffect, useRef, useState } from "react";
import { signOut } from "next-auth/react";
import { Alert, Button, Space } from "antd";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import { useRouter } from "next/router";
import { localizedPath } from "@/lib/localizedPath";

const Signout = () => {
  const uiText = useUiTranslation();
  const { locale } = useRouter();
  const pending = useRef(false);
  const [failed, setFailed] = useState(false);
  const logout = async () => {
    if (pending.current) return;
    pending.current = true; setFailed(false);
    try { await signOut({ callbackUrl: localizedPath("/signin", locale), redirect: true }); }
    catch { pending.current = false; setFailed(true); }
  };
  useEffect(() => {
    void logout();
    // Execute once per mounted page; the ref also prevents duplicate StrictMode requests.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return failed ? <Space direction="vertical"><Alert type="error" message={uiText("Logout belum berhasil. Silakan coba lagi.")} /><Button onClick={() => void logout()}>{uiText("Coba logout lagi")}</Button></Space> : <p>{uiText("Sedang keluar...")}</p>;
};

export default Signout;
export const getStaticProps = async ({ locale }: { locale: string }) => ({ props: { ...(await serverSideTranslations(locale, ["common", "interface"])) } });
