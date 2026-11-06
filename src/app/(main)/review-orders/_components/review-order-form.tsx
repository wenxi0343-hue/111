"use client";

import type { ReactNode, SelectHTMLAttributes } from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Checkbox, Form, Input } from "antd";

import { PRODUCT_TYPES } from "@/modules/box-spec/constants";
import {
  EXPECTED_TEST_ITEMS,
  REQUESTED_LAYER_COUNTS,
  type CreateReviewOrderInput,
} from "@/modules/review-orders/types";
import { createReviewOrder } from "@/server/actions/review-orders";
import type { ActionResult } from "@/shared/types/action-result";

import styles from "../review-orders.module.css";

interface ReviewOrderFormValues {
  customerName?: string;
  productName?: string;
  requestedLayerCount?: string;
  lengthMm?: string;
  widthMm?: string;
  heightMm?: string;
  structureType?: string;
  formingMethod?: string;
  productType?: string;
  productWeightKg?: string;
  arrangement?: string;
  productionQuantity?: string;
  stackingLayers?: string;
  specialNotes?: string;
  printingRequirements?: string;
  physicalRequirements?: string;
  hasSample?: boolean;
  sampleNotes?: string;
  expectedTestItems?: string[];
}

interface NativeSelectOption {
  label: ReactNode;
  value: string;
}

interface NativeSelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "children"> {
  options: NativeSelectOption[];
}

