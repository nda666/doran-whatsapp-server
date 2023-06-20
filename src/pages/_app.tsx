import "@/styles/globals.css";
import { ConfigProvider } from "antd";
import { NextPage } from "next";
import { SessionProvider } from "next-auth/react";
import { appWithTranslation, i18n } from "next-i18next";
import type { AppProps } from "next/app";
import NextNProgress from "nextjs-progressbar";
import {
  ComponentType,
  ReactElement,
  ReactNode,
  useEffect,
  useState,
} from "react";
import { Locale } from "antd/lib/locale";

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
  const getLayout = Component.getLayout || ((page) => page);
  const [lang, setLang] = useState<Locale | undefined>(undefined);
  useEffect(() => {
    i18n?.language?.toString() == "id"
      ? import("antd/locale/id_ID").then((m) => setLang(m.default))
      : import("antd/locale/en_US").then((m) => setLang(m.default));
  }, [i18n?.language]);
  return (
    <SessionProvider session={session}>
      <NextNProgress />
      <ConfigProvider locale={lang}>
        {getLayout(<Component {...pageProps} />)}
      </ConfigProvider>
    </SessionProvider>
  );
};

export default appWithTranslation(App as ComponentType<AppPropsWithLayout>);
