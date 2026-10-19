import { useUiTranslation } from "@/lib/uiTranslation";
import {
  ReactElement,
  useState,
} from 'react';

import {
  Button,
  Flex,
  Tabs,
} from 'antd';
import { useSession } from 'next-auth/react';
import { i18n } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useLocalizedTranslation as useTranslation } from "@/lib/uiTranslation";

import Layout from '@/components/Layout';
import { LogTable } from '@/components/log/LogTable';
import DispatchPage from './dispatch';

const LogPage = () => {
  const uiText = useUiTranslation();
  const { data: session } = useSession();
  const [state, setState] = useState<{
    showSearch: boolean;
  }>({
    showSearch: true,
  });
  const { t } = useTranslation("common");
  return (
    <>
      <Flex gap="middle" vertical>
        <Flex gap="middle">
          <Button
            onClick={() =>
              setState({ ...state, showSearch: !state.showSearch })
            }
          >
            {state.showSearch ? t("hide_search") : t("show_search")}
          </Button>
        </Flex>
        <Tabs items={[{ key: "out", label: uiText("Riwayat Pesan Keluar (Blast/API)"), children: <DispatchPage /> }, { key: "in", label: uiText("Pesan Masuk (Webhook)"), children: <LogTable showSearch={state.showSearch} token={session?.user?.token!} /> }]} />
      </Flex>
    </>
  );
};

export const getStaticProps = async ({ locale }: { locale: string }) => ({
  props: {
    ...(await serverSideTranslations(locale, ["common", "upgrade", "interface"])),
  },
});

LogPage.getLayout = function getLayout(page: ReactElement) {
  return <Layout title="Riwayat aktivitas">{page}</Layout>;
};

export default LogPage;
