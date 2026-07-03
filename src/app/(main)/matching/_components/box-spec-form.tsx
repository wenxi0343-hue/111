"use client";

import { useState } from "react";

import { Alert, Button, Form, Input, Select } from "antd";

import type { BoxSpecField, BoxSpecFieldError, BoxSpecInput } from "@/modules/box-spec/types";
import type {
  CandidateEvaluation,
  FluteType,
  LayerCount,
  MatchingCandidate,
  RejectedCandidateEvaluation,
  RejectionReason,
} from "@/modules/calculations/types";
import type { RecommendationSlot } from "@/modules/recommendation/types";
import { matchingSchemePdfExportTypeLabels } from "@/modules/import-export/matching-scheme-pdf-types";
import type {
  RecalculateAdjustedSchemeResult,
  SchemeAdjustmentInput,
  SchemeAdjustmentLayerInput,
} from "@/modules/scheme-adjustment/types";
import {
  generateMatchingScheme,
  recalculateAdjustedScheme,
  saveConfirmedMatchingScheme,
  type GenerateMatchingSchemeResult,
  type SaveConfirmedMatchingSchemeResult,
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
type FinalSchemeState = "selected" | "dirty" | "recalculated";

const notSaveableMessage = "当前方案未达标或不可生产，无法确认保存";

const initialValues = {
  structureType: "0201",
  formingMethod: "glue",
  arrangement: "single_row",
} satisfies BoxSpecFormValues;

const recommendationStatusLabels: Record<RecommendationSlot["status"], string> = {
  recommended: "正式推荐",
  repeated: "重复推荐",
  unavailable: "不可用",
  reference: "参考方案",
};

const finalStatusLabels: Record<RecalculateAdjustedSchemeResult["finalStatus"], string> = {
  qualified: "达标",
  unqualified: "未达标",
  not_manufacturable: "不可生产",
  data_incomplete: "数据不足",
};

const layerCountOptions = [
  { label: "3 层", value: 3 },
  { label: "5 层", value: 5 },
  { label: "7 层", value: 7 },
] satisfies Array<{ label: string; value: LayerCount }>;

const fluteOptions = [
  { label: "A 楞", value: "A" },
  { label: "B 楞", value: "B" },
  { label: "C 楞", value: "C" },
  { label: "E 楞", value: "E" },
  { label: "AB 楞", value: "AB" },
  { label: "AC 楞", value: "AC" },
  { label: "BC 楞", value: "BC" },
  { label: "BA 楞", value: "BA" },
  { label: "BE 楞", value: "BE" },
  { label: "BAC 楞", value: "BAC" },
] satisfies Array<{ label: string; value: FluteType }>;

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
  const [selectedStrategy, setSelectedStrategy] =
    useState<RecommendationSlot["strategy"] | null>(null);
  const [finalSchemeState, setFinalSchemeState] = useState<FinalSchemeState | null>(null);
  const [adjustments, setAdjustments] = useState<SchemeAdjustmentInput | null>(null);
  const [recalculatedResult, setRecalculatedResult] =
    useState<RecalculateAdjustedSchemeResult | null>(null);
  const [savedResult, setSavedResult] = useState<SaveConfirmedMatchingSchemeResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);

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
      setFinalSchemeState(null);
      setAdjustments(null);
      setRecalculatedResult(null);
      setSavedResult(null);
      setStatusMessage("生成前检查通过");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSaveConfirmedScheme() {
    if (!matchingResult || !selectedStrategy) {
      return;
    }

    if (finalSchemeState === "dirty") {
      setBaseDataMessage("请先重新校核后再保存");
      return;
    }

    if (recalculatedResult && !recalculatedResult.canSave) {
      setBaseDataMessage(notSaveableMessage);
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
        baseCandidate: selectedSlot.evaluation.candidate,
        ...(finalSchemeState === "recalculated" && adjustments ? { adjustments } : {}),
        clientState: "recalculated",
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

    const selectedSlot = getSelectedSlot(matchingResult, strategy);

    setSelectedStrategy(strategy);
    setFinalSchemeState("selected");
    setRecalculatedResult(null);
    setSavedResult(null);
    setAdjustments(
      selectedSlot?.evaluation ? createAdjustmentDraft(selectedSlot.evaluation.candidate) : null,
    );
    setBaseDataMessage(null);
  }

  function handleAdjustmentChange(patch: SchemeAdjustmentInput) {
    if (!matchingResult || !selectedStrategy) {
      return;
    }

    const selectedSlot = getSelectedSlot(matchingResult, selectedStrategy);

    if (!selectedSlot?.evaluation) {
      return;
    }

    setAdjustments({
      ...createAdjustmentDraft(selectedSlot.evaluation.candidate),
      ...adjustments,
      ...patch,
    });
    setFinalSchemeState("dirty");
    setRecalculatedResult(null);
    setSavedResult(null);
    setStatusMessage(null);
    setBaseDataMessage(null);
  }

  function handleLayerPaperChange(index: number, paperMaterialId: string) {
    if (!matchingResult || !selectedStrategy) {
      return;
    }

    const selectedSlot = getSelectedSlot(matchingResult, selectedStrategy);

    if (!selectedSlot?.evaluation) {
      return;
    }

    const nextAdjustments = {
      ...createAdjustmentDraft(selectedSlot.evaluation.candidate),
      ...adjustments,
    };
    const nextLayers = [...(nextAdjustments.layers ?? [])];
    const currentLayer = nextLayers[index];

    if (!currentLayer) {
      return;
    }

    nextLayers[index] = {
      ...currentLayer,
      paperMaterialId,
    };
    handleAdjustmentChange({ layers: nextLayers });
  }

  async function handleRecalculate() {
    if (!matchingResult || !selectedStrategy) {
      return;
    }

    const selectedSlot = getSelectedSlot(matchingResult, selectedStrategy);

    if (!selectedSlot?.evaluation || !adjustments) {
      setBaseDataMessage("请先选择可重新校核的最终方案");
      return;
    }

    setBaseDataMessage(null);
    setStatusMessage(null);
    setIsRecalculating(true);

    try {
      const result = await recalculateAdjustedScheme({
        boxSpec: toSaveBoxSpecInput(matchingResult.boxSpec),
        selectedStrategy,
        baseCandidate: selectedSlot.evaluation.candidate,
        adjustments,
      });

      if (!result.ok) {
        setBaseDataMessage(result.error.message);
        return;
      }

      setRecalculatedResult(result.data);
      setFinalSchemeState("recalculated");
      setSavedResult(null);
      setStatusMessage("重新校核完成");
    } finally {
      setIsRecalculating(false);
    }
  }

  function clearMessages() {
    setBaseDataMessage(null);
    setStatusMessage(null);
    setMatchingResult(null);
    setSelectedStrategy(null);
    setFinalSchemeState(null);
    setAdjustments(null);
    setRecalculatedResult(null);
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
  }

  const canSaveConfirmedScheme =
    Boolean(selectedStrategy) &&
    finalSchemeState !== "dirty" &&
    savedResult === null &&
    (recalculatedResult ? recalculatedResult.canSave : true);

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
            {matchingResult.recommendationMessages.map((message) => (
              <Alert key={message} showIcon title={message} type="warning" />
            ))}
            {selectedStrategy ? (
              <p className={styles.finalSchemeText}>
                当前最终方案：{getRecommendationTitle(matchingResult, selectedStrategy)}
              </p>
            ) : null}
            <div className={styles.candidateGrid}>
              {matchingResult.recommendationSlots.map((slot) => (
                <article
                  className={`${styles.candidateItem} ${
                    selectedStrategy === slot.strategy ? styles.selectedCandidateItem : ""
                  }`}
                  data-testid={`recommendation-slot-${slot.strategy}`}
                  key={slot.strategy}
                >
                  <div className={styles.slotHeader}>
                    <h5>{slot.title}</h5>
                    <span className={styles.statusBadge}>
                      {recommendationStatusLabels[slot.status]}
                    </span>
                  </div>
                  {slot.evaluation ? (
                    <>
                      <p>{formatCandidateTitle(slot.evaluation.candidate)}</p>
                      <p>{formatPaperSummary(slot.evaluation.candidate)}</p>
                      <ul className={styles.metricList}>
                        {formatEvaluationMetrics(slot.evaluation).map((metric) => (
                          <li key={metric}>{metric}</li>
                        ))}
                      </ul>
                      {slot.historicalHabit ? (
                        <HistoricalHabitPanel historicalHabit={slot.historicalHabit} />
                      ) : null}
                    </>
                  ) : null}
                  {slot.messages.length > 0 ? (
                    <ul className={styles.reasonList}>
                      {slot.messages.map((message) => (
                        <li key={message}>{message}</li>
                      ))}
                    </ul>
                  ) : null}
                  {getVisibleSlotReasons(slot).length > 0 ? (
                    <ul className={styles.reasonList}>
                      {getVisibleSlotReasons(slot).map((reason) => (
                        <li key={`${reason.type}-${reason.code}-${reason.message}`}>
                          {reason.message}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {slot.evaluation ? (
                    <Button
                      aria-label={`选择${slot.title}`}
                      onClick={() => handleSelectStrategy(slot.strategy)}
                      type={selectedStrategy === slot.strategy ? "primary" : "default"}
                    >
                      选择
                    </Button>
                  ) : null}
                </article>
              ))}
            </div>
            {selectedStrategy ? (
              <AdjustmentPanel
                adjustments={adjustments}
                matchingResult={matchingResult}
                onLayerPaperChange={handleLayerPaperChange}
                onPatchChange={handleAdjustmentChange}
                selectedStrategy={selectedStrategy}
              />
            ) : null}
            {finalSchemeState === "dirty" ? (
              <Alert showIcon title="待重新校核" type="warning" />
            ) : null}
            {recalculatedResult ? (
              <section
                className={styles.recalculatedPanel}
                data-testid="recalculated-final-scheme"
                aria-label="重新校核结果"
              >
                <h5>重新校核结果</h5>
                <span className={styles.statusBadge}>
                  {finalStatusLabels[recalculatedResult.finalStatus]}
                </span>
                <p>{formatCandidateTitle(recalculatedResult.finalEvaluation.candidate)}</p>
                <p>{formatPaperSummary(recalculatedResult.finalEvaluation.candidate)}</p>
                <ul className={styles.metricList}>
                  {formatEvaluationMetrics(recalculatedResult.finalEvaluation).map((metric) => (
                    <li key={metric}>{metric}</li>
                  ))}
                </ul>
                {getEvaluationReasons(recalculatedResult.finalEvaluation).length > 0 ? (
                  <ul className={styles.reasonList}>
                    {getEvaluationReasons(recalculatedResult.finalEvaluation).map((reason) => (
                      <li key={`${reason.type}-${reason.code}-${reason.message}`}>
                        {reason.message}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {recalculatedResult.warningMessages.length > 0 ? (
                  <ul className={styles.reasonList}>
                    {recalculatedResult.warningMessages.map((message) => (
                      <li key={message}>{message}</li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ) : null}
            {savedResult ? <SavedSchemeSummary savedResult={savedResult} /> : null}
            <div className={styles.actions}>
              <Button
                disabled={finalSchemeState !== "dirty"}
                loading={isRecalculating}
                onClick={handleRecalculate}
              >
                重新校核
              </Button>
              <Button
                disabled={!canSaveConfirmedScheme}
                loading={isSaving}
                onClick={handleSaveConfirmedScheme}
                type="primary"
              >
                确认保存
              </Button>
            </div>
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

function HistoricalHabitPanel({
  historicalHabit,
}: {
  historicalHabit: NonNullable<RecommendationSlot["historicalHabit"]>;
}) {
  return (
    <section className={styles.historicalHabitPanel} aria-label="历史参考">
      <div className={styles.historicalHabitHeader}>
        <span>历史参考</span>
        <span
          className={`${styles.historicalHabitBadge} ${
            historicalHabit.level === "insufficient" ? styles.historicalHabitMutedBadge : ""
          }`}
        >
          {historicalHabit.label}
        </span>
      </div>
      {historicalHabit.reasons.length > 0 ? (
        <ul className={styles.reasonList}>
          {historicalHabit.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}
      {historicalHabit.conflictMessages.length > 0 ? (
        <ul className={styles.historicalConflictList}>
          {historicalHabit.conflictMessages.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function SavedSchemeSummary({
  savedResult,
}: {
  savedResult: SaveConfirmedMatchingSchemeResult;
}) {
  return (
    <section
      aria-label="保存结果"
      className={styles.savedPanel}
      data-testid="saved-scheme-summary"
    >
      <h5>保存结果</h5>
      <ul className={styles.metricList}>
        <li>保存状态 保存成功</li>
        <li>最终状态 {finalStatusLabels[savedResult.finalStatus]}</li>
        <li>{savedResult.isManuallyAdjusted ? "用户已手动调整" : "未手动调整"}</li>
        <li>保存时间 {savedResult.savedAt}</li>
        <li>记录编号 {savedResult.schemeId}</li>
      </ul>
      {savedResult.warningMessages.length > 0 ? (
        <ul className={styles.reasonList}>
          {savedResult.warningMessages.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      ) : null}
      <div className={styles.exportLinks} aria-label="PDF 导出">
        <a href={createMatchingSchemePdfExportHref(savedResult.schemeId, "full_report")}>
          {matchingSchemePdfExportTypeLabels.full_report} PDF
        </a>
        <a href={createMatchingSchemePdfExportHref(savedResult.schemeId, "summary_sheet")}>
          {matchingSchemePdfExportTypeLabels.summary_sheet} PDF
        </a>
      </div>
    </section>
  );
}

function AdjustmentPanel({
  adjustments,
  matchingResult,
  onLayerPaperChange,
  onPatchChange,
  selectedStrategy,
}: {
  adjustments: SchemeAdjustmentInput | null;
  matchingResult: GenerateMatchingSchemeResult;
  onLayerPaperChange(index: number, paperMaterialId: string): void;
  onPatchChange(patch: SchemeAdjustmentInput): void;
  selectedStrategy: RecommendationSlot["strategy"];
}) {
  const selectedSlot = getSelectedSlot(matchingResult, selectedStrategy);

  if (!selectedSlot?.evaluation) {
    return null;
  }

  const adjustmentDraft = adjustments ?? createAdjustmentDraft(selectedSlot.evaluation.candidate);
  const paperOptions = selectedSlot.evaluation.candidate.layers.map((layer) => ({
    label: `${layer.paper.paperCode}${layer.paper.factoryName ? ` / ${layer.paper.factoryName}` : ""}`,
    value: layer.paper.id,
  }));

  return (
    <section className={styles.adjustmentPanel} aria-label="方案调整">
      <h5>方案调整</h5>
      <div className={styles.adjustmentGrid}>
        <label className={styles.adjustmentField}>
          <span>调整层数</span>
          <Select
            aria-label="调整层数"
            onChange={(value: LayerCount) => onPatchChange({ layerCount: value })}
            options={layerCountOptions}
            value={adjustmentDraft.layerCount ?? null}
          />
        </label>
        <label className={styles.adjustmentField}>
          <span>调整瓦型</span>
          <Select
            aria-label="调整瓦型"
            onChange={(value: FluteType) => onPatchChange({ fluteType: value })}
            options={fluteOptions}
            value={adjustmentDraft.fluteType ?? null}
          />
        </label>
        {adjustmentDraft.layers?.map((layer, index) => (
          <label
            className={styles.adjustmentField}
            key={`${layer.role}-${index}`}
          >
            <span>{getLayerRoleLabel(layer.role)}原纸</span>
            <Select
              aria-label={`${getLayerRoleLabel(layer.role)}原纸`}
              onChange={(value: string) => onLayerPaperChange(index, value)}
              options={paperOptions}
              value={layer.paperMaterialId}
            />
          </label>
        ))}
      </div>
    </section>
  );
}

function getSelectedSlot(
  result: GenerateMatchingSchemeResult,
  selectedStrategy: RecommendationSlot["strategy"],
): RecommendationSlot | undefined {
  return result.recommendationSlots.find((slot) => slot.strategy === selectedStrategy);
}

function getRecommendationTitle(
  result: GenerateMatchingSchemeResult,
  selectedStrategy: RecommendationSlot["strategy"],
): string {
  return getSelectedSlot(result, selectedStrategy)?.title ?? "";
}

function createAdjustmentDraft(candidate: MatchingCandidate): SchemeAdjustmentInput {
  return {
    layerCount: candidate.layerCount,
    fluteType: candidate.fluteType,
    layers: candidate.layers.map((layer): SchemeAdjustmentLayerInput => ({
      role: layer.role,
      ...(layer.flute !== undefined ? { flute: layer.flute } : {}),
      paperMaterialId: layer.paper.id,
    })),
  };
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
    ...(boxSpec.specialRequirements !== undefined
      ? { specialRequirements: boxSpec.specialRequirements }
      : {}),
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

function formatEvaluationMetrics(evaluation: CandidateEvaluation): string[] {
  return [
    evaluation.area ? `面积 ${formatDecimal(evaluation.area.areaSquareMeters, 4)} m²` : null,
    evaluation.strength ? `空箱抗压 ${evaluation.strength.bctN} N` : null,
    evaluation.strength
      ? `边压 ${formatDecimal(evaluation.strength.edgeCrushKnPerM, 2)} kN/m`
      : null,
    evaluation.strength ? `耐破 ${evaluation.strength.burstStrength}` : null,
    evaluation.cost
      ? `含税成本 ${formatDecimal(evaluation.cost.taxIncludedCostYuan, 2)} 元`
      : null,
  ].filter((metric): metric is string => Boolean(metric));
}

function getVisibleSlotReasons(slot: RecommendationSlot): RejectionReason[] {
  if (slot.unavailableReasons.length > 0) {
    return slot.unavailableReasons;
  }

  if (slot.evaluation?.status === "rejected") {
    return slot.evaluation.reasons;
  }

  return [];
}

function getEvaluationReasons(evaluation: CandidateEvaluation): RejectionReason[] {
  return evaluation.status === "rejected" ? evaluation.reasons : [];
}

function getLayerRoleLabel(role: SchemeAdjustmentLayerInput["role"]): string {
  if (role === "outer_liner") {
    return "面纸";
  }

  if (role === "inner_liner") {
    return "里纸";
  }

  if (role === "corrugating") {
    return "瓦纸";
  }

  return "芯纸";
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

function createMatchingSchemePdfExportHref(
  schemeId: string,
  type: "full_report" | "summary_sheet",
): string {
  return `/api/exports/matching-schemes/${schemeId}?type=${type}`;
}
