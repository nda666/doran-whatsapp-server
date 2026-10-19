import { useUiTranslation } from "@/lib/uiTranslation";
import React, { ReactElement, useState } from "react";
import { Form, Typography, Alert, Space, Button } from "antd";
import SignupForm, { SignupData } from "@/components/auth/SignupForm";
import { NextPageWithLayout } from "./_app";
import GuestLayout from "@/components/GuestLayout";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import { useLocalizedTranslation as useTranslation } from "@/lib/uiTranslation";
import axios, { AxiosError } from "axios";
import Link from "next/link";

const Signup: NextPageWithLayout = () => {
  const uiText = useUiTranslation();
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
      const response = await axios.post("/api/signup", data);
      form.resetFields();
      setState({ alert: "success", loading: false, message: response.data.message });
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
  };
  return (
    <>
      <Space direction="vertical">
        <Alert type="info" showIcon message={uiText("Akun baru perlu persetujuan admin sebelum dapat masuk.")} />
        {state.alert && <Alert message={uiText(state.message)} type={state.alert} />}
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
  return <GuestLayout title="Daftar">{page}</GuestLayout>;
};

export const getStaticProps = async ({ locale }: { locale: any }) => ({
  props: {
    ...(await serverSideTranslations(locale, ["common", "interface"])),
  },
});

export default Signup;
