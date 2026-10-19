import { useMemo } from "react";
import { useRouter } from "next/router";
import { useTranslation } from "next-i18next";

import { createUiTranslator, type UiTranslator } from "./uiTranslationCore";
export type { UiTranslator } from "./uiTranslationCore";
const emptyCatalog: Record<string, string> = {};

/** Bound to this page's locale: safe for prerendering and language changes. */
export function useUiTranslation(): UiTranslator {
  const { locale = "id" } = useRouter();
  const { i18n } = useTranslation("interface");
  const catalog: Record<string, string> = i18n.getResourceBundle(locale, "interface") || emptyCatalog;
  return useMemo(() => createUiTranslator(locale, catalog), [locale, catalog]);
}

/** Keep legacy namespace lookups on the route locale during SSR and hydration. */
export function useLocalizedTranslation(namespace: string) {
  const { locale = "id" } = useRouter();
  const result = useTranslation(namespace);
  const t = useMemo(() => result.i18n.getFixedT(locale, namespace), [result.i18n, locale, namespace]);
  return { ...result, t };
}
