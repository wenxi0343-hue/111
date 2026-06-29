import { ImportUploadPanel } from "./_components/import-upload-panel";
import styles from "./master-data.module.css";

export default function MasterDataPage() {
  return (
    <section className={`page-section ${styles.page}`}>
      <header className={styles.header}>
        <h1>数据维护</h1>
        <p>导入原纸代码表后先预览，再确认建立纸厂和原纸基础资料。</p>
      </header>

      <ImportUploadPanel />
    </section>
  );
}
