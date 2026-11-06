import {
  BOX_FORMING_METHODS,
  BOX_SPEC_LIMITS,
  PRODUCT_ARRANGEMENTS,
  PRODUCT_TYPES,
  STACKING_NOT_REQUIRED_DISPLAY_TEXT,
} from "./constants";
import type {
  BoxFormingMethod,
  BoxSpecialRequirements,
  BoxSpecialRequirementsInput,
  BoxSpecField,
  BoxSpecFieldError,
  BoxSpecInput,
  BoxSpecValidationResult,
  NormalizedBoxSpec,
  ProductArrangement,
  ProductType,
  RequiredStackingRequirement,
  StackingRequirement,
} from "./types";

export interface ValidateBoxSpecInputOptions {
  supportedStructureTypes?: readonly string[];
  supportedFormingMethods?: readonly BoxFormingMethod[];
  supportedArrangements?: readonly ProductArrangement[];
  supportedProductTypes?: readonly ProductType[];
}

interface NumberValidationRule {
  field: BoxSpecField;
  label: string;
  value: number | string | undefined;
  requiredMessage: string;
  rangeMessage?: string;
  min?: number;
  max?: number;
  integerMessage?: string;
  mustBeInteger?: boolean;
  mustBePositive?: boolean;
  positiveMessage?: string;
}

type ParsedNumberResult =
  | { ok: true; value: number }
  | { ok: false; error: BoxSpecFieldError };

type ParsedOptionalIntegerResult =
  | { ok: true; value: number | undefined }
  | { ok: false; error: BoxSpecFieldError };

