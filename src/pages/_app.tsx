import "@/styles/globals.css";
import { ConfigProvider } from "antd";
import { dashboardTheme } from "@/lib/dashboardTheme";
import { dashboardPalette } from "@/lib/dashboardColors";
import { DashboardPreferences, useDashboardPreferences } from "@/lib/DashboardPreferences";
import { NextPage } from "next";
import { SessionProvider } from "next-auth/react";
import AccountSessionGuard from "@/components/AccountSessionGuard";
import { appWithTranslation } from "next-i18next";
import idLocale from "antd/locale/id_ID";
import enLocale from "antd/locale/en_US";
import esLocale from "antd/locale/es_ES";
import arLocale from "antd/locale/ar_EG";
import hiLocale from "antd/locale/hi_IN";
import dayjs from "dayjs";
import "dayjs/locale/id";
import "dayjs/locale/es";
import "dayjs/locale/ar";
import "dayjs/locale/hi";
import type { AppProps } from "next/app";
import { useRouter } from "next/router";
import NextNProgress from "nextjs-progressbar";
import {
  ComponentType,
  ReactElement,
  ReactNode,
  useEffect,
} from "react";
import { Locale } from "antd/lib/locale";

const componentLocales: Record<string, Locale> = { id: idLocale, en: enLocale, es: esLocale, ar: arLocale, hi: hiLocale };

export type NextPageWithLayout<P = {}, IP = P> = NextPage<P, IP> & {
  getLayout?: (page: ReactElement) => ReactNode;
};

type AppPropsWithLayout = AppProps & {
  Component: NextPageWithLayout;
};

const App = ({
  Component,
  pageProps: { session, ...pageProps },
}: AppPropsWithLayout) => {
  return <DashboardPreferences><ThemedApp Component={Component} pageProps={{ session, ...pageProps }} /></DashboardPreferences>;
};
const ThemedApp = ({ Component, pageProps: { session, ...pageProps } }: Pick<AppPropsWithLayout, "Component" | "pageProps">) => {
  const { dark, color } = useDashboardPreferences();
  const palette = dashboardPalette(dark, color);
  const { locale } = useRouter();
  const getLayout = Component.getLayout || ((page) => page);
  const lang = componentLocales[locale || "id"] || idLocale;
  const direction = locale === "ar" ? "rtl" : "ltr";
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    document.documentElement.dataset.color = color;
    const colors = dashboardPalette(dark, color);
    const variables = {
      "--ui-text": colors.text, "--ui-muted": colors.secondary,
      "--ui-surface": colors.surface, "--ui-soft": colors.layout,
      "--ui-border": colors.border, "--ui-accent": colors.emphasis,
      "--ui-color": colors.primary, "--ui-on-color": colors.onPrimary,
      "--ui-brand-bg": colors.soft, "--ui-brand-fg": dark || color === "orange" ? colors.emphasis : colors.primary,
      "--ui-selected": colors.selected, "--ui-sort-arrow": colors.secondary,
      "--ui-sort-active": colors.emphasis, "--ui-sort-header": colors.selected,
    };
    Object.entries(variables).forEach(([name, value]) => document.documentElement.style.setProperty(name, value));
    // Static message/notification calls are rendered outside the React provider.
    ConfigProvider.config({ holderRender: children => <ConfigProvider locale={lang} direction={direction} theme={dashboardTheme(dark, color)}>{children}</ConfigProvider> });
  }, [dark, color, lang, direction]);
  useEffect(() => {
    document.documentElement.lang = locale || "id";
    document.documentElement.dir = direction;
    dayjs.locale(locale || "id");
  }, [locale, direction]);
  return (
    <SessionProvider session={session} refetchInterval={15} refetchOnWindowFocus refetchWhenOffline={false}>
      <AccountSessionGuard />
      <NextNProgress color={palette.primary} />
      <ConfigProvider locale={lang} direction={direction} theme={dashboardTheme(dark, color)}>
        {getLayout(<Component {...pageProps} />)}
      </ConfigProvider>
    </SessionProvider>
  );
};

export default appWithTranslation(App as ComponentType<AppPropsWithLayout>);
