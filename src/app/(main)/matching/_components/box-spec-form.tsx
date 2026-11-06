"use client";

import type { ReactNode, SelectHTMLAttributes } from "react";
import { useState } from "react";

import { Alert, Button, Checkbox, Form, Input } from "antd";

import { PRODUCT_TYPES } from "@/modules/box-spec/constants";
import type { BoxSpecField, BoxSpecFieldError, BoxSpecInput } from "@/modules/box-spec/types";
import type { RecommendationSlot } from "@/modules/recommendation/types";
import {
  generateMatchingScheme,
  saveConfirmedMatchingScheme,
  type GenerateMatchingSchemeResult,
  type SaveConfirmedMatchingSchemeResult,
} from "@/server/actions/matching-actions";
import type { ActionResult } from "@/shared/types/action-result";

import styles from "../matching.module.css";
import { MatchingResultPanel } from "./matching-result-panel";

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

type ActionFailure = Extract<ActionResult<unknown>, { ok: false }>;

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

const fieldNames = [
  "lengthMm",
  "widthMm",
  "heightMm",
  "structureType",
  "formingMethod",
  "productType",
  "productWeightKg",
  "arrangement",
  "specialRequirements",
  "productionQuantity",
  "stackingLayers",
] as const satisfies ReadonlyArray<keyof BoxSpecFormValues>;

