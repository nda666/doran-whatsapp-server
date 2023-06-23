"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const antd_1 = require("antd");
const react_1 = __importDefault(require("react"));
const guestLayout_module_css_1 = __importDefault(require("../styles/guestLayout.module.css"));
const next_i18next_1 = require("next-i18next");
const router_1 = require("next/router");
const image_1 = __importDefault(require("next/image"));
function getItem(label, key, icon, children, type) {
    return {
        key,
        icon,
        children,
        label,
        type,
    };
}
function GuestLayout({ title, children, }) {
    const router = (0, router_1.useRouter)();
    return (<antd_1.Layout className={guestLayout_module_css_1.default["layout"]}>
      <antd_1.Layout.Header className={guestLayout_module_css_1.default["white-header"]} style={{
            position: "fixed",
            width: "100%",
            display: "flex",
            zIndex: 2,
            alignItems: "center",
            justifyContent: "space-between",
        }}>
        <image_1.default style={{ flex: 0 }} src="/troll-face.gif" width={"50"} height={"40"} alt="logo"/>

        <antd_1.Typography.Title style={{ fontSize: "1.5em" }}>
          Doran WA
        </antd_1.Typography.Title>
        <antd_1.Menu theme="light" mode="horizontal">
          <antd_1.Menu.Item key="lang-menu" onClick={() => {
            const { pathname, asPath, query } = router;
            router.push({ pathname, query }, asPath, {
                locale: (next_i18next_1.i18n === null || next_i18next_1.i18n === void 0 ? void 0 : next_i18next_1.i18n.language) == "id" ? "en" : "id",
            });
        }}>
            <antd_1.Popover content={<div>
                  {(next_i18next_1.i18n === null || next_i18next_1.i18n === void 0 ? void 0 : next_i18next_1.i18n.language) == "id" ? (<>
                      <b>Indonesia/</b>English
                    </>) : (<>
                      Indonesia<b>/English</b>
                    </>)}
                </div>}>
              <antd_1.Typography.Text>{next_i18next_1.i18n === null || next_i18next_1.i18n === void 0 ? void 0 : next_i18next_1.i18n.language.toUpperCase()}</antd_1.Typography.Text>
            </antd_1.Popover>
          </antd_1.Menu.Item>
        </antd_1.Menu>
      </antd_1.Layout.Header>
      <antd_1.Layout.Content style={{ paddingTop: 64 }}>
        <div className={guestLayout_module_css_1.default["space-align-container"]}>
          <div className={guestLayout_module_css_1.default["space-align-block"]}>
            <antd_1.Card title={title || ""}>{children}</antd_1.Card>
          </div>
        </div>
      </antd_1.Layout.Content>
    </antd_1.Layout>);
}
exports.default = GuestLayout;
