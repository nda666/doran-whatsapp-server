import { useUiTranslation } from "@/lib/uiTranslation";
import React, { ReactNode, useRef, useState } from "react";
import { Alert, Avatar, Button, Dropdown, Layout as AntdLayout, Menu, Space, Input, Breadcrumb, Spin, message } from "antd";
import type { MenuProps } from "antd";
import { useLocalizedTranslation as useTranslation } from "@/lib/uiTranslation";
import Link from "next/link";
import Head from "next/head";
import { useRouter } from "next/router";
import { useDashboardPreferences } from "@/lib/DashboardPreferences";
import { dashboardColors, isDashboardColor } from "@/lib/dashboardColors";
import { signOut, useSession } from "next-auth/react";
import { isSuperAdmin, isSuperAdminPage } from "@/lib/access";
import ApprovalNotifications from "@/components/ApprovalNotifications";
import LanguageSelect from "@/components/LanguageSelect";
import { localizedPath } from "@/lib/localizedPath";
import {
  DashboardOutlined, HistoryOutlined, MenuFoldOutlined, MenuUnfoldOutlined,
  WhatsAppOutlined, ContactsOutlined, FolderOpenOutlined, SendOutlined,
  OrderedListOutlined, BarChartOutlined, ApiOutlined, SettingOutlined, CalendarOutlined,
  LogoutOutlined, SunOutlined, MoonOutlined, UserOutlined, KeyOutlined, DownOutlined, MessageOutlined, SearchOutlined,
} from "@ant-design/icons";

const { Header, Sider, Content } = AntdLayout;

