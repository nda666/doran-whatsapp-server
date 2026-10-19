import { useUiTranslation } from "@/lib/uiTranslation";
import { Card, Layout, Typography } from "antd";
import { ReactNode } from "react";

import styles from "../styles/guestLayout.module.css";
import Image from "next/image";
import LanguageSelect from "@/components/LanguageSelect";

export default function GuestLayout({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  const uiText = useUiTranslation();
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
          alt={"logo"}
        />

        <Typography.Title style={{ fontSize: "1.5em" }}>
          {uiText("Doran WA")}</Typography.Title>
        <LanguageSelect />
      </Layout.Header>
      <Layout.Content style={{ paddingTop: 64 }}>
        <div className={styles["space-align-container"]}>
          <div className={styles["space-align-block"]}>
            <Card title={uiText(title || "")}>{children}</Card>
          </div>
        </div>
      </Layout.Content>
    </Layout>
  );
}
