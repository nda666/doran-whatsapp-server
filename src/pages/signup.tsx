import React, { ReactElement, useState } from "react";
import { Form, Typography, Alert, Space, Button } from "antd";
import SignupForm, { SignupData } from "@/components/auth/SignupForm";
import { NextPageWithLayout } from "./_app";
import GuestLayout from "@/components/GuestLayout";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import { i18n, useTranslation } from "next-i18next";
import axios, { AxiosError } from "axios";
import Link from "next/link";

const Signup: NextPageWithLayout = () => {
  const [state, setState] = useState({
    alert: "" as "error" | "success" | "info" | "warning" | undefined,
    message: "",
    loading: false,
  });
  const [form] = Form.useForm<SignupData>();
  const { t } = useTranslation("common");
  const onSubmit = async (data: SignupData) => {
    setState({ ...state, alert: undefined, message: "", loading: true });
    try {
      await axios.post("/api/signup", data);
    } catch (e) {
      if (e instanceof AxiosError) {
        setState({
          ...state,
          loading: false,
          alert: "error",
          message: e.response?.data?.message
            ? e.response?.data?.message
            : e.message,
        });
      }
      return false;
    }
    form.resetFields();
    setState({
      ...state,
      loading: false,
      alert: "success",
      message: t("signup_success"),
    });
  };
  return (
    <>
      <Space direction="vertical">
        {state.alert && <Alert message={state.message} type={state.alert} />}
        <SignupForm loading={state.loading} onSubmit={onSubmit} form={form} />
        <Space direction="horizontal">
          <Typography.Text>{t("have_account").toString()}</Typography.Text>
          <Link href="/signin">{t("signin").toString()}</Link>
        </Space>
      </Space>
    </>
  );
};

Signup.getLayout = function getLayout(page: ReactElement) {
  const title = () => i18n?.t("signup") || "";
  return <GuestLayout title={title().toUpperCase()}>{page}</GuestLayout>;
};

export const getStaticProps = async ({ locale }: { locale: any }) => ({
  props: {
    ...(await serverSideTranslations(locale, ["common"])),
  },
});

export default Signup;
