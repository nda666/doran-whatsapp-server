import catalogue from "@/data/apiDocumentation.json";

export const apiEndpoints = catalogue.endpoints;
export type ApiEndpoint = typeof apiEndpoints[number];
export type ApiLanguage = "curl" | "php" | "javascript" | "python" | "go";
export const apiLanguages: { key: ApiLanguage; label: string }[] = [
  { key: "curl", label: "cURL" }, { key: "php", label: "PHP cURL" },
  { key: "javascript", label: "JavaScript / Node.js" }, { key: "python", label: "Python" }, { key: "go", label: "Go" },
];
const values: Record<string, string> = {
  number: "6281234567890", store_id: "STORE-001", transaction_id: "ORDER-20261010-001", message_key: "send-message",
  media_id: "UUID_MEDIA_DARI_UPLOAD", job_id: "ORDER-20261011-001-notification", dispatch_id: "UUID_PENGIRIMAN_DARI_DATA_ID", group_id: "120363000000000000@g.us",
  device_token: "TOKEN_DEVICE", user_token: "TOKEN_USER", device_id: "UUID_DEVICE_PENGIRIM", file_path: "/path/ke/berkas.pdf",
  account_email: "akun@example.com", account_password: "PASSWORD_AKUN_ANDA",
};
const resolve = (value: unknown) => JSON.parse(JSON.stringify(value).replace(/\{\{(\w+)\}\}/g, (_, key: string) => values[key] || key));
const compact = (value: unknown) => typeof value === "object" ? JSON.stringify(value) : String(value);
const quote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;

