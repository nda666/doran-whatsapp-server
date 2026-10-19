import { useUiTranslation } from "@/lib/uiTranslation";
import { Fragment } from "react";
import { endpointNoteSections } from "@/lib/apiEndpointNotes";
import styles from "@/styles/ApiDocs.module.css";

function noteText(text: string) {
  return text.split(/(\b(?:job_id|transaction_id|store_id|message_key|media_id|api_key|curl_error|dry_run|queued|existing|selectableCount|user_token|dispatch_id|userId)\b|data\[\]\.(?:id)|dispatch\.id|\/api\/[\w/-]+|\b(?:FAILED|UNCERTAIN|QUEUED|PROCESSING|SENT|DELIVERED|READ)\b)/g)
    .map((part, index) => index % 2 ? <code key={index}>{part}</code> : <Fragment key={index}>{part}</Fragment>);
}

export default function ApiEndpointNotes({ notes, aliases = [] }: { notes: string; aliases?: string[] }) {
  const uiText = useUiTranslation();
  return <div className={styles.notes} aria-label={uiText("Keterangan API")}>
    {endpointNoteSections(notes).map(section => <section className={styles.noteSection} key={uiText(section.title)}>
      <h5>{section.title}</h5>
      <ul>{section.items.map((item, index) => <li key={index}>{noteText(uiText(item))}</li>)}</ul>
    </section>)}
    {aliases.length > 0 && <section className={styles.noteSection}>
      <h5>{uiText("Alias endpoint")}</h5>
      <div className={styles.aliases}><div>{aliases.map(path => <code key={path}>{path}</code>)}</div><p>{uiText("Handler, status HTTP, dan respons sama dengan endpoint di atas.")}</p></div>
    </section>}
  </div>;
}
