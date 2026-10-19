import { useUiTranslation } from "@/lib/uiTranslation";
import { useLocalizedTranslation as useTranslation } from "@/lib/uiTranslation";
import { ReactElement } from "react";
import { Alert, List, Space } from "antd";
import { useRouter } from "next/router";
import Link from "next/link";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import Layout from "@/components/Layout";
import { useDashboardApi } from "@/lib/useDashboardApi";
export default function Search() {
  const uiText = useUiTranslation();
  const { t: ui } = useTranslation("upgrade");
  const router = useRouter(); const q = typeof router.query.q === "string" ? router.query.q : "";
  const api = useDashboardApi(`/api/search?q=${encodeURIComponent(q)}`);
  return <Space direction="vertical" style={{ width: "100%" }}><h2>{uiText("Hasil pencarian:")} {q}</h2>{api.error && <Alert type="error" message={uiText(api.error)} />}<List dataSource={api.data?.data || []} renderItem={(r: any) => <List.Item><Link href={r.url}>{r.type}: {r.name} {r.number || ""}</Link></List.Item>} /></Space>;
}
Search.getLayout = (page: ReactElement) => <Layout title="PENCARIAN">{page}</Layout>;
export const getStaticProps = async ({ locale }: { locale: string }) => ({ props: { ...(await serverSideTranslations(locale, ["common", "upgrade", "interface"])) } });