export function validateBoxSpecInput(
  input: BoxSpecInput,
  options: ValidateBoxSpecInputOptions = {},
): BoxSpecValidationResult {
  const fieldErrors: BoxSpecFieldError[] = [];

  const lengthResult = parseRequiredNumber({
    field: "lengthMm",
    label: "纸箱内长",
    value: input.lengthMm,
    requiredMessage: "纸箱内长不能为空",
    rangeMessage: "纸箱内长允许范围为 100-2000mm",
    min: BOX_SPEC_LIMITS.lengthMm.min,
    max: BOX_SPEC_LIMITS.lengthMm.max,
    mustBeInteger: true,
    integerMessage: "纸箱内长必须为整数",
  });
  const widthResult = parseRequiredNumber({
    field: "widthMm",
    label: "纸箱内宽",
    value: input.widthMm,
    requiredMessage: "纸箱内宽不能为空",
    rangeMessage: "纸箱内宽允许范围为 100-1500mm",
    min: BOX_SPEC_LIMITS.widthMm.min,
    max: BOX_SPEC_LIMITS.widthMm.max,
    mustBeInteger: true,
    integerMessage: "纸箱内宽必须为整数",
  });
  const heightResult = parseRequiredNumber({
    field: "heightMm",
    label: "纸箱内高",
    value: input.heightMm,
    requiredMessage: "纸箱内高不能为空",
    rangeMessage: "纸箱内高允许范围为 100-1500mm",
    min: BOX_SPEC_LIMITS.heightMm.min,
    max: BOX_SPEC_LIMITS.heightMm.max,
    mustBeInteger: true,
    integerMessage: "纸箱内高必须为整数",
  });
  const productWeightResult = parseRequiredNumber({
    field: "productWeightKg",
    label: "内装物重量",
    value: input.productWeightKg,
    requiredMessage: "内装物重量不能为空",
    rangeMessage: "内装物重量允许范围为 0.5-100kg",
    min: BOX_SPEC_LIMITS.productWeightKg.min,
    max: BOX_SPEC_LIMITS.productWeightKg.max,
  });
  const productionQuantityResult = parseRequiredNumber({
    field: "productionQuantity",
    label: "生产数量",
    value: input.productionQuantity,
    requiredMessage: "生产数量不能为空",
    mustBeInteger: true,
    integerMessage: "生产数量必须为整数",
    mustBePositive: true,
    positiveMessage: "生产数量必须大于 0",
  });
  const stackingLayersResult = parseOptionalInteger({
    field: "stackingLayers",
    value: input.stackingLayers,
    integerMessage: "堆码层数必须为整数",
    rangeMessage: "堆码层数允许范围为 1-30 层",
    min: BOX_SPEC_LIMITS.stackingLayers.min,
    max: BOX_SPEC_LIMITS.stackingLayers.max,
  });

  pushNumberError(fieldErrors, lengthResult);
  pushNumberError(fieldErrors, widthResult);
  pushNumberError(fieldErrors, heightResult);
  pushNumberError(fieldErrors, productWeightResult);
  pushNumberError(fieldErrors, productionQuantityResult);
  pushOptionalIntegerError(fieldErrors, stackingLayersResult);

  const structureTypeResult = parseRequiredText(
    input.structureType,
    "structureType",
    "纸箱结构类型不能为空",
  );
  const formingMethodResult = parseRequiredOption(
    input.formingMethod,
    "formingMethod",
    "成箱方式不能为空",
    options.supportedFormingMethods ?? BOX_FORMING_METHODS,
    "成箱方式不在支持范围内",
  );
  const productTypeResult = parseRequiredOption(
    input.productType,
    "productType",
    "产品类型不能为空",
    options.supportedProductTypes ?? PRODUCT_TYPES,
    "产品类型不在支持范围内",
  );
  const arrangementResult = parseRequiredOption(
    input.arrangement,
    "arrangement",
    "内装物排列方式不能为空",
    options.supportedArrangements ?? PRODUCT_ARRANGEMENTS,
    "内装物排列方式不在支持范围内",
  );

  pushTextError(fieldErrors, structureTypeResult);
  pushTextError(fieldErrors, formingMethodResult);
  pushTextError(fieldErrors, productTypeResult);
  pushTextError(fieldErrors, arrangementResult);

  if (structureTypeResult.ok && options.supportedStructureTypes) {
    const isSupportedStructureType = options.supportedStructureTypes.includes(
      structureTypeResult.value,
    );

    if (!isSupportedStructureType) {
      fieldErrors.push({
        field: "structureType",
        message: "纸箱结构类型不在支持范围内",
      });
    }
  }

  if (lengthResult.ok && widthResult.ok) {
    if (lengthResult.value < widthResult.value) {
      fieldErrors.push({
        field: "lengthMm",
        message: "纸箱内长必须大于或等于内宽",
      });
    } else {
      const lengthWidthRatio = lengthResult.value / widthResult.value;

      if (
        lengthWidthRatio < BOX_SPEC_LIMITS.lengthWidthRatio.min ||
        lengthWidthRatio > BOX_SPEC_LIMITS.lengthWidthRatio.max
      ) {
        fieldErrors.push({
          field: "widthMm",
          message: "纸箱内长内宽比例必须在 1.0-5.0 之间",
        });
      }
    }
  }

  if (fieldErrors.length > 0) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "请检查纸箱输入",
        fieldErrors,
      },
    };
  }

  if (
    !lengthResult.ok ||
    !widthResult.ok ||
    !heightResult.ok ||
    !productWeightResult.ok ||
    !productionQuantityResult.ok ||
    !stackingLayersResult.ok ||
    !structureTypeResult.ok ||
    !formingMethodResult.ok ||
    !productTypeResult.ok ||
    !arrangementResult.ok
  ) {
    throw new Error("Unexpected validation state");
  }

  const specialRequirements = normalizeSpecialRequirements(input.specialRequirements);
  const normalizedInput: NormalizedBoxSpec = {
    lengthMm: lengthResult.value,
    widthMm: widthResult.value,
    heightMm: heightResult.value,
    structureType: structureTypeResult.value,
    formingMethod: formingMethodResult.value,
    productType: productTypeResult.value,
    productWeightKg: productWeightResult.value,
    arrangement: arrangementResult.value,
    specialRequirements,
    productionQuantity: productionQuantityResult.value,
    stackingRequirement: createStackingRequirement(stackingLayersResult.value),
  };

  return {
    ok: true,
    data: normalizedInput,
  };
}

export function isStackingRequired(input: NormalizedBoxSpec): boolean {
  return input.stackingRequirement.status === "required";
}

function parseRequiredText(
  value: string | undefined,
  field: BoxSpecField,
  requiredMessage: string,
): { ok: true; value: string } | { ok: false; error: BoxSpecFieldError } {
  const normalizedValue = normalizeOptionalText(value);

  if (normalizedValue === undefined) {
    return {
      ok: false,
      error: {
        field,
        message: requiredMessage,
      },
    };
  }

  return {
    ok: true,
    value: normalizedValue,
  };
}

function parseRequiredOption<TOption extends string>(
  value: string | undefined,
  field: BoxSpecField,
  requiredMessage: string,
  supportedOptions: readonly TOption[],
  unsupportedMessage: string,
): { ok: true; value: TOption } | { ok: false; error: BoxSpecFieldError } {
  const textResult = parseRequiredText(value, field, requiredMessage);

  if (!textResult.ok) {
    return textResult;
  }

  if (!supportedOptions.includes(textResult.value as TOption)) {
    return {
      ok: false,
      error: {
        field,
        message: unsupportedMessage,
      },
    };
  }

  return {
    ok: true,
    value: textResult.value as TOption,
  };
}

