import { ReactElement, useState } from "react";

import { Button, Flex } from "antd";
import { useSession } from "next-auth/react";
import { i18n } from "next-i18next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import { useTranslation } from "react-i18next";

import Layout from "@/components/Layout";
import { LogTable } from "@/components/log/LogTable";

const LogPage = () => {
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
        <LogTable token={session?.user?.token!} />
      </Flex>
    </>
  );
};

export const getStaticProps = async ({ locale }: { locale: string }) => ({
  props: {
    ...(await serverSideTranslations(locale, ["common"])),
  },
});

LogPage.getLayout = function getLayout(page: ReactElement) {
  const title = () => i18n?.t("log") || "";
  return <Layout title={title().toUpperCase()}>{page}</Layout>;
};

export default LogPage;
