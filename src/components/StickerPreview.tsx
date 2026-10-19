import { useUiTranslation } from "@/lib/uiTranslation";
import { useEffect, useState } from "react";
import { Image, Typography } from "antd";
import axios from "axios";

export default function StickerPreview({ id, headers }: { id?: string; headers: Record<string, string> }) {
  const uiText = useUiTranslation();
  const authorization = headers.Authorization;
  const [url, setUrl] = useState("");
  useEffect(() => {
    setUrl("");
    if (!id) return;
    const controller = new AbortController();
    let objectUrl = "";
    axios.get(`/api/media/${id}`, { headers: { Authorization: authorization }, responseType: "blob", signal: controller.signal })
      .then(response => { if (!controller.signal.aborted) { objectUrl = URL.createObjectURL(response.data); setUrl(objectUrl); } })
      .catch(() => {});
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [id, authorization]);
  return url ? <div><Image src={url} alt={uiText("Pratinjau stiker")} width={128} height={128} style={{ objectFit: "contain" }} /><br /><Typography.Text type="secondary">{uiText("Pratinjau stiker")}</Typography.Text></div> : null;
}
