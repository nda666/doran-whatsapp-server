import {
  Layout as AntdLayout,
  Card,
  Layout,
  Menu,
  MenuProps,
  Popover,
  Space,
  Typography,
} from "antd";
import React, { ReactNode, useState } from "react";

import styles from "../styles/guestLayout.module.css";
import i18next from "i18next";
import { i18n } from "next-i18next";
import { useRouter } from "next/router";
import Image from "next/image";

type MenuItem = Required<MenuProps>["items"][number];
function getItem(
  label: React.ReactNode,
  key?: React.Key | null,
  icon?: React.ReactNode,
  children?: MenuItem[],
  type?: "group"
): MenuItem {
  return {
    key,
    icon,
    children,
    label,
    type,
  } as MenuItem;
}
export default function GuestLayout({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  return (
    <Layout className={styles["layout"]}>
      <Layout.Header
        className={styles["white-header"]}
        style={{
          position: "fixed",
          width: "100%",
          display: "flex",
          zIndex: 2,
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Image
          style={{ flex: 0 }}
          src="/troll-face.gif"
          width={"50"}
          height={"40"}
          alt="logo"
        />

        <Typography.Title style={{ fontSize: "1.5em" }}>
          Doran WA
        </Typography.Title>
        <Menu theme="light" mode="horizontal">
          <Menu.Item
            key="lang-menu"
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
              <Typography.Text>{i18n?.language.toUpperCase()}</Typography.Text>
            </Popover>
          </Menu.Item>
        </Menu>
      </Layout.Header>
      <Layout.Content style={{ paddingTop: 64 }}>
        <div className={styles["space-align-container"]}>
          <div className={styles["space-align-block"]}>
            <Card title={title || ""}>{children}</Card>
          </div>
        </div>
      </Layout.Content>
    </Layout>
  );
}
