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
exports.getServerSideProps = void 0;
const react_1 = __importStar(require("react"));
const antd_1 = require("antd");
const SigninForm_1 = __importDefault(require("@/components/auth/SigninForm"));
const GuestLayout_1 = __importDefault(require("@/components/GuestLayout"));
const serverSideTranslations_1 = require("next-i18next/serverSideTranslations");
const next_i18next_1 = require("next-i18next");
const link_1 = __importDefault(require("next/link"));
const react_2 = require("next-auth/react");
const router_1 = __importStar(require("next/router"));
const Signin = ({ csrfToken, }) => {
    const [state, setState] = (0, react_1.useState)({
        alert: "",
        message: "",
        loading: false,
    });
    const [form] = antd_1.Form.useForm();
    const { t } = (0, next_i18next_1.useTranslation)("common");
    const router = (0, router_1.useRouter)();
    const onSubmit = async (data) => {
        var _a;
        setState({ ...state, alert: undefined, message: "", loading: true });
        const res = await (0, react_2.signIn)("credentials", {
            redirect: false,
            email: data.email,
            password: data.password,
        });
        setState({
            ...state,
            loading: false,
            alert: (res === null || res === void 0 ? void 0 : res.ok) ? "success" : "error",
            message: !(res === null || res === void 0 ? void 0 : res.ok)
                ? (_a = res === null || res === void 0 ? void 0 : res.error) === null || _a === void 0 ? void 0 : _a.toString()
                : t("login_success").toString(),
        });
        if (res === null || res === void 0 ? void 0 : res.ok) {
            form.resetFields();
            router_1.default.replace("/dashboard");
        }
    };
    return (<>
      <antd_1.Space direction="vertical">
        {state.alert && <antd_1.Alert message={state.message} type={state.alert}/>}
        <SigninForm_1.default loading={state.loading} onSubmit={onSubmit} form={form}/>
        <antd_1.Space direction="horizontal">
          <antd_1.Typography.Text>{t("dont_have_account").toString()}</antd_1.Typography.Text>
          <link_1.default href="/signup">{t("signup").toString()}</link_1.default>
        </antd_1.Space>
      </antd_1.Space>
    </>);
};
Signin.getLayout = function getLayout(page) {
    const title = () => (next_i18next_1.i18n === null || next_i18next_1.i18n === void 0 ? void 0 : next_i18next_1.i18n.t("Signin")) || "";
    return <GuestLayout_1.default title={title().toUpperCase()}>{page}</GuestLayout_1.default>;
};
async function getServerSideProps(context) {
    const csrfToken = await (0, react_2.getCsrfToken)(context);
    return {
        props: {
            ...(await (0, serverSideTranslations_1.serverSideTranslations)(context === null || context === void 0 ? void 0 : context.locale, ["common"])),
            csrfToken: csrfToken || null,
        },
    };
}
exports.getServerSideProps = getServerSideProps;
exports.default = Signin;
