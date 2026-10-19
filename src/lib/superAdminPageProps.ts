import type { GetServerSideProps } from "next";
import { getToken } from "next-auth/jwt";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import { prisma } from "./prisma";
import { isApproved, isCurrentSession, isSuperAdmin } from "./access";

export const superAdminPageProps: GetServerSideProps = async context => {
  context.res.setHeader("Cache-Control", "private, no-store");
  const token = await getToken({ req: context.req });
  const user = typeof token?.id === "string"
    ? await prisma.user.findUnique({ where: { id: token.id } }) : null;
  if (!user || !isApproved(user) || !isCurrentSession(user, token!)) {
    return { redirect: { destination: "/signin", permanent: false } };
  }
  if (!isSuperAdmin(user)) {
    return { redirect: { destination: "/dashboard", permanent: false } };
  }
  return { props: { ...(await serverSideTranslations(context.locale || "id", ["common", "upgrade", "interface"])) } };
};
