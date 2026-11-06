import {
  listReviewOrdersAction,
} from "@/server/actions/review-orders";
import { REVIEW_ORDER_STATUS_LABELS } from "@/modules/review-orders/types";
import { ReviewOrderForm } from "./_components/review-order-form";
import styles from "./review-orders.module.css";

export default async function ReviewOrdersPage() {
  const result = await listReviewOrdersAction();
  const orders = result.ok ? result.data : [];

  return (
    <section className={`page-section ${styles.page}`}>
      <header className={styles.header}>
        <h1>评审工单</h1>
        <p>
          流程1 · 业务员录入：采集纸箱尺寸、层数、装物重量、印刷与物理指标要求，含无样品/有样品两种情形，
          生成待工艺评审工单。
        </p>
      </header>

      <ReviewOrderForm />

      <section className={styles.listPanel}>
        <h2 className={styles.sectionTitle}>工单列表</h2>
        {orders.length === 0 ? (
          <p className={styles.emptyText}>暂无工单，请在上方创建。</p>
        ) : (
          <ul className={styles.orderList}>
            {orders.map((order) => (
              <li key={order.id} className={styles.orderItem}>
                <div className={styles.orderHead}>
                  <strong>{order.orderNo}</strong>
                  <span className={styles.statusBadge}>
                    {REVIEW_ORDER_STATUS_LABELS[order.status as keyof typeof REVIEW_ORDER_STATUS_LABELS] ?? order.status}
                  </span>
                </div>
                <div className={styles.orderTitle}>
                  {order.customerName} · {order.productName}
                </div>
                <div className={styles.orderMeta}>
                  <span>业务员 {order.salesperson}</span>
                  <span>{order.hasSample ? "有样品" : "无样品"}</span>
                  <span>{order.requestedLayerCount ? `${order.requestedLayerCount} 层` : "层数意向待定"}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
