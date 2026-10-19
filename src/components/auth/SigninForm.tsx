import { useUiTranslation } from "@/lib/uiTranslation";
import { Form, Input, Button, FormInstance } from "antd";
import { useLocalizedTranslation as useTranslation } from "@/lib/uiTranslation";
export type SigninData = {
  email: string;
  password: string;
  csrfToken: string;
};
type SigninFormProps = {
  loading?: boolean;
  onSubmit: (data: SigninData) => void;
  form: FormInstance<SigninData> | undefined;
};
const SigninForm = ({ onSubmit, loading, form }: SigninFormProps) => {
  const uiText = useUiTranslation();
  const { t } = useTranslation("common");
  const _onSubmit = (data: SigninData) => {
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
        label={uiText("Email")}
        name="email"
        rules={[
          {
            required: true,
            message: uiText("Please enter your email!"),
          },
          {
            required: true,
            type: "email",
            message: uiText("Please enter valid E-mail!"),
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
            message: t("validation.required", {
              field: t("password", { ns: "common" }),
              ns: "common",
            }).toString(),
          },
          {
            min: 6,
            message: t("validation.min", {
              field: t("password", { ns: "common" }),
              value: 6,
              ns: "common",
            }).toString(),
          },
        ]}
      >
        <Input.Password />
      </Form.Item>

      <Form.Item wrapperCol={{ xs: { span: 24 }, sm: { offset: 9, span: 17 } }}>
        <Button loading={loading} block type="primary" htmlType="submit">
          {t("signin", { ns: "common" })}
        </Button>
      </Form.Item>
    </Form>
  );
};

export default SigninForm;
