import { useUiTranslation } from "@/lib/uiTranslation";
import { Form, Input, Button, FormInstance } from "antd";
import { useLocalizedTranslation as useTranslation } from "@/lib/uiTranslation";
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
  const uiText = useUiTranslation();
  const { t } = useTranslation("common");
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
            message: t("validation.required", {
              field: t("name", { ns: "common" }),
              ns: "common",
            }).toString(),
          },
        ]}
      >
        <Input />
      </Form.Item>
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
          {
            max: 72,
            message: uiText("Kata sandi maksimal 72 karakter."),
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
            message: t("validation.password_confirm", { ns: "common" }).toString(),
          },
          ({ getFieldValue }) => ({
            validator(_, value) {
              if (!value || getFieldValue("password") === value) {
                return Promise.resolve();
              }
              return Promise.reject(
                new Error(t("validation.password_not_match", { ns: "common", defaultValue: "Konfirmasi kata sandi tidak sama." }).toString())
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