function Select({ className, options, ...props }: NativeSelectProps) {
  const mergedClassName = className ? `${styles.nativeSelect} ${className}` : styles.nativeSelect;

  return (
    <select className={mergedClassName} {...props}>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

const layerOptions = REQUESTED_LAYER_COUNTS.map((value) => ({
  label: `${value} 层`,
  value: String(value),
}));
const formingOptions = [
  { label: "粘箱", value: "glue" },
  { label: "钉箱", value: "staple" },
];
const productOptions = PRODUCT_TYPES.map((value) => ({ label: value, value }));
const arrangementOptions = [
  { label: "单排", value: "single_row" },
  { label: "双排", value: "double_row" },
  { label: "交错排列", value: "staggered" },
];

const initialValues = {
  structureType: "0201",
  formingMethod: "staple",
  productType: "食品",
  arrangement: "single_row",
  hasSample: false,
};

export function ReviewOrderForm() {
  const [form] = Form.useForm<ReviewOrderFormValues>();
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const hasSample = Form.useWatch("hasSample", form);

  async function handleFinish(values: ReviewOrderFormValues) {
    setMessage(null);
    setIsSubmitting(true);

    try {
      const input: CreateReviewOrderInput = {
        customerName: values.customerName,
        productName: values.productName,
        requestedLayerCount: values.requestedLayerCount,
        hasSample: values.hasSample === true,
        sampleNotes: values.sampleNotes,
        expectedTestItems: values.expectedTestItems,
        printingRequirements: values.printingRequirements,
        physicalRequirements: values.physicalRequirements,
        boxSpec: {
          lengthMm: values.lengthMm,
          widthMm: values.widthMm,
          heightMm: values.heightMm,
          structureType: values.structureType,
          formingMethod: values.formingMethod,
          productType: values.productType,
          productWeightKg: values.productWeightKg,
          arrangement: values.arrangement,
          productionQuantity: values.productionQuantity,
          stackingLayers: values.stackingLayers,
          specialRequirements: values.specialNotes ? { notes: values.specialNotes } : undefined,
        },
      };

      const result: ActionResult<{ orderId: string; orderNo: string }> = await createReviewOrder(input);

      if (!result.ok) {
        const fieldDetails = result.error.details?.fieldErrors as
          | { message: string }[]
          | undefined;
        const detailText = fieldDetails?.map((item) => item.message).join("；");
        setMessage({
          type: "error",
          text: detailText || result.error.message,
        });
        return;
      }

      setMessage({
        type: "success",
        text: `评审工单已创建：${result.data.orderNo}，状态：待工艺评审`,
      });
      form.resetFields();
      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className={styles.formPanel}>
      <h2 className={styles.sectionTitle}>新建评审工单</h2>
      {message ? <Alert type={message.type} message={message.text} showIcon /> : null}
      <Form
        form={form}
        layout="vertical"
        initialValues={initialValues}
        onFinish={handleFinish}
        requiredMark
      >
        <div className={styles.formGrid}>
          <Form.Item
            label="客户名称"
            name="customerName"
            rules={[{ required: true, message: "客户名称不能为空" }]}
          >
            <Input placeholder="如：张师" />
          </Form.Item>
          <Form.Item
            label="产品名称"
            name="productName"
            rules={[{ required: true, message: "产品名称不能为空" }]}
          >
            <Input placeholder="如：五层脱水莴笋片箱" />
          </Form.Item>
          <Form.Item
            label="纸箱层数（意向）"
            name="requestedLayerCount"
            rules={[{ required: true, message: "请选择纸箱层数" }]}
          >
            <Select options={layerOptions} />
          </Form.Item>

          <Form.Item
            label="纸箱内长 (mm)"
            name="lengthMm"
            rules={[{ required: true, message: "内长不能为空" }]}
          >
            <Input inputMode="numeric" placeholder="如 498" />
          </Form.Item>
          <Form.Item
            label="纸箱内宽 (mm)"
            name="widthMm"
            rules={[{ required: true, message: "内宽不能为空" }]}
          >
            <Input inputMode="numeric" placeholder="如 340" />
          </Form.Item>
          <Form.Item
            label="纸箱内高 (mm)"
            name="heightMm"
            rules={[{ required: true, message: "内高不能为空" }]}
          >
            <Input inputMode="numeric" placeholder="如 253" />
          </Form.Item>

          <Form.Item label="结构类型" name="structureType">
            <Input placeholder="如 0201" />
          </Form.Item>
          <Form.Item label="成箱方式" name="formingMethod">
            <Select options={formingOptions} />
          </Form.Item>
          <Form.Item label="产品类型" name="productType">
            <Select options={productOptions} />
          </Form.Item>

          <Form.Item
            label="内装物重量 (kg)"
            name="productWeightKg"
            rules={[{ required: true, message: "重量不能为空" }]}
          >
            <Input inputMode="decimal" placeholder="如 10" />
          </Form.Item>
          <Form.Item label="内装物排列" name="arrangement">
            <Select options={arrangementOptions} />
          </Form.Item>
          <Form.Item
            label="生产数量"
            name="productionQuantity"
            rules={[{ required: true, message: "生产数量不能为空" }]}
          >
            <Input inputMode="numeric" placeholder="如 1000" />
          </Form.Item>

          <Form.Item label="堆码层数（可选）" name="stackingLayers">
            <Input inputMode="numeric" placeholder="可选" />
          </Form.Item>
          <Form.Item label="印刷要求（可选）" name="printingRequirements" className={styles.wideField ?? ""}>
            <Input.TextArea rows={2} placeholder="如：彩色印刷、Logo 位置" />
          </Form.Item>
          <Form.Item label="物理指标要求（可选）" name="physicalRequirements" className={styles.wideField ?? ""}>
            <Input.TextArea rows={2} placeholder="客户未提则留空，工艺部按规则套最低要求" />
          </Form.Item>
          <Form.Item label="特殊要求备注（可选）" name="specialNotes" className={styles.wideField ?? ""}>
            <Input.TextArea rows={2} placeholder="如：防潮、易碎" />
          </Form.Item>

          <Form.Item name="hasSample" valuePropName="checked" className={styles.wideField ?? ""}>
            <Checkbox>有样品（带回公司检测）</Checkbox>
          </Form.Item>

          {hasSample ? (
            <>
              <Form.Item
                label="样品说明（可选）"
                name="sampleNotes"
                className={styles.wideField ?? ""}
              >
                <Input.TextArea rows={2} placeholder="样品外观、数量、来源等" />
              </Form.Item>
              <Form.Item
                label="期望检测项"
                name="expectedTestItems"
                className={styles.wideField ?? ""}
                rules={[{ required: true, message: "请至少选择一项期望检测项" }]}
              >
                <Checkbox.Group options={EXPECTED_TEST_ITEMS as unknown as string[]} />
              </Form.Item>
            </>
          ) : null}
        </div>

        <div className={styles.actions}>
          <Button type="primary" htmlType="submit" loading={isSubmitting}>
            创建评审工单
          </Button>
        </div>
      </Form>
    </section>
  );
}
