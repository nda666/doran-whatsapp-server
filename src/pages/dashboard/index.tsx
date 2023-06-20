import Layout from "@/components/Layout";
import { GetServerSideProps } from "next";
import { i18n } from "next-i18next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import { ReactElement } from "react";
import { useSession } from "next-auth/react";
import Nextauth from "../api/auth/[...nextauth]";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { Row, Col, Statistic, Button } from "antd";

const DashpboardPage = ({ user }: { user: User }) => {
  const { data } = useSession();

  return (
    <Row gutter={16}>
      <Col span={12}>
        <Statistic title={user?.email} value={user?.name || ""} />
      </Col>

      <Col span={12}>
        <Statistic title="Total Device" value={user?._count.phones || 0} />
      </Col>
    </Row>
  );
};

export const getServerSideProps: GetServerSideProps = async (context) => {
  const token = await getToken({ req: context.req });
  const user = await prisma.user.findUnique({
    where: { id: token?.id },

    select: {
      id: true,
      name: true,
      email: true,
      _count: {
        select: {
          phones: true,
        },
      },
    },
  });
  return {
    props: {
      user: JSON.parse(JSON.stringify(user)),
      ...(await serverSideTranslations(context.locale || "id", ["common"])),
    },
  };
};

interface User {
  _count: {
    phones: number;
  };
  id: string;
  name: string | null;
  email: string | null;
}

DashpboardPage.getLayout = function getLayout(page: ReactElement) {
  const title = () => i18n?.t("dashboard") || "";
  return <Layout title={title().toUpperCase()}>{page}</Layout>;
};

export default DashpboardPage;
