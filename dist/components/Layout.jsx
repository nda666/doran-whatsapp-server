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
const icons_1 = require("@ant-design/icons");
const antd_1 = require("antd");
const image_1 = __importDefault(require("next/image"));
const react_1 = __importStar(require("react"));
const next_i18next_1 = require("next-i18next");
const router_1 = require("next/router");
const link_1 = __importDefault(require("next/link"));
const { Header, Sider, Content } = antd_1.Layout;
const { Text, Title } = antd_1.Typography;
const langMenuSelected = undefined;
function Layout({ children, title, }) {
    const [collapsed, setCollapsed] = (0, react_1.useState)(false);
    const [collapsedWidth, setCollapsedWidth] = (0, react_1.useState)(80);
    const { t } = (0, next_i18next_1.useTranslation)("common");
    const router = (0, router_1.useRouter)();
    const { token: { colorWhite }, } = antd_1.theme.useToken();
    return (<antd_1.Layout className="layout" style={{ minHeight: "100%" }}>
      <Sider trigger={null} collapsible collapsed={collapsed} collapsedWidth={collapsedWidth} breakpoint="sm" onBreakpoint={(broken) => {
            setCollapsed(broken);
            broken ? setCollapsedWidth(0) : setCollapsedWidth(90);
        }} theme="dark" style={{
            overflow: "auto",
            height: "100vh",
            position: "fixed",
            left: 0,
            top: 0,
            bottom: 0,
            zIndex: 1,
            paddingTop: collapsedWidth == 0 ? 60 : 0,
        }}>
        <antd_1.Space style={{
            padding: "10px 5px",
            width: "100%",
            alignItems: "center",
            justifyContent: "center",
        }}>
          <image_1.default style={{ flex: 0 }} src="/troll-face.gif" width={"50"} height={"40"} alt="logo"/>
          {!collapsed && (<Title style={{
                fontSize: "1.5em",
                color: "white",
                whiteSpace: "nowrap",
            }}>
              Doran WA
            </Title>)}
        </antd_1.Space>
        <antd_1.Menu theme="dark" mode="inline" selectedKeys={[router.asPath]}>
          <antd_1.Menu.Item key={"/dashboard"} title={t("dashboard")}>
            <link_1.default href={"/dashboard"}>
              <antd_1.Space size={"middle"}>
                <icons_1.DashboardOutlined />
                {!collapsed && t("dashboard")}
              </antd_1.Space>
            </link_1.default>
          </antd_1.Menu.Item>
          <antd_1.Menu.Item key={"/dashboard/phone"} title={t("phone_devices")}>
            <link_1.default href={"/dashboard/phone"}>
              <antd_1.Space size={"middle"}>
                <icons_1.WhatsAppOutlined />
                {!collapsed && t("phone_devices")}
              </antd_1.Space>
            </link_1.default>
          </antd_1.Menu.Item>
        </antd_1.Menu>
      </Sider>
      <antd_1.Layout className="layout" style={{
            minHeight: "100%",
            transition: "all 0.2s,background 0s",
            marginLeft: collapsed
                ? collapsedWidth
                : collapsedWidth == 0
                    ? 0
                    : "200px",
        }}>
        <Header style={{
            position: "sticky",
            top: 0,
            zIndex: 1,
            width: "100%",
            display: "flex",
            alignItems: "center",
            paddingLeft: 10,
            paddingRight: 10,
            justifyContent: "space-between",
            color: colorWhite,
        }}>
          <antd_1.Space style={{ flex: 1 }}>
            <antd_1.Button type="ghost" style={{ color: colorWhite }} onClick={() => setCollapsed(!collapsed)}>
              {collapsed ? <icons_1.MenuUnfoldOutlined /> : <icons_1.MenuFoldOutlined />}
            </antd_1.Button>
            <div style={{ fontWeight: "bold", fontSize: "1.1em" }}>{title}</div>
          </antd_1.Space>
          <antd_1.Menu theme="dark" mode="horizontal" selectable={false} style={{ width: 200, display: "flex", justifyContent: "flex-end" }}>
            <antd_1.Menu.Item onClick={() => {
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
                {next_i18next_1.i18n === null || next_i18next_1.i18n === void 0 ? void 0 : next_i18next_1.i18n.language.toUpperCase()}
              </antd_1.Popover>
            </antd_1.Menu.Item>
            <antd_1.Menu.Item>
              <link_1.default href={"/signout"}>{t("signout")}</link_1.default>
            </antd_1.Menu.Item>
          </antd_1.Menu>
        </Header>
        <Content style={{
            padding: "0 20px",
            marginTop: "10px",
        }}>
          {children}
        </Content>
      </antd_1.Layout>
    </antd_1.Layout>);
}
exports.default = Layout;
