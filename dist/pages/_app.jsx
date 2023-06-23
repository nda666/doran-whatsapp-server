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
require("@/styles/globals.css");
const antd_1 = require("antd");
const react_1 = require("next-auth/react");
const next_i18next_1 = require("next-i18next");
const nextjs_progressbar_1 = __importDefault(require("nextjs-progressbar"));
const react_2 = require("react");
const App = ({ Component, pageProps: { session, ...pageProps }, }) => {
    const getLayout = Component.getLayout || ((page) => page);
    const [lang, setLang] = (0, react_2.useState)(undefined);
    (0, react_2.useEffect)(() => {
        var _a;
        ((_a = next_i18next_1.i18n === null || next_i18next_1.i18n === void 0 ? void 0 : next_i18next_1.i18n.language) === null || _a === void 0 ? void 0 : _a.toString()) == "id"
            ? Promise.resolve().then(() => __importStar(require("antd/locale/id_ID"))).then((m) => setLang(m.default))
            : Promise.resolve().then(() => __importStar(require("antd/locale/en_US"))).then((m) => setLang(m.default));
    }, [next_i18next_1.i18n === null || next_i18next_1.i18n === void 0 ? void 0 : next_i18next_1.i18n.language]);
    return (<react_1.SessionProvider session={session}>
      <nextjs_progressbar_1.default />
      <antd_1.ConfigProvider locale={lang}>
        {getLayout(<Component {...pageProps}/>)}
      </antd_1.ConfigProvider>
    </react_1.SessionProvider>);
};
exports.default = (0, next_i18next_1.appWithTranslation)(App);
