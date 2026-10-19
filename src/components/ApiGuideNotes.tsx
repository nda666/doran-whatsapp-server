import { ReactNode } from "react";
import styles from "@/styles/ApiDocs.module.css";

export default function ApiGuideNotes({ label, sections }: { label: string; sections: { title: string; items: ReactNode[] }[] }) {
  return <div className={styles.notes} aria-label={label}>
    {sections.map(section => <section className={styles.noteSection} key={section.title}>
      <h5>{section.title}</h5>
      <ul>{section.items.map((item, index) => <li key={index}>{item}</li>)}</ul>
    </section>)}
  </div>;
}