export default function Layout({ children, title }: { title?: string; children: ReactNode }) {
  const uiText = useUiTranslation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobile, setMobile] = useState(false);
  const logoutPending = useRef(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const logout = async () => {
    if (logoutPending.current) return;
    logoutPending.current = true; setLoggingOut(true);
    try { await signOut({ callbackUrl: localizedPath("/signin", router.locale), redirect: true }); }
    catch { logoutPending.current = false; setLoggingOut(false); message.error(uiText("Keluar belum berhasil. Silakan coba lagi.")); }
  };
  const { t } = useTranslation("common");
  const { t: ui } = useTranslation("upgrade");
  const preferences = useDashboardPreferences();
  const { data: session, status } = useSession();
  const router = useRouter();
  const superAdmin = !!session?.user && isSuperAdmin(session.user);
  const restrictedPage = isSuperAdminPage(router.pathname);
  const navigation = [
    // Frequent operations first; related message resources stay together.
    { href: "/dashboard", label: t("dashboard"), icon: <DashboardOutlined /> },
    { href: "/dashboard/conversations", label: uiText("Percakapan"), icon: <MessageOutlined /> },
    { href: "/dashboard/phone", label: t("phone_devices"), icon: <WhatsAppOutlined /> },
    { href: "/dashboard/campaigns", label: uiText("Kampanye pesan"), icon: <SendOutlined /> },
    { href: "/dashboard/calendar", label: uiText("Kalender pengiriman"), icon: <CalendarOutlined /> },
    { href: "/dashboard/dispatch", label: uiText("Antrean pengiriman"), icon: <OrderedListOutlined /> },
    { href: "/dashboard/contacts", label: ui("Kontak"), icon: <ContactsOutlined />, dividerBefore: true },
    { href: "/dashboard/message-templates", label: uiText("Templat pesan"), icon: <MessageOutlined /> },
    { href: "/dashboard/media", label: uiText("Pengelola berkas"), icon: <FolderOpenOutlined /> },
    { href: "/dashboard/reports", label: ui("Laporan"), icon: <BarChartOutlined />, dividerBefore: true },
    { href: "/dashboard/log", label: t("log"), icon: <HistoryOutlined /> },
    { href: "/dashboard/ai-plugins", label: uiText("Plugin AI"), icon: <SettingOutlined />, dividerBefore: true },
    { href: "/dashboard/api-docs", label: uiText("Dokumentasi API"), icon: <ApiOutlined /> },
    { href: "/dashboard/admin", label: uiText("Administrasi"), icon: <SettingOutlined />, dividerBefore: true },
    { href: "/dashboard/plans", label: uiText("Master paket"), icon: <FolderOpenOutlined /> },
  ];
  const menuItems: MenuProps["items"] = navigation
    .filter(item => !isSuperAdminPage(item.href) || superAdmin)
    .flatMap(({ href, label, icon, dividerBefore }) => {
      const item = { key: href, icon, title: label, label: <Link href={href}>{label}</Link> };
      return dividerBefore ? [{ type: "divider" as const, key: `${href}-divider` }, item] : [item];
    });
  // Auto reply is reached from a device, so keep that device menu highlighted.
  const selectedKey = router.pathname === "/dashboard/auto-reply" ? "/dashboard/phone" : router.pathname;
  const pageTitle = navigation.find(item => item.href === router.pathname)?.label || uiText(title || "Dasbor");

  return (
    <AntdLayout className="dashboard-shell"><a className="dashboard-skip-link" href="#dashboard-content">{uiText("Langsung ke konten")}</a>
      <Head>
        <title>{`${pageTitle} · Doran WA`}</title>
        <meta name="description" content={`${pageTitle} · Doran WA. ${uiText("Kelola perangkat WhatsApp dan pengiriman pesan Anda.")}`} key="description" />
      </Head>
      {mobile && !collapsed && <button className="sidebar-backdrop" aria-label={uiText("Tutup menu")} onClick={() => setCollapsed(true)} />}
      <Sider className="dashboard-sidebar" width={248} trigger={null} collapsible collapsed={collapsed}
        collapsedWidth={mobile ? 0 : 80} breakpoint="lg" theme="light"
        onBreakpoint={broken => { setMobile(broken); setCollapsed(broken); }}>
        <Link className="dashboard-brand" href="/dashboard" aria-label={uiText("Doran WA")}>
          <span className="dashboard-brand-icon"><WhatsAppOutlined /></span>
          {!collapsed && <span><strong>{uiText("Doran WA")}</strong><small>{uiText("WhatsApp Server")}</small></span>}
        </Link>
        <Menu theme="light" mode="inline" selectedKeys={[selectedKey]}
          onClick={() => { if (mobile) setCollapsed(true); }}
          items={menuItems} />
      </Sider>
      <AntdLayout className="dashboard-main" style={{ marginInlineStart: mobile ? 0 : collapsed ? 80 : 248 }}>
        <Header className="dashboard-header">
          <Space className="dashboard-heading">
            <Button type="text" aria-label={collapsed ? uiText("Buka menu") : uiText("Tutup menu")} aria-expanded={!collapsed}
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />} onClick={() => setCollapsed(!collapsed)} />
            <span className="dashboard-page-title">{uiText(title)}</span>
          </Space>
          <Space wrap className="dashboard-header-actions">
            {superAdmin && <ApprovalNotifications />}
            <Input.Search className="dashboard-search" placeholder={ui("Pencarian global")} aria-label={ui("Pencarian global")}
              onSearch={q => void router.push(`/dashboard/search?q=${encodeURIComponent(q)}`)} />
            <Button className="dashboard-mobile-search" type="text" aria-label={ui("Pencarian global")} icon={<SearchOutlined />} onClick={() => void router.push("/dashboard/search")} />
            <Dropdown trigger={["click"]} menu={{
              selectable: true,
              selectedKeys: [preferences.color],
              onClick: ({ key }) => { if (isDashboardColor(key)) preferences.setColor(key); },
              items: dashboardColors.map(color => ({
                key: color.value,
                label: <span className="dashboard-color-option"><span className="dashboard-color-swatch" style={{ backgroundColor: preferences.dark ? color.dark : color.primary }} aria-hidden="true" />{uiText(color.label)}</span>,
              })),
            }}>
              <Button aria-label={uiText("Tema warna: {{v0}}", { v0: uiText(dashboardColors.find(color => color.value === preferences.color)?.label) })} aria-haspopup="menu" title={uiText("Tema warna")}>
                <span className="dashboard-color-swatch dashboard-color-current" aria-hidden="true" />
                <span className="theme-toggle-label">{uiText("Tema warna")}</span><DownOutlined />
              </Button>
            </Dropdown>
            <Button aria-label={preferences.dark ? ui("Mode terang") : ui("Mode gelap")} icon={preferences.dark ? <SunOutlined /> : <MoonOutlined />} onClick={preferences.toggleDark}>
              <span className="theme-toggle-label">{preferences.dark ? ui("Mode terang") : ui("Mode gelap")}</span>
            </Button>
            <LanguageSelect />
            {session?.user && <Dropdown trigger={["click"]} menu={{ items: [
              { key: "profile", icon: <UserOutlined />, label: <Link href="/dashboard/profile">{uiText("Edit profil")}</Link> },
              { key: "password", icon: <KeyOutlined />, label: <Link href="/dashboard/change-password">{uiText("Ganti kata sandi")}</Link> },
              { key: "token", icon: <KeyOutlined />, label: <Link href="/dashboard/profile#token-user">{uiText("Token user")}</Link> },
              { type: "divider" },
              { key: "signout", icon: <LogoutOutlined />, label: loggingOut ? uiText("Sedang keluar...") : t("signout"), disabled: loggingOut, onClick: () => void logout() },
            ] }}>
              <button type="button" className="dashboard-user" aria-label={uiText("Menu akun pengguna")} aria-haspopup="menu" title={uiText("Masuk sebagai {{v0}}", { v0: session.user.email })}>
                <Avatar size={36}>{(session.user.name || session.user.email || "U").slice(0, 1).toUpperCase()}</Avatar>
                <div><strong>{session.user.name || uiText("Pengguna")}</strong><small>{session.user.email}</small></div><DownOutlined />
              </button>
            </Dropdown>}
          </Space>
        </Header>
        <Content id="dashboard-content" className="dashboard-content">
          <Breadcrumb className="dashboard-breadcrumb" items={[{ title: <Link href="/dashboard">{ui("Dasbor")}</Link> },
            ...(router.pathname === "/dashboard" ? [] : [{ title: uiText(title || "") }])]} />
          {restrictedPage && !superAdmin
            ? status === "loading" ? <Spin /> : <Alert type="error" showIcon message={uiText("Akses hanya untuk super admin.")} />
            : children}
        </Content>
      </AntdLayout>
    </AntdLayout>
  );
}

