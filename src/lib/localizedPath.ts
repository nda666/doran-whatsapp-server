/** Preserve the selected language across full-page authentication redirects. */
export function localizedPath(path: string, locale = "id") {
  return ["en", "es", "ar", "hi"].includes(locale) ? `/${locale}${path}` : path;
}