export function integrationSample(endpoint: ApiEndpoint, language: ApiLanguage): string {
  const method = endpoint.methods[0];
  const data: Record<string, unknown> = resolve(endpoint.body);
  const tokenName = endpoint.auth === "user" ? "JEBLAST_USER_TOKEN" : "JEBLAST_DEVICE_TOKEN";
  const tokenLabel = endpoint.auth === "user" ? "TOKEN_USER" : "TOKEN_DEVICE";
  const bearer = endpoint.auth === "device" || endpoint.auth === "user";
  const login = endpoint.auth === "none";
  const query = method === "GET" && Object.keys(data).length ? `?${new URLSearchParams(Object.entries(data).map(([key, value]) => [key, compact(value)]))}` : "";
  const url = catalogue.baseUrl + resolve(endpoint.path) + query;
  const multipart = endpoint.encoding === "multipart";
  const body = method !== "GET" && method !== "DELETE";
  const binary = endpoint.key === "media-download";
  const pretty = JSON.stringify(data, null, 2);

  if (language === "curl") {
    const parts = [`curl --request ${method}`, quote(url)];
    if (bearer) parts.push(`-H ${quote(`Authorization: Bearer ${tokenLabel}`)}`);
    if (multipart) Object.entries(data).forEach(([key, value]) => parts.push(`-F ${quote(`${key}=${key === "file" ? "@" : ""}${compact(value)}${key === "file" ? ";type=application/pdf" : ""}`)}`));
    else if (body) parts.push(`-H 'Content-Type: application/json'`, `--data-raw ${quote(pretty)}`);
    if (binary) parts.push("--output hasil-file.pdf");
    return parts.join(" \\\n  ");
  }
  if (language === "javascript") {
    let setup = login ? "// Node.js 18+; isi JEBLAST_EMAIL dan JEBLAST_PASSWORD.\n" : `// Node.js 18+; isi ${tokenName} pada environment server.\nconst token = process.env.${tokenName};\nif (!token) throw new Error('Token belum diisi');\n`;
    const headers = bearer ? "{ Authorization: `Bearer ${token}` }" : "{}";
    setup += `const headers = ${headers};\n`;
    if (multipart) {
      setup += "const { readFile } = await import('node:fs/promises');\nconst filePath = process.env.FILE_PATH || '/path/ke/berkas.pdf';\nconst form = new FormData();\n";
      for (const [key, value] of Object.entries(data)) setup += key === "file" ? `form.append('file', new Blob([await readFile(filePath)], { type: process.env.FILE_MIME || 'application/pdf' }), filePath.split(/[\\\\/]/).pop());\n` : `form.append(${JSON.stringify(key)}, ${key === "api_key" ? "token" : JSON.stringify(compact(value))});\n`;
    } else if (body) setup += `const data = ${pretty};\n${endpoint.auth === "body-device" ? "data.api_key = token;\n" : ""}${login ? "data.email = process.env.JEBLAST_EMAIL;\ndata.password = process.env.JEBLAST_PASSWORD;\n" : ""}headers['Content-Type'] = 'application/json';\n`;
    return setup + `const response = await fetch(${JSON.stringify(url)}, {\n  method: '${method}', headers${body ? `,\n  body: ${multipart ? "form" : "JSON.stringify(data)"}` : ""}\n});\n${binary ? "const { writeFile } = await import('node:fs/promises');\nif (!response.ok) throw new Error(`HTTP ${response.status}`);\nawait writeFile('hasil-file.pdf', Buffer.from(await response.arrayBuffer()));" : "const text = await response.text();\nconst result = text ? JSON.parse(text) : null;\nif (!response.ok || result?.result === false) {\n  throw new Error(`HTTP ${response.status}: ${text}`);\n}\nconsole.log(result);"}`;
  }
  if (language === "php") {
    let script = `<?php\n${login ? "" : `$token = getenv('${tokenName}');\nif (!$token) throw new RuntimeException('Token belum diisi');\n`}$headers = [${bearer ? "'Authorization: Bearer ' . $token" : ""}];\n`;
    if (body) script += `$data = json_decode(${quote(pretty).replace(/'\\''/g, "\\'")}, true, 512, JSON_THROW_ON_ERROR);\n${endpoint.auth === "body-device" ? "$data['api_key'] = $token;\n" : ""}`;
    if (login) script += "$data['email'] = getenv('JEBLAST_EMAIL');\n$data['password'] = getenv('JEBLAST_PASSWORD');\n";
    if (multipart) script += "$data['file'] = new CURLFile(getenv('FILE_PATH') ?: '/path/ke/berkas.pdf', getenv('FILE_MIME') ?: 'application/pdf');\n";
    else if (body) script += "$headers[] = 'Content-Type: application/json';\n";
    script += `$ch = curl_init(${JSON.stringify(url)});\ncurl_setopt_array($ch, [\n  CURLOPT_CUSTOMREQUEST => '${method}',\n  CURLOPT_RETURNTRANSFER => true,\n  CURLOPT_TIMEOUT => 30,\n  CURLOPT_HTTPHEADER => $headers${body ? `,\n  CURLOPT_POSTFIELDS => ${multipart ? "$data" : "json_encode($data, JSON_THROW_ON_ERROR)"}` : ""}\n]);\n$raw = curl_exec($ch);\nif ($raw === false) throw new RuntimeException(curl_error($ch));\n$status = curl_getinfo($ch, CURLINFO_HTTP_CODE);\ncurl_close($ch);\n`;
    return script + (binary ? "if ($status >= 400) throw new RuntimeException('HTTP ' . $status);\nfile_put_contents('hasil-file.pdf', $raw);" : "$result = $raw === '' ? null : json_decode($raw, true, 512, JSON_THROW_ON_ERROR);\nif ($status >= 400 || ($result['result'] ?? null) === false) {\n  throw new RuntimeException('HTTP ' . $status . ': ' . $raw);\n}\nprint_r($result);");
  }
  if (language === "python") {
    let script = `# pip install requests\nimport os\nimport json\nimport requests\n\n${login ? "" : `token = os.environ['${tokenName}']\n`}headers = ${bearer ? "{'Authorization': f'Bearer {token}'}" : "{}"}\n`;
    if (body) script += `data = json.loads(r'''${pretty}''')\n${endpoint.auth === "body-device" ? "data['api_key'] = token\n" : ""}`;
    if (login) script += "data['email'] = os.environ['JEBLAST_EMAIL']\ndata['password'] = os.environ['JEBLAST_PASSWORD']\n";
    if (multipart) script += `data.pop('file', None)\nwith open(os.environ.get('FILE_PATH', '/path/ke/berkas.pdf'), 'rb') as file:\n    response = requests.request('${method}', ${JSON.stringify(url)},\n        headers=headers, data=data,\n        files={'file': ('berkas.pdf', file, os.environ.get('FILE_MIME', 'application/pdf'))},\n        timeout=30)\n`;
    else script += `response = requests.request('${method}', ${JSON.stringify(url)},\n    headers=headers${body ? ", json=data" : ""}, timeout=30)\n`;
    script += "response.raise_for_status()\n";
    return script + (binary ? "with open('hasil-file.pdf', 'wb') as file:\n    file.write(response.content)" : "result = response.json() if response.content else None\nif isinstance(result, dict) and result.get('result') is False:\n    raise RuntimeError(result)\nprint(result)");
  }
  const imports = ['"fmt"', '"io"', '"net/http"', '"os"', '"time"', ...(body ? ['"bytes"'] : []), ...(body || !binary ? ['"encoding/json"'] : []), ...(multipart ? ['"mime/multipart"', '"net/textproto"', '"path/filepath"'] : [])];
  let script = `package main\n\nimport (\n  ${imports.join("\n  ")}\n)\n\nfunc main() {\n${login ? "" : `  token := os.Getenv("${tokenName}")\n  if token == "" { panic("Token belum diisi") }\n`}`;
  if (body) script += `  data := map[string]interface{}{}\n  if err := json.Unmarshal([]byte(\`${pretty}\`), &data); err != nil { panic(err) }\n${endpoint.auth === "body-device" ? '  data["api_key"] = token\n' : ""}`;
  if (login) script += '  data["email"] = os.Getenv("JEBLAST_EMAIL")\n  data["password"] = os.Getenv("JEBLAST_PASSWORD")\n';
  if (multipart) {
    script += `  var buffer bytes.Buffer\n  writer := multipart.NewWriter(&buffer)\n  for key, value := range data {\n    if key != "file" { if err := writer.WriteField(key, fmt.Sprint(value)); err != nil { panic(err) } }\n  }\n  filePath := os.Getenv("FILE_PATH")\n  if filePath == "" { filePath = "/path/ke/berkas.pdf" }\n  file, err := os.Open(filePath)\n  if err != nil { panic(err) }\n  defer file.Close()\n  mime := os.Getenv("FILE_MIME")\n  if mime == "" { mime = "application/pdf" }\n  header := make(textproto.MIMEHeader)\n  header.Set("Content-Disposition", fmt.Sprintf(\`form-data; name="file"; filename="%s"\`, filepath.Base(filePath)))\n  header.Set("Content-Type", mime)\n  part, err := writer.CreatePart(header)\n  if err != nil { panic(err) }\n  if _, err := io.Copy(part, file); err != nil { panic(err) }\n  if err := writer.Close(); err != nil { panic(err) }\n  req, err := http.NewRequest("${method}", ${JSON.stringify(url)}, &buffer)\n`;
  } else if (body) script += `  payload, err := json.Marshal(data)\n  if err != nil { panic(err) }\n  req, err := http.NewRequest("${method}", ${JSON.stringify(url)}, bytes.NewReader(payload))\n`;
  else script += `  req, err := http.NewRequest("${method}", ${JSON.stringify(url)}, nil)\n`;
  script += `  if err != nil { panic(err) }\n${bearer ? '  req.Header.Set("Authorization", "Bearer " + token)\n' : ""}${body ? `  req.Header.Set("Content-Type", ${multipart ? "writer.FormDataContentType()" : '"application/json"'})\n` : ""}  client := &http.Client{Timeout: 30 * time.Second}\n  response, err := client.Do(req)\n  if err != nil { panic(err) }\n  defer response.Body.Close()\n  raw, err := io.ReadAll(response.Body)\n  if err != nil { panic(err) }\n  if response.StatusCode >= 400 { panic(fmt.Sprintf("HTTP %d: %s", response.StatusCode, raw)) }\n`;
  return script + (binary ? '  if err := os.WriteFile("hasil-file.pdf", raw, 0600); err != nil { panic(err) }\n  fmt.Println("Berkas tersimpan")\n}' : '  var result map[string]interface{}\n  if json.Unmarshal(raw, &result) == nil {\n    if ok, exists := result["result"].(bool); exists && !ok { panic(string(raw)) }\n  }\n  fmt.Println(string(raw))\n}');
}
