"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importStar(require("react"));
const antd_1 = require("antd");
const next_i18next_1 = require("next-i18next");
const PhoneFormModal = (0, react_1.forwardRef)(({ open, onSubmit, onCancel, editPhone, ...props }, ref) => {
    const { t } = (0, next_i18next_1.useTranslation)("common");
    const [form] = antd_1.Form.useForm();
    (0, react_1.useEffect)(() => {
        if (editPhone) {
            form.setFieldValue("id", editPhone.id);
            form.setFieldValue("name", editPhone.name);
        }
        return () => {
            form.resetFields();
        };
    }, [editPhone]);
    const resetForm = () => {
        form.resetFields();
    };
    (0, react_1.useImperativeHandle)(ref, () => ({
        resetForm,
    }));
    return (<antd_1.Modal open={open} title={props.title || ""} okText={t("save")} cancelText={t("cancel")} onCancel={onCancel} okButtonProps={{
            loading: props === null || props === void 0 ? void 0 : props.loading,
        }} cancelButtonProps={{
            disabled: props === null || props === void 0 ? void 0 : props.loading,
        }} onOk={() => {
            form === null || form === void 0 ? void 0 : form.validateFields().then((values) => {
                onSubmit(values);
            }).catch((info) => { });
        }}>
        <antd_1.Form disabled={props === null || props === void 0 ? void 0 : props.loading} form={form} layout="vertical" name="phone-form" initialValues={{ modifier: "public" }}>
          <antd_1.Form.Item name="id" hidden>
            <antd_1.Input />
          </antd_1.Form.Item>
          <antd_1.Form.Item name="name" label={t("name")} rules={[
            {
                required: true,
                message: t("validation.required", {
                    field: t("name"),
                }).toString(),
            },
        ]}>
            <antd_1.Input />
          </antd_1.Form.Item>
        </antd_1.Form>
      </antd_1.Modal>);
});
PhoneFormModal.displayName = "PhoneFormModal";
exports.default = PhoneFormModal;
