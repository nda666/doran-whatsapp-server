import { useUiTranslation } from "@/lib/uiTranslation";
import React, { ReactElement, useState } from "react";
import { Form, Typography, Alert, Space } from "antd";
import SigninForm, { SigninData } from "@/components/auth/SigninForm";
import GuestLayout from "@/components/GuestLayout";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import { useLocalizedTranslation as useTranslation } from "@/lib/uiTranslation";
import Link from "next/link";
import type {
  GetServerSidePropsContext,
  InferGetServerSidePropsType,
} from "next";
import { getCsrfToken, signIn } from "next-auth/react";
import { useRouter } from "next/router";
import { localizedPath } from "@/lib/localizedPath";

const Signin = ({
  csrfToken,
}: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  const uiText = useUiTranslation();
  const [state, setState] = useState({
    alert: "" as "error" | "success" | "info" | "warning" | undefined,
    message: "",
    loading: false,
  });
  const [form] = Form.useForm<SigninData>();
  const { t } = useTranslation("common");
  const router = useRouter();
  const onSubmit = async (data: SigninData) => {
    setState({ ...state, alert: undefined, message: "", loading: true });
    try {
      const dashboardUrl = localizedPath("/dashboard", router.locale);
      const res = await signIn("credentials", {
        redirect: false,
        callbackUrl: dashboardUrl,
        email: data.email,
        password: data.password,
      });

      if (res?.ok && !res.error) {
        // Reload with the new session cookie, bypassing cached guest redirects.
        window.location.replace(dashboardUrl);
        return;
      }

      setState({
        loading: false,
        alert: "error",
        message: res?.error || "Login belum berhasil. Silakan coba lagi.",
      });
    } catch {
      setState({
        loading: false,
        alert: "error",
        message: "Login belum berhasil. Silakan coba lagi.",
      });
    }
  };
  return (
    <>
      <Space direction="vertical">
        {state.alert && <Alert message={uiText(state.message)} type={state.alert} />}
        <SigninForm loading={state.loading} onSubmit={onSubmit} form={form} />
        <Link href="/forgot-password">{uiText("Lupa password?")}</Link>
        <Space direction="horizontal">
          <Typography.Text>{t("dont_have_account").toString()}</Typography.Text>
          <Link href="/signup">{t("signup").toString()}</Link>
        </Space>
      </Space>
    </>
  );
};

Signin.getLayout = function getLayout(page: ReactElement) {
  return <GuestLayout title="Masuk">{page}</GuestLayout>;
};

export async function getServerSideProps(context: GetServerSidePropsContext) {
  const csrfToken = await getCsrfToken(context);
  return {
    props: {
      ...(await serverSideTranslations(context?.locale!, ["common", "interface"])),
      csrfToken: csrfToken || null,
    },
  };
}

export default Signin;
