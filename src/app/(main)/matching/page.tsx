import { BoxSpecForm } from "./_components/box-spec-form";
import styles from "./matching.module.css";

export default function MatchingPage() {
  return (
    <section className={`page-section ${styles.page}`}>
      <header className={styles.header}>
        <h1>单次配纸</h1>
        <p>填写纸箱、产品和订单信息后生成配纸方案。</p>
        <div className={styles.statusRow} aria-label="配纸访问状态">
          <span className={`${styles.tag} ${styles.openTag}`}>免登录配纸</span>
          <span className={`${styles.tag} ${styles.lockedTag}`}>后端资料</span>
          <span className={styles.tag}>可保存导出</span>
        </div>
      </header>

      <BoxSpecForm />
    </section>
  );
}
