import React, { ReactElement, useState } from "react";
import { Form, Typography, Alert, Space, Button } from "antd";
import SigninForm, { SigninData } from "@/components/auth/SigninForm";
import { NextPageWithLayout } from "./_app";
import GuestLayout from "@/components/GuestLayout";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import { i18n, useTranslation } from "next-i18next";
import axios, { AxiosError } from "axios";
import Link from "next/link";
import type {
  GetServerSidePropsContext,
  InferGetServerSidePropsType,
} from "next";
import { getCsrfToken, signIn } from "next-auth/react";
import Router, { useRouter } from "next/router";
import { redirect } from "next/navigation";

const Signin = ({
  csrfToken,
}: InferGetServerSidePropsType<typeof getServerSideProps>) => {
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
    const res = await signIn("credentials", {
      redirect: false,
      email: data.email,
      password: data.password,
    });
    setState({
      ...state,
      loading: false,
      alert: res?.ok ? "success" : "error",
      message: !res?.ok
        ? res?.error?.toString()!
        : t("login_success").toString(),
    });

    if (res?.ok) {
      form.resetFields();
      Router.replace("/dashboard");
    }
  };
  return (
    <>
      <Space direction="vertical">
        {state.alert && <Alert message={state.message} type={state.alert} />}
        <SigninForm loading={state.loading} onSubmit={onSubmit} form={form} />
        <Space direction="horizontal">
          <Typography.Text>{t("dont_have_account").toString()}</Typography.Text>
          <Link href="/signup">{t("signup").toString()}</Link>
        </Space>
      </Space>
    </>
  );
};

Signin.getLayout = function getLayout(page: ReactElement) {
  const title = () => i18n?.t("Signin") || "";
  return <GuestLayout title={title().toUpperCase()}>{page}</GuestLayout>;
};

export async function getServerSideProps(context: GetServerSidePropsContext) {
  const csrfToken = await getCsrfToken(context);
  return {
    props: {
      ...(await serverSideTranslations(context?.locale!, ["common"])),
      csrfToken: csrfToken || null,
    },
  };
}

export default Signin;
