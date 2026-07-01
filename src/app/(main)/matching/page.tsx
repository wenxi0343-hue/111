import { BoxSpecForm } from "./_components/box-spec-form";
import styles from "./matching.module.css";

export default function MatchingPage() {
  return (
    <section className={`page-section ${styles.page}`}>
      <header className={styles.header}>
        <h1>单次配纸</h1>
        <p>填写纸箱、产品和订单信息后生成配纸方案。</p>
      </header>

      <BoxSpecForm />
    </section>
  );
}
