import { Form, Input, Button, FormInstance } from "antd";
import { useTranslation } from "next-i18next";
export type SignupData = {
  name: string;
  email: string;
  password: string;
  passwordConfirm: string;
};
type SignupFormProps = {
  loading?: boolean;
  onSubmit: (data: SignupData) => void;
  form: FormInstance<SignupData> | undefined;
};
const SignupForm = ({ onSubmit, loading, form }: SignupFormProps) => {
  const { t } = useTranslation(["translation", "common"]);
  const _onSubmit = (data: SignupData) => {
    onSubmit(data);
  };

  return (
    <Form
      form={form}
      disabled={loading}
      labelCol={{ span: 9 }}
      wrapperCol={{ span: 17 }}
      onFinish={_onSubmit}
    >
      <Form.Item
        label={t("name", { ns: "common" })}
        name="name"
        rules={[
          {
            required: true,
            message: t("required", {
              field: t("name", { ns: "common" }),
              ns: "form",
            }).toString(),
          },
        ]}
      >
        <Input />
      </Form.Item>
      <Form.Item
        label="Email"
        name="email"
        rules={[
          {
            required: true,
            message: "Please enter your email!",
          },
          {
            required: true,
            type: "email",
            message: "Please enter valid E-mail!",
          },
        ]}
      >
        <Input />
      </Form.Item>

      <Form.Item
        label={t("password", { ns: "common" })}
        name="password"
        rules={[
          {
            required: true,
            message: t("required", {
              field: t("password", { ns: "common" }),
              ns: "form",
            }).toString(),
          },
          {
            min: 6,
            message: t("min", {
              field: t("password", { ns: "common" }),
              value: 6,
              ns: "form",
            }).toString(),
          },
        ]}
      >
        <Input.Password />
      </Form.Item>

      <Form.Item
        label={t("passwordConfirm", { ns: "common" })}
        name="passwordConfirm"
        rules={[
          {
            required: true,
            message: t("password_confirm", { ns: "form" }).toString(),
          },
          ({ getFieldValue }) => ({
            validator(_, value) {
              if (!value || getFieldValue("password") === value) {
                return Promise.resolve();
              }
              return Promise.reject(
                new Error(t("password_not_match", { ns: "form" }).toString())
              );
            },
          }),
        ]}
      >
        <Input.Password />
      </Form.Item>

      <Form.Item wrapperCol={{ xs: { span: 24 }, sm: { offset: 9, span: 17 } }}>
        <Button loading={loading} block type="primary" htmlType="submit">
          {t("signup", { ns: "common" })}
        </Button>
      </Form.Item>
    </Form>
  );
};

export default SignupForm;
