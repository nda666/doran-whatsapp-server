import { useUiTranslation } from "@/lib/uiTranslation";
import { useState } from "react";
import { Alert, Collapse, Select, Tabs } from "antd";
import { apiEndpoints, apiLanguages, integrationSample } from "@/lib/apiIntegrationSamples";
import ApiCodeBlock from "@/components/ApiCodeBlock";
import ApiGuideNotes from "@/components/ApiGuideNotes";
import ApiEndpointNotes from "@/components/ApiEndpointNotes";
import styles from "@/styles/ApiDocs.module.css";

export default function ApiIntegrationExamples() {
  const uiText = useUiTranslation();
  const [key, setKey] = useState("list-phones");
  const endpoint = apiEndpoints.find(item => item.key === key) || apiEndpoints[0];
  return <Collapse items={[{
    key: "implementation-examples",
    label: uiText("Contoh penerapan berbagai bahasa: cURL, PHP, JavaScript, Python, Go"),
    children: <div className={styles.stack}>
      <ApiGuideNotes label={uiText("Memakai contoh penerapan")} sections={[{ title: uiText("Langkah penggunaan"), items: [<>{uiText("Pilih endpoint, lalu bahasa yang digunakan.")}</>,
<>{uiText("Contoh response adalah ilustrasi; nilai sebenarnya mengikuti data dan kondisi server.")}</>,
<>{uiText("Contoh kode memakai request utama tiap endpoint.")}</>,
<>{uiText("Variasi GET dan form-urlencoded tersedia di koleksi Postman.")}</>] }]} />
      <Select className={styles.select} aria-label={uiText("Pilih endpoint contoh penerapan")} value={key} onChange={setKey} options={apiEndpoints.map(item => ({ value: item.key, label: `${item.methods[0]} ${item.path} - ${uiText(item.title)}` }))} showSearch optionFilterProp="label" />
      <Alert type="info" showIcon message={uiText(endpoint.auth === "none" ? uiText("Login dengan email dan password") : endpoint.auth === "user" ? uiText("Token pengguna diperlukan") : uiText("Token device diperlukan"))} />
      <ApiEndpointNotes notes={endpoint.notes} />
      <ApiGuideNotes label={uiText("Pengaturan contoh kode")} sections={[{ title: uiText("Environment"), items: [<>{uiText("PHP/JavaScript/Python/Go: isi environment")} <code>{endpoint.auth === "none" ? "JEBLAST_EMAIL dan JEBLAST_PASSWORD" : endpoint.auth === "user" ? "JEBLAST_USER_TOKEN" : "JEBLAST_DEVICE_TOKEN"}</code>.</>] },
{ title: uiText("Upload & MIME"), items: [<>{uiText("Untuk upload, isi")} <code>FILE_PATH</code>  {uiText("dan")} <code>FILE_MIME</code>.</>,
<>{uiText("Default MIME contoh: application/pdf; gunakan image/webp untuk sticker.")}</>] },
{ title: uiText("Nilai contoh cURL"), items: [<>{uiText("cURL memakai nilai contoh yang harus diganti.")}</>] },
{ title: uiText("JavaScript & backend"), items: [<>{uiText("Contoh JavaScript menggunakan fetch pada Node.js 18+; pemanggilan dari backend menjaga token tetap di server.")}</>] }]} />
      <Tabs items={apiLanguages.map(language => {
        const sample = integrationSample(endpoint, language.key);
        return { key: language.key, label: language.label, children: <ApiCodeBlock title={uiText("Request {{v0}}", { v0: language.label })} value={sample} copyLabel={uiText("Copy {{v0}}", { v0: language.label })} /> };
      })} />
      <ApiCodeBlock title={uiText("Contoh response sukses (HTTP {{v0}})", { v0: endpoint.status })} value={typeof endpoint.response === "string" ? endpoint.response : JSON.stringify(endpoint.response, null, 2)} />
      <Collapse items={[
        ...endpoint.variants.map((variant, index) => ({ key: `variant-${index}`, label: uiText("Variasi response (HTTP {{v0}})", { v0: variant.status }), children: <ApiCodeBlock title={uiText("Response HTTP {{v0}}", { v0: variant.status })} value={JSON.stringify(variant.body, null, 2)} /> })),
        ...endpoint.errors.map((error, index) => ({ key: `error-${index}`, label: uiText("Error (HTTP {{v0}})", { v0: error.status }), children: <ApiCodeBlock title={uiText("Response HTTP {{v0}}", { v0: error.status })} value={error.body === null ? "Body kosong" : JSON.stringify(error.body, null, 2)} /> })),
      ]} />
    </div>,
  }]} />;
}