function parseRequiredNumber(rule: NumberValidationRule): ParsedNumberResult {
  const parsedValue = parseNumber(rule.value);

  if (parsedValue === undefined) {
    return {
      ok: false,
      error: {
        field: rule.field,
        message: rule.requiredMessage,
      },
    };
  }

  if (!Number.isFinite(parsedValue)) {
    return {
      ok: false,
      error: {
        field: rule.field,
        message: `${rule.label}必须为数字`,
      },
    };
  }

  if (rule.mustBeInteger && !Number.isInteger(parsedValue)) {
    return {
      ok: false,
      error: {
        field: rule.field,
        message: rule.integerMessage ?? `${rule.label}必须为整数`,
      },
    };
  }

  if (rule.mustBePositive && parsedValue <= 0) {
    return {
      ok: false,
      error: {
        field: rule.field,
        message: rule.positiveMessage ?? `${rule.label}必须大于 0`,
      },
    };
  }

  if (
    (rule.min !== undefined && parsedValue < rule.min) ||
    (rule.max !== undefined && parsedValue > rule.max)
  ) {
    return {
      ok: false,
      error: {
        field: rule.field,
        message: rule.rangeMessage ?? `${rule.label}超出允许范围`,
      },
    };
  }

  return {
    ok: true,
    value: parsedValue,
  };
}

function parseOptionalInteger({
  field,
  value,
  integerMessage,
  rangeMessage,
  min,
  max,
}: {
  field: BoxSpecField;
  value: number | string | undefined;
  integerMessage: string;
  rangeMessage: string;
  min: number;
  max: number;
}): ParsedOptionalIntegerResult {
  const parsedValue = parseNumber(value);

  if (parsedValue === undefined) {
    return {
      ok: true,
      value: undefined,
    };
  }

  if (!Number.isInteger(parsedValue)) {
    return {
      ok: false,
      error: {
        field,
        message: integerMessage,
      },
    };
  }

  if (parsedValue < min || parsedValue > max) {
    return {
      ok: false,
      error: {
        field,
        message: rangeMessage,
      },
    };
  }

  return {
    ok: true,
    value: parsedValue,
  };
}

function parseNumber(value: number | string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === "number") {
    return value;
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    return undefined;
  }

  return Number(normalizedValue);
}

function normalizeOptionalText(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalizedValue = value.trim();

  return normalizedValue ? normalizedValue : undefined;
}

function normalizeSpecialRequirements(
  value: BoxSpecInput["specialRequirements"],
): BoxSpecialRequirements {
  if (typeof value === "string") {
    const notes = normalizeOptionalText(value);

    return {
      dieCutting: false,
      punctureStrengthRequired: false,
      ...(notes !== undefined ? { notes } : {}),
    };
  }

  const input = value as BoxSpecialRequirementsInput | undefined;
  const notes = normalizeOptionalText(input?.notes);

  return {
    dieCutting: input?.dieCutting === true,
    punctureStrengthRequired: input?.punctureStrengthRequired === true,
    ...(notes !== undefined ? { notes } : {}),
  };
}

function createStackingRequirement(stackingLayers: number | undefined): StackingRequirement {
  if (stackingLayers === undefined) {
    return {
      status: "not_required",
      displayText: STACKING_NOT_REQUIRED_DISPLAY_TEXT,
    };
  }

  return {
    status: "required",
    stackingLayers,
    displayText: createRequiredStackingDisplayText(stackingLayers),
  } satisfies RequiredStackingRequirement;
}

function createRequiredStackingDisplayText(stackingLayers: number): string {
  return `已填写堆码层数 ${stackingLayers} 层，承重纳入本次判断`;
}

function pushNumberError(fieldErrors: BoxSpecFieldError[], result: ParsedNumberResult): void {
  if (!result.ok) {
    fieldErrors.push(result.error);
  }
}

function pushOptionalIntegerError(
  fieldErrors: BoxSpecFieldError[],
  result: ParsedOptionalIntegerResult,
): void {
  if (!result.ok) {
    fieldErrors.push(result.error);
  }
}

function pushTextError(
  fieldErrors: BoxSpecFieldError[],
  result:
    | { ok: true; value: string }
    | { ok: true; value: BoxFormingMethod }
    | { ok: true; value: ProductArrangement }
    | { ok: true; value: ProductType }
    | { ok: false; error: BoxSpecFieldError },
): void {
  if (!result.ok) {
    fieldErrors.push(result.error);
  }
}
