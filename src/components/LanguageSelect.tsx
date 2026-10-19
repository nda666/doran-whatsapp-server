import { Select, message } from "antd";
import { useRouter } from "next/router";
import { useUiTranslation } from "@/lib/uiTranslation";

export default function LanguageSelect() {
  const router = useRouter();
  const uiText = useUiTranslation();
  return <Select aria-label={uiText("Bahasa")} value={router.locale || "id"} style={{ minWidth: 100 }}
    options={[
      { value: "id", label: "Indonesia" }, { value: "en", label: "English" },
      { value: "es", label: "Español" }, { value: "ar", label: "العربية" }, { value: "hi", label: "हिन्दी" },
    ]}
    onChange={async locale => {
      try {
        const changed = await router.push({ pathname: router.pathname, query: router.query }, router.asPath, { locale });
        if (changed) document.cookie = `NEXT_LOCALE=${locale}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
      } catch { message.error(uiText("Bahasa belum berhasil diganti. Silakan coba lagi.")); }
    }} />;
}
