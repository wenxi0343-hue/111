"use client";

import { useState } from "react";

import { Alert, Button, Form, Input, Select } from "antd";

import type { BoxSpecField, BoxSpecFieldError, BoxSpecInput } from "@/modules/box-spec/types";
import type {
  EligibleCandidateEvaluation,
  MatchingCandidate,
  RejectedCandidateEvaluation,
} from "@/modules/calculations/types";
import {
  generateMatchingScheme,
  type GenerateMatchingSchemeResult,
} from "@/server/actions/matching-actions";
import type { ActionResult } from "@/shared/types/action-result";

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
  specialRequirements?: string | undefined;
  productionQuantity?: string | undefined;
  stackingLayers?: string | undefined;
}

type ActionFailure = Extract<ActionResult<unknown>, { ok: false }>;

const initialValues = {
  structureType: "0201",
  formingMethod: "glue",
  arrangement: "single_row",
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
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [matchingResult, setMatchingResult] =
    useState<GenerateMatchingSchemeResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      setStatusMessage("生成前检查通过");
    } finally {
      setIsSubmitting(false);
    }
  }

  function clearMessages() {
    setBaseDataMessage(null);
    setStatusMessage(null);
    setMatchingResult(null);
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
  }

  return (
    <div className={styles.formPanel}>
      <h2 className={styles.sectionTitle}>纸箱输入</h2>

      {baseDataMessage ? <Alert showIcon title={baseDataMessage} type="error" /> : null}
      {statusMessage ? <Alert showIcon title={statusMessage} type="success" /> : null}

      <Form<BoxSpecFormValues>
        form={form}
        initialValues={initialValues}
        layout="vertical"
        name="box-spec-form"
        onFinish={handleFinish}
      >
        <div className={styles.formGrid}>
          <Form.Item label="纸箱长度（mm）" name="lengthMm">
            <Input aria-label="纸箱长度（mm）" inputMode="numeric" />
          </Form.Item>

          <Form.Item label="纸箱宽度（mm）" name="widthMm">
            <Input aria-label="纸箱宽度（mm）" inputMode="numeric" />
          </Form.Item>

          <Form.Item label="纸箱高度（mm）" name="heightMm">
            <Input aria-label="纸箱高度（mm）" inputMode="numeric" />
          </Form.Item>

          <Form.Item label="纸箱结构类型" name="structureType">
            <Select
              aria-label="纸箱结构类型"
              options={[{ label: "0201 普箱", value: "0201" }]}
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

          <Form.Item label="产品类型" name="productType">
            <Input aria-label="产品类型" />
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

          <Form.Item
            className={styles.wideField ?? ""}
            label="特殊要求"
            name="specialRequirements"
          >
            <Input aria-label="特殊要求" />
          </Form.Item>
        </div>

        <div className={styles.actions}>
          <Button aria-label="生成方案" htmlType="submit" loading={isSubmitting} type="primary">
            生成方案
          </Button>
        </div>
      </Form>

      {matchingResult ? (
        <section className={styles.resultPanel} aria-label="生成结果">
          <h3 className={styles.resultTitle}>生成结果</h3>
          <dl className={styles.resultList}>
            <div>
              <dt>堆码承重</dt>
              <dd>{getStackingStatusText(matchingResult)}</dd>
            </div>
          </dl>

          <section className={styles.resultSection} aria-label="推荐方案">
            <h4 className={styles.resultSubtitle}>推荐方案</h4>
            {matchingResult.recommendations.length > 0 ? (
              <div className={styles.candidateGrid}>
                {matchingResult.recommendations.map((evaluation) => (
                  <article className={styles.candidateItem} key={evaluation.candidate.id}>
                    <h5>{formatCandidateTitle(evaluation.candidate)}</h5>
                    <p>{formatPaperSummary(evaluation.candidate)}</p>
                    <ul className={styles.metricList}>
                      <li>{formatArea(evaluation)}</li>
                      <li>{formatBct(evaluation)}</li>
                      <li>{formatEdgeCrush(evaluation)}</li>
                      <li>{formatTaxIncludedCost(evaluation)}</li>
                    </ul>
                  </article>
                ))}
              </div>
            ) : (
              <p className={styles.emptyText}>当前没有达标且可生产的推荐方案</p>
            )}
          </section>

          {matchingResult.rejectedSummary.length > 0 ? (
            <section className={styles.resultSection} aria-label="不推荐原因汇总">
              <h4 className={styles.resultSubtitle}>不推荐原因汇总</h4>
              <ul className={styles.summaryList}>
                {matchingResult.rejectedSummary.map((summary) => (
                  <li key={summary.type}>
                    {summary.label} {summary.count}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {matchingResult.rejectedCandidates.length > 0 ? (
            <section className={styles.resultSection} aria-label="不可推荐候选明细">
              <h4 className={styles.resultSubtitle}>不可推荐候选明细</h4>
              <div className={styles.rejectedList}>
                {matchingResult.rejectedCandidates.map((evaluation) => (
                  <details
                    className={styles.rejectedItem}
                    data-testid={`rejected-candidate-${evaluation.candidate.id}`}
                    key={evaluation.candidate.id}
                    open
                  >
                    <summary>
                      {formatCandidateTitle(evaluation.candidate)} -{" "}
                      {formatPaperSummary(evaluation.candidate)}
                    </summary>
                    <ul className={styles.reasonList}>
                      {evaluation.reasons.map((reason) => (
                        <li key={`${reason.type}-${reason.code}-${reason.message}`}>
                          {reason.message}
                        </li>
                      ))}
                    </ul>
                    {shouldShowCalculatedDetails(evaluation) ? (
                      <ul className={styles.metricList}>
                        <li>{formatRejectedArea(evaluation)}</li>
                        <li>{formatRejectedBct(evaluation)}</li>
                        <li>{formatRejectedEdgeCrush(evaluation)}</li>
                        <li>{formatRejectedBurst(evaluation)}</li>
                        <li>{formatRejectedTaxIncludedCost(evaluation)}</li>
                      </ul>
                    ) : null}
                  </details>
                ))}
              </div>
            </section>
          ) : null}
        </section>
      ) : null}
    </div>
  );
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
    specialRequirements: values.specialRequirements,
    productionQuantity: values.productionQuantity,
    stackingLayers: values.stackingLayers || undefined,
  };
}

function getFieldErrors(details: Record<string, unknown> | undefined): BoxSpecFieldError[] {
  const fieldErrors = details?.fieldErrors;

  if (!Array.isArray(fieldErrors)) {
    return [];
  }

  return fieldErrors.filter(isBoxSpecFieldError);
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

function getStackingStatusText(result: GenerateMatchingSchemeResult) {
  const { stackingRequirement } = result.boxSpec;

  if (stackingRequirement.status === "required") {
    return `${result.stackingDisplayText}（${stackingRequirement.stackingLayers} 层）`;
  }

  return result.stackingDisplayText;
}

function formatCandidateTitle(candidate: MatchingCandidate): string {
  return `${candidate.layerCount} 层 ${candidate.fluteType} 楞`;
}

function formatPaperSummary(candidate: MatchingCandidate): string {
  return candidate.layers.map((layer) => layer.paper.paperCode).join(" / ");
}

function formatArea(evaluation: EligibleCandidateEvaluation): string {
  return `面积 ${formatDecimal(evaluation.area.areaSquareMeters, 4)} m²`;
}

function formatBct(evaluation: EligibleCandidateEvaluation): string {
  return `空箱抗压 ${evaluation.strength.bctN} N`;
}

function formatEdgeCrush(evaluation: EligibleCandidateEvaluation): string {
  return `边压 ${formatDecimal(evaluation.strength.edgeCrushKnPerM, 2)} kN/m`;
}

function formatTaxIncludedCost(evaluation: EligibleCandidateEvaluation): string {
  return `含税成本 ${formatDecimal(evaluation.cost.taxIncludedCostYuan, 2)} 元`;
}

function formatRejectedArea(evaluation: RejectedCandidateEvaluation): string {
  return `面积 ${formatDecimal(evaluation.area?.areaSquareMeters ?? 0, 4)} m²`;
}

function formatRejectedBct(evaluation: RejectedCandidateEvaluation): string {
  return `空箱抗压 ${evaluation.strength?.bctN ?? 0} N`;
}

function formatRejectedEdgeCrush(evaluation: RejectedCandidateEvaluation): string {
  return `边压 ${formatDecimal(evaluation.strength?.edgeCrushKnPerM ?? 0, 2)} kN/m`;
}

function formatRejectedBurst(evaluation: RejectedCandidateEvaluation): string {
  return `耐破 ${evaluation.strength?.burstStrength ?? 0}`;
}

function formatRejectedTaxIncludedCost(evaluation: RejectedCandidateEvaluation): string {
  return `含税成本 ${formatDecimal(evaluation.cost?.taxIncludedCostYuan ?? 0, 2)} 元`;
}

function shouldShowCalculatedDetails(evaluation: RejectedCandidateEvaluation): boolean {
  return Boolean(evaluation.strength && evaluation.cost);
}

function formatDecimal(value: number, fractionDigits: number): string {
  return value.toFixed(fractionDigits);
}