export function BoxSpecForm() {
  const [form] = Form.useForm<BoxSpecFormValues>();
  const [baseDataMessage, setBaseDataMessage] = useState<string | null>(null);
  const [missingItems, setMissingItems] = useState<MatchingDataMissingItem[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [matchingResult, setMatchingResult] = useState<GenerateMatchingSchemeResult | null>(null);
  const [selectedStrategy, setSelectedStrategy] = useState<RecommendationSlot["strategy"] | null>(
    null,
  );
  const [savedResult, setSavedResult] = useState<SaveConfirmedMatchingSchemeResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  async function handleFinish(values: BoxSpecFormValues) {
    clearMessages();
    clearFieldErrors();
    setIsSubmitting(true);

    try {
      const result = await generateMatchingScheme(toBoxSpecInput(values));

      if (!result.ok) {
        applyActionError(result);
        return;
      }

      setMatchingResult(result.data);
      setSelectedStrategy(null);
      setSavedResult(null);
      setMissingItems([]);
      setStatusMessage("生成前检查通过");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSaveConfirmedScheme() {
    if (!matchingResult || !selectedStrategy) {
      setBaseDataMessage("请选择一套方案");
      return;
    }

    const selectedSlot = getSelectedSlot(matchingResult, selectedStrategy);

    if (!selectedSlot?.evaluation) {
      setBaseDataMessage("请先选择可保存的最终方案");
      return;
    }

    if (savedResult) {
      return;
    }

    setBaseDataMessage(null);
    setStatusMessage(null);
    setSavedResult(null);
    setIsSaving(true);

    try {
      const result = await saveConfirmedMatchingScheme({
        boxSpec: toSaveBoxSpecInput(matchingResult.boxSpec),
        originalRecommendationSlots: matchingResult.recommendationSlots,
        selectedStrategy,
        generationToken: matchingResult.generationToken,
      });

      if (!result.ok) {
        setBaseDataMessage(result.error.message);
        return;
      }

      setSavedResult(result.data);
      setStatusMessage("保存成功");
    } finally {
      setIsSaving(false);
    }
  }

  function handleSelectStrategy(strategy: RecommendationSlot["strategy"]) {
    if (!matchingResult) {
      return;
    }

    setSelectedStrategy(strategy);
    setSavedResult(null);
    setBaseDataMessage(null);
    setStatusMessage(null);
  }

  function clearMessages() {
    setBaseDataMessage(null);
    setMissingItems([]);
    setStatusMessage(null);
    setMatchingResult(null);
    setSelectedStrategy(null);
    setSavedResult(null);
  }

  function clearFieldErrors() {
    form.setFields(fieldNames.map((name) => ({ name, errors: [] })));
  }

  function applyActionError(result: ActionFailure) {
    const fieldErrors = getFieldErrors(result.error.details);
    const baseDataError = fieldErrors.find((fieldError) => fieldError.field === "baseData");
    const inputFieldErrors = fieldErrors.filter(isInputFieldError);

    if (inputFieldErrors.length > 0) {
      form.setFields(
        inputFieldErrors.map((fieldError) => ({
          name: fieldError.field,
          errors: [fieldError.message],
        })),
      );
    }

    setBaseDataMessage(baseDataError?.message ?? result.error.message);
    setMissingItems(getMissingItems(result.error.details));
  }

  const canSaveConfirmedScheme = Boolean(selectedStrategy) && savedResult === null;

  return (
    <div className={styles.formPanel}>
      <h2 className={styles.sectionTitle}>纸箱输入</h2>

      {baseDataMessage ? <Alert showIcon title={baseDataMessage} type="error" /> : null}
      {missingItems.length > 0 ? <MissingItemsPanel items={missingItems} /> : null}
      {statusMessage ? <Alert showIcon title={statusMessage} type="success" /> : null}

      <Form<BoxSpecFormValues>
        form={form}
        initialValues={initialValues}
        layout="vertical"
        name="box-spec-form"
        onFinish={handleFinish}
      >
        <div className={styles.formGrid}>
          <Form.Item label="纸箱内长（mm）" name="lengthMm">
            <Input aria-label="纸箱内长（mm）" inputMode="numeric" />
          </Form.Item>

          <Form.Item label="纸箱内宽（mm）" name="widthMm">
            <Input aria-label="纸箱内宽（mm）" inputMode="numeric" />
          </Form.Item>

          <Form.Item label="纸箱内高（mm）" name="heightMm">
            <Input aria-label="纸箱内高（mm）" inputMode="numeric" />
          </Form.Item>

          <Form.Item label="纸箱结构类型" name="structureType">
            <Select aria-label="纸箱结构类型" options={[{ label: "0201 普箱", value: "0201" }]} />
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

          <Form.Item label="产品类型" name="productType">
            <Select
              aria-label="产品类型"
              options={PRODUCT_TYPES.map((productType) => ({
                label: productType,
                value: productType,
              }))}
            />
          </Form.Item>

          <Form.Item label="内装物重量（kg）" name="productWeightKg">
            <Input aria-label="内装物重量（kg）" inputMode="decimal" />
          </Form.Item>

          <Form.Item label="内装物排列方式" name="arrangement">
            <Select
              aria-label="内装物排列方式"
              options={[
                { label: "单排", value: "single_row" },
                { label: "双排", value: "double_row" },
                { label: "交错排列", value: "staggered" },
              ]}
            />
          </Form.Item>

          <Form.Item label="生产数量（个）" name="productionQuantity">
            <Input aria-label="生产数量（个）" inputMode="numeric" />
          </Form.Item>

          <Form.Item label="堆码层数（层）" name="stackingLayers">
            <Input aria-label="堆码层数（层）" inputMode="numeric" />
          </Form.Item>

          <div className={styles.wideField ?? ""}>
            <Form.Item label="特殊要求">
              <div className={styles.specialRequirementGroup}>
                <Form.Item
                  name={["specialRequirements", "dieCutting"]}
                  noStyle
                  valuePropName="checked"
                >
                  <Checkbox aria-label="模切工艺">模切工艺</Checkbox>
                </Form.Item>
                <Form.Item
                  name={["specialRequirements", "punctureStrengthRequired"]}
                  noStyle
                  valuePropName="checked"
                >
                  <Checkbox aria-label="戳穿强度要求">戳穿强度要求</Checkbox>
                </Form.Item>
              </div>
            </Form.Item>
            <Form.Item label="其他特殊说明" name={["specialRequirements", "notes"]}>
              <Input aria-label="其他特殊说明" />
            </Form.Item>
          </div>
        </div>

        <div className={styles.actions}>
          <Button aria-label="生成方案" htmlType="submit" loading={isSubmitting} type="primary">
            生成方案
          </Button>
        </div>
      </Form>

      {matchingResult ? (
        <MatchingResultPanel
          canSave={canSaveConfirmedScheme}
          isSaving={isSaving}
          matchingResult={matchingResult}
          onSave={handleSaveConfirmedScheme}
          onSelectStrategy={handleSelectStrategy}
          savedResult={savedResult}
          selectedStrategy={selectedStrategy}
        />
      ) : null}
    </div>
  );
}

interface MatchingDataMissingItem {
  scope: "paper_material" | "formula_parameter";
  code?: string | undefined;
  name?: string | undefined;
  field: string;
  message: string;
}

function MissingItemsPanel({ items }: { items: MatchingDataMissingItem[] }) {
  const visibleItems = items.slice(0, 20);
  const hiddenCount = items.length - visibleItems.length;

  return (
    <section className={styles.missingDataPanel} aria-label="缺失资料清单">
      <h3>缺失资料清单</h3>
      <ul>
        {visibleItems.map((item, index) => (
          <li key={`${item.scope}-${item.code ?? item.field}-${index}`}>{item.message}</li>
        ))}
      </ul>
      {hiddenCount > 0 ? <p>还有 {hiddenCount} 项缺失资料，请在后端资料库继续补齐。</p> : null}
    </section>
  );
}

function getSelectedSlot(
  result: GenerateMatchingSchemeResult,
  selectedStrategy: RecommendationSlot["strategy"],
): RecommendationSlot | undefined {
  return result.recommendationSlots.find((slot) => slot.strategy === selectedStrategy);
}

function toBoxSpecInput(values: BoxSpecFormValues): BoxSpecInput {
  return {
    lengthMm: values.lengthMm,
    widthMm: values.widthMm,
    heightMm: values.heightMm,
    structureType: values.structureType,
    formingMethod: values.formingMethod,
    productType: values.productType,
    productWeightKg: values.productWeightKg,
    arrangement: values.arrangement,
    specialRequirements: {
      dieCutting: values.specialRequirements?.dieCutting === true,
      punctureStrengthRequired: values.specialRequirements?.punctureStrengthRequired === true,
      notes: values.specialRequirements?.notes,
    },
    productionQuantity: values.productionQuantity,
    stackingLayers: values.stackingLayers || undefined,
  };
}

function toSaveBoxSpecInput(boxSpec: GenerateMatchingSchemeResult["boxSpec"]): BoxSpecInput {
  return {
    lengthMm: boxSpec.lengthMm,
    widthMm: boxSpec.widthMm,
    heightMm: boxSpec.heightMm,
    structureType: boxSpec.structureType,
    formingMethod: boxSpec.formingMethod,
    productType: boxSpec.productType,
    productWeightKg: boxSpec.productWeightKg,
    arrangement: boxSpec.arrangement,
    specialRequirements: boxSpec.specialRequirements,
    productionQuantity: boxSpec.productionQuantity,
    ...(boxSpec.stackingRequirement.status === "required"
      ? { stackingLayers: boxSpec.stackingRequirement.stackingLayers }
      : {}),
  };
}

function getFieldErrors(details: Record<string, unknown> | undefined): BoxSpecFieldError[] {
  const fieldErrors = details?.fieldErrors;

  if (!Array.isArray(fieldErrors)) {
    return [];
  }

  return fieldErrors.filter(isBoxSpecFieldError);
}

function getMissingItems(details: Record<string, unknown> | undefined): MatchingDataMissingItem[] {
  const value = details?.missingItems;

  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isMatchingDataMissingItem);
}

function isMatchingDataMissingItem(value: unknown): value is MatchingDataMissingItem {
  if (!value || typeof value !== "object") {
    return false;
  }

  const item = value as Partial<MatchingDataMissingItem>;

  return (
    (item.scope === "paper_material" || item.scope === "formula_parameter") &&
    typeof item.field === "string" &&
    typeof item.message === "string"
  );
}

function isBoxSpecFieldError(value: unknown): value is BoxSpecFieldError {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as { field?: unknown; message?: unknown };

  return isBoxSpecField(candidate.field) && typeof candidate.message === "string";
}

function isInputFieldError(
  fieldError: BoxSpecFieldError,
): fieldError is BoxSpecFieldError & { field: keyof BoxSpecFormValues } {
  return fieldError.field !== "baseData";
}

function isBoxSpecField(field: unknown): field is BoxSpecField {
  return typeof field === "string" && (field === "baseData" || fieldNames.includes(field as never));
}
