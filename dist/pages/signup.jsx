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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStaticProps = void 0;
const react_1 = __importStar(require("react"));
const antd_1 = require("antd");
const SignupForm_1 = __importDefault(require("@/components/auth/SignupForm"));
const GuestLayout_1 = __importDefault(require("@/components/GuestLayout"));
const serverSideTranslations_1 = require("next-i18next/serverSideTranslations");
const next_i18next_1 = require("next-i18next");
const axios_1 = __importStar(require("axios"));
const link_1 = __importDefault(require("next/link"));
const Signup = () => {
    const [state, setState] = (0, react_1.useState)({
        alert: "",
        message: "",
        loading: false,
    });
    const [form] = antd_1.Form.useForm();
    const { t } = (0, next_i18next_1.useTranslation)("common");
    const onSubmit = async (data) => {
        var _a, _b, _c, _d;
        setState({ ...state, alert: undefined, message: "", loading: true });
        try {
            await axios_1.default.post("/api/signup", data);
        }
        catch (e) {
            if (e instanceof axios_1.AxiosError) {
                setState({
                    ...state,
                    loading: false,
                    alert: "error",
                    message: ((_b = (_a = e.response) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.message)
                        ? (_d = (_c = e.response) === null || _c === void 0 ? void 0 : _c.data) === null || _d === void 0 ? void 0 : _d.message
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
    return (<>
      <antd_1.Space direction="vertical">
        {state.alert && <antd_1.Alert message={state.message} type={state.alert}/>}
        <SignupForm_1.default loading={state.loading} onSubmit={onSubmit} form={form}/>
        <antd_1.Space direction="horizontal">
          <antd_1.Typography.Text>{t("have_account").toString()}</antd_1.Typography.Text>
          <link_1.default href="/signin">{t("signin").toString()}</link_1.default>
        </antd_1.Space>
      </antd_1.Space>
    </>);
};
Signup.getLayout = function getLayout(page) {
    const title = () => (next_i18next_1.i18n === null || next_i18next_1.i18n === void 0 ? void 0 : next_i18next_1.i18n.t("signup")) || "";
    return <GuestLayout_1.default title={title().toUpperCase()}>{page}</GuestLayout_1.default>;
};
const getStaticProps = async ({ locale }) => ({
    props: {
        ...(await (0, serverSideTranslations_1.serverSideTranslations)(locale, ["common"])),
    },
});
exports.getStaticProps = getStaticProps;
exports.default = Signup;
