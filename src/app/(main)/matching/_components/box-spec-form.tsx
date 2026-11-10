"use client";

import type { ReactNode, SelectHTMLAttributes } from "react";
import { useState } from "react";

import { Alert, Button, Form, Input, Switch } from "antd";

import { calculateAreaOptions } from "@/modules/calculations/area-options";
import type { LayerCount, FluteType } from "@/modules/calculations/types";

import styles from "../matching.module.css";

interface BoxSpecFormValues {
  lengthMm?: string | undefined;
  widthMm?: string | undefined;
  heightMm?: string | undefined;
  structureType?: string | undefined;
  formingMethod?: string | undefined;
  productType?: string | undefined;
  productWeightKg?: string | undefined;
  arrangement?: string | undefined;
  specialRequirements?:
    | {
        dieCutting?: boolean | undefined;
        punctureStrengthRequired?: boolean | undefined;
        notes?: string | undefined;
      }
    | undefined;
  productionQuantity?: string | undefined;
  stackingLayers?: string | undefined;
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

const initialValues = {
  structureType: "0201",
  formingMethod: "glue",
  productType: "食品",
  arrangement: "single_row",
  specialRequirements: {
    dieCutting: false,
    punctureStrengthRequired: false,
  },
} satisfies BoxSpecFormValues;

export function BoxSpecForm() {
  const [form] = Form.useForm<BoxSpecFormValues>();
  const [dimensionType, setDimensionType] = useState<"inner" | "outer">("inner");
  const [layerCount, setLayerCount] = useState("3");
  const [printing, setPrinting] = useState("no");
  const [showPhysicalRequirements, setShowPhysicalRequirements] = useState(false);
  const [physicalValues, setPhysicalValues] = useState<Record<string, string>>({});
  const [areaResults, setAreaResults] = useState<
    { fluteType: FluteType; areaSquareMeters: number }[]
  >([]);
  const [error, setError] = useState<string | null>(null);

  function handleFinish(values: BoxSpecFormValues) {
    const result = calculateAreaOptions({
      lengthMm: values.lengthMm ?? "",
      widthMm: values.widthMm ?? "",
      heightMm: values.heightMm ?? "",
      dimensionType,
      layerCount: Number(layerCount) as LayerCount,
      formingMethod: values.formingMethod === "staple" ? "staple" : "glue",
    });
    if (!result.ok) {
      setAreaResults([]);
      setError(result.message);
      return;
    }
    setError(null);
    setAreaResults(result.results);
  }

  function clearResults() {
    setAreaResults([]);
    setError(null);
  }

  const areaGroups = areaResults.reduce<{ flutes: FluteType[]; areaSquareMeters: number }[]>(
    (groups, result) => {
      const group = groups.find(
        (item) =>
          result.fluteType !== "BE" &&
          !item.flutes.includes("BE") &&
          item.areaSquareMeters === result.areaSquareMeters,
      );
      if (group) group.flutes.push(result.fluteType);
      else groups.push({ flutes: [result.fluteType], areaSquareMeters: result.areaSquareMeters });
      return groups;
    },
    [],
  );

  return (
    <div className={styles.formPanel}>
      <h2 className={styles.sectionTitle}>纸箱输入</h2>

      {error ? <Alert showIcon title={error} type="error" /> : null}

      <Form<BoxSpecFormValues>
        form={form}
        initialValues={initialValues}
        layout="vertical"
        name="box-spec-form"
        onFinish={handleFinish}
        onValuesChange={clearResults}
      >
        <div className={styles.formGrid}>
          <Form.Item label="尺寸类型">
            <Select
              aria-label="尺寸类型"
              value={dimensionType}
              onChange={(event) => {
                setDimensionType(event.target.value as "inner" | "outer");
                clearResults();
              }}
              options={[
                { label: "内径", value: "inner" },
                { label: "外径", value: "outer" },
              ]}
            />
          </Form.Item>
          <Form.Item label="纸箱层数">
            <Select
              aria-label="纸箱层数"
              value={layerCount}
              onChange={(event) => {
                setLayerCount(event.target.value);
                clearResults();
              }}
              options={[
                { label: "三层", value: "3" },
                { label: "五层", value: "5" },
                { label: "七层", value: "7" },
              ]}
            />
          </Form.Item>
          <Form.Item
            label={`纸箱${dimensionType === "inner" ? "内" : "外"}长（mm）`}
            name="lengthMm"
          >
            <Input
              aria-label={`纸箱${dimensionType === "inner" ? "内" : "外"}长（mm）`}
              inputMode="numeric"
            />
          </Form.Item>
          <Form.Item
            label={`纸箱${dimensionType === "inner" ? "内" : "外"}宽（mm）`}
            name="widthMm"
          >
            <Input
              aria-label={`纸箱${dimensionType === "inner" ? "内" : "外"}宽（mm）`}
              inputMode="numeric"
            />
          </Form.Item>
          <Form.Item
            label={`纸箱${dimensionType === "inner" ? "内" : "外"}高（mm）`}
            name="heightMm"
          >
            <Input
              aria-label={`纸箱${dimensionType === "inner" ? "内" : "外"}高（mm）`}
              inputMode="numeric"
            />
          </Form.Item>

          <Form.Item label="成箱方式" name="formingMethod">
            <Select
              aria-label="成箱方式"
              options={[
                { label: "粘箱", value: "glue" },
                { label: "钉箱", value: "staple" },
              ]}
            />
          </Form.Item>

          <Form.Item label="是否印刷">
            <Select
              aria-label="是否印刷"
              value={printing}
              onChange={(event) => setPrinting(event.target.value)}
              options={[
                { label: "否", value: "no" },
                { label: "是", value: "yes" },
              ]}
            />
          </Form.Item>

          <Form.Item label="生产数量（个）" name="productionQuantity">
            <Input aria-label="生产数量（个）" inputMode="numeric" />
          </Form.Item>

          <div className={styles.wideField ?? ""}>
            <Form.Item label="其他特殊说明" name={["specialRequirements", "notes"]}>
              <Input aria-label="其他特殊说明" />
            </Form.Item>
          </div>
        </div>

        <section className={styles.physicalRequirements}>
          <div className={styles.physicalHeader}>
            <div>
              <h3>物理指标要求</h3>
              <p>有明确要求时，可展开填写</p>
            </div>
            <Switch
              aria-label="物理指标要求"
              checked={showPhysicalRequirements}
              onChange={setShowPhysicalRequirements}
            />
          </div>
          {showPhysicalRequirements ? (
            <div className={styles.physicalBody}>
              {[
                {
                  title: "重量与堆码",
                  fields: ["空纸箱重量（kg）", "内装物重量（kg）", "堆码层数（层）"],
                },
                { title: "强度要求", fields: ["边压（kN/m）", "耐破", "空箱抗压（N）"] },
              ].map((group) => (
                <div key={group.title}>
                  <h4>{group.title}</h4>
                  <div className={styles.physicalGrid}>
                    {group.fields.map((field) => (
                      <Form.Item key={field} label={field}>
                        <Input
                          aria-label={field}
                          inputMode={field === "堆码层数（层）" ? "numeric" : "decimal"}
                          value={physicalValues[field] ?? ""}
                          onChange={(event) =>
                            setPhysicalValues((previous) => ({
                              ...previous,
                              [field]: event.target.value,
                            }))
                          }
                        />
                      </Form.Item>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </section>

        <div className={styles.actions}>
          <Button aria-label="生成方案" htmlType="submit" type="primary">
            生成方案
          </Button>
        </div>
      </Form>

      {areaResults.length > 0 ? (
        <section className={styles.resultPanel} aria-label="方案面积">
          <h3 className={styles.resultTitle}>单箱纸板面积</h3>
          <ul className={styles.metricList}>
            {areaGroups.map((result) => (
              <li key={result.flutes.join("-")}>
                <strong>{result.flutes.join("、")} 瓦</strong>：{result.areaSquareMeters.toFixed(3)}{" "}
                m²
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
