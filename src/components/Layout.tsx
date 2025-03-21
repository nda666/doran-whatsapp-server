import React, { ReactNode, useState } from "react";

import {
  Button,
  Layout as AntdLayout,
  Menu,
  Popover,
  Space,
  theme,
  Typography,
} from "antd";
import { i18n, useTranslation } from "next-i18next";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";

import {
  DashboardOutlined,
  HistoryOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  WhatsAppOutlined,
} from "@ant-design/icons";

const { Header, Sider, Content } = AntdLayout;
const { Text, Title } = Typography;
const langMenuSelected = undefined;
export default function Layout({
  children,
  title,
}: {
  title?: string;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [collapsedWidth, setCollapsedWidth] = useState(80);
  const { t } = useTranslation("common");

  const router = useRouter();
  const {
    token: { colorWhite },
  } = theme.useToken();
  return (
    <AntdLayout className="layout" style={{ minHeight: "100%" }}>
      <Sider
        trigger={null}
        collapsible
        collapsed={collapsed}
        collapsedWidth={collapsedWidth}
        breakpoint="sm"
        onBreakpoint={(broken) => {
          setCollapsed(broken);
          broken ? setCollapsedWidth(0) : setCollapsedWidth(90);
        }}
        theme="dark"
        style={{
          overflow: "auto",
          height: "100vh",
          position: "fixed",
          left: 0,
          top: 0,
          bottom: 0,
          zIndex: 1,
          paddingTop: collapsedWidth == 0 ? 60 : 0,
        }}
      >
        <Space
          style={{
            padding: "10px 5px",
            width: "100%",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Image
            style={{ flex: 0 }}
            src="/troll-face.gif"
            width={"50"}
            height={"40"}
            alt="logo"
          />
          {!collapsed && (
            <Title
              style={{
                fontSize: "1.5em",
                color: "white",
                whiteSpace: "nowrap",
              }}
            >
              Doran WA
            </Title>
          )}
        </Space>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[router.asPath]}
          // items={[
          //   {
          //     key: "dashboard",
          //     icon: <DashboardOutlined />,
          //     label: t("dashboard"),
          //   },
          //   {
          //     key: "dashboard/phones",
          //     icon: <WhatsAppOutlined />,
          //     label: t("phone_devices"),
          //   },
          // ]}
        >
          <Menu.Item key={"/dashboard"} title={t("dashboard")}>
            <Link href={"/dashboard"}>
              <Space size={"middle"}>
                <DashboardOutlined />
                {!collapsed && t("dashboard")}
              </Space>
            </Link>
          </Menu.Item>
          <Menu.Item key={"/dashboard/phone"} title={t("phone_devices")}>
            <Link href={"/dashboard/phone"}>
              <Space size={"middle"}>
                <WhatsAppOutlined />
                {!collapsed && t("phone_devices")}
              </Space>
            </Link>
          </Menu.Item>
          <Menu.Item key={"/dashboard/log"} title={t("log")}>
            <Link href={"/dashboard/log"}>
              <Space size={"middle"}>
                <HistoryOutlined />
                {!collapsed && t("log")}
              </Space>
            </Link>
          </Menu.Item>
          {/* <Menu.Item key={"/dashboard/auto-reply"} title={t("auto_reply")}>
              <Link href={"/dashboard/auto-reply"}>
                <Space size={"middle"}>
                  <WechatFilled/>
                  {!collapsed && t("auto_reply")}
                </Space>
              </Link>
          </Menu.Item> */}
        </Menu>
      </Sider>
      <AntdLayout
        className="layout"
        style={{
          minHeight: "100%",
          transition: "all 0.2s,background 0s",
          marginLeft: collapsed
            ? collapsedWidth
            : collapsedWidth == 0
            ? 0
            : "200px",
        }}
      >
        <Header
          style={{
            position: "sticky",
            top: 0,
            zIndex: 3,
            width: "100%",
            display: "flex",
            alignItems: "center",
            paddingLeft: 10,
            paddingRight: 10,
            justifyContent: "space-between",
            color: colorWhite,
          }}
        >
          <Space style={{ flex: 1 }}>
            <Button
              type="text"
              style={{ color: colorWhite }}
              onClick={() => setCollapsed(!collapsed)}
            >
              {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            </Button>
            <div style={{ fontWeight: "bold", fontSize: "1.1em" }}>{title}</div>
          </Space>
          <Menu
            theme="dark"
            mode="horizontal"
            selectable={false}
            style={{ width: 200, display: "flex", justifyContent: "flex-end" }}
          >
            <Menu.Item
              key="menu-lang"
              onClick={() => {
                const { pathname, asPath, query } = router;
                router.push({ pathname, query }, asPath, {
                  locale: i18n?.language == "id" ? "en" : "id",
                });
              }}
            >
              <Popover
                content={
                  <div>
                    {i18n?.language == "id" ? (
                      <>
                        <b>Indonesia/</b>English
                      </>
                    ) : (
                      <>
                        Indonesia<b>/English</b>
                      </>
                    )}
                  </div>
                }
              >
                {i18n?.language.toUpperCase()}
              </Popover>
            </Menu.Item>
            <Menu.Item key="menu-signout">
              <Link href={"/signout"}>{t("signout")}</Link>
            </Menu.Item>
          </Menu>
        </Header>
        <Content
          style={{
            padding: "0 20px",
            marginTop: "10px",
          }}
        >
          {children}
        </Content>
      </AntdLayout>
    </AntdLayout>
  );
}
