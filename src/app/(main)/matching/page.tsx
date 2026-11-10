import { BoxSpecForm } from "./_components/box-spec-form";
import styles from "./matching.module.css";

export default function MatchingPage() {
  return (
    <section className={`page-section ${styles.page}`}>
      <header className={styles.header}>
        <h1>单次配纸</h1>
        <p>填写纸箱尺寸和层数，查看各瓦型的单箱纸板面积。</p>
        <div className={styles.statusRow} aria-label="配纸访问状态">
          <span className={`${styles.tag} ${styles.openTag}`}>免登录配纸</span>
          <span className={styles.tag}>面积计算</span>
        </div>
      </header>

      <BoxSpecForm />
    </section>
  );
}
