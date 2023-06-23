"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const antd_1 = require("antd");
const next_i18next_1 = require("next-i18next");
const SignupForm = ({ onSubmit, loading, form }) => {
    const { t } = (0, next_i18next_1.useTranslation)(["translation", "common"]);
    const _onSubmit = (data) => {
        onSubmit(data);
    };
    return (<antd_1.Form form={form} disabled={loading} labelCol={{ span: 9 }} wrapperCol={{ span: 17 }} onFinish={_onSubmit}>
      <antd_1.Form.Item label={t("name", { ns: "common" })} name="name" rules={[
            {
                required: true,
                message: t("required", {
                    field: t("name", { ns: "common" }),
                    ns: "form",
                }).toString(),
            },
        ]}>
        <antd_1.Input />
      </antd_1.Form.Item>
      <antd_1.Form.Item label="Email" name="email" rules={[
            {
                required: true,
                message: "Please enter your email!",
            },
            {
                required: true,
                type: "email",
                message: "Please enter valid E-mail!",
            },
        ]}>
        <antd_1.Input />
      </antd_1.Form.Item>

      <antd_1.Form.Item label={t("password", { ns: "common" })} name="password" rules={[
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
        ]}>
        <antd_1.Input.Password />
      </antd_1.Form.Item>

      <antd_1.Form.Item label={t("passwordConfirm", { ns: "common" })} name="passwordConfirm" rules={[
            {
                required: true,
                message: t("password_confirm", { ns: "form" }).toString(),
            },
            ({ getFieldValue }) => ({
                validator(_, value) {
                    if (!value || getFieldValue("password") === value) {
                        return Promise.resolve();
                    }
                    return Promise.reject(new Error(t("password_not_match", { ns: "form" }).toString()));
                },
            }),
        ]}>
        <antd_1.Input.Password />
      </antd_1.Form.Item>

      <antd_1.Form.Item wrapperCol={{ xs: { span: 24 }, sm: { offset: 9, span: 17 } }}>
        <antd_1.Button loading={loading} block type="primary" htmlType="submit">
          {t("signup", { ns: "common" })}
        </antd_1.Button>
      </antd_1.Form.Item>
    </antd_1.Form>);
};
exports.default = SignupForm;
