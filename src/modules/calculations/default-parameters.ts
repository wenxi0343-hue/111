import type { CalculationParameters, RejectionReasonType } from "./types";

export const REJECTION_REASON_TYPES = [
  "DATA_MISSING",
  "PARAMETER_ERROR",
  "NOT_MANUFACTURABLE",
  "STRENGTH_UNQUALIFIED",
] as const satisfies readonly RejectionReasonType[];

export const DEFAULT_CALCULATION_PARAMETERS: CalculationParameters = {
  deviceLimits: {
    boardMachine: {
      maxLengthMm: 1800,
      maxWidthMm: 1710,
      minLengthMm: 500,
      minWidthMm: 360,
    },
    printerSlotter: {
      maxFeedLengthMm: 2400,
      maxFeedWidthMm: 1580,
      minFeedLengthMm: 600,
      minFeedWidthMm: 360,
      allowFeedRotation: false,
      maxPrintLengthMm: 2360,
      maxPrintWidthMm: 1200,
      minSlotIntervalMm: {
        firstPanel: 230,
        firstSlot: 65,
        secondPanel: 230,
        secondSlot: 65,
      },
      maxBoxHeightMm: 850,
    },
  },
  corrugationTakeUpFactors: {
    A: 1.49,
    B: 1.33,
    C: 1.431,
    E: 1.329,
  },
  edgeCrushCorrectionFactor: 1,
  boardThicknessMm: {
    A: 4.5,
    B: 2.5,
    C: 3.7,
    E: 1.1,
    AC: 8.2,
    BC: 6.2,
    BA: 7.0,
    BE: 3.6,
    BAC: 10.7,
  },
  strengthThresholds: {
    3: { minBctN: 400, minEdgeCrushKnPerM: 4.0 },
    5: { minBctN: 800, minEdgeCrushKnPerM: 7.0 },
    7: { minBctN: 1200, minEdgeCrushKnPerM: 10.0 },
  },
  burstStrengthThresholdsByLayerCount: {
    3: 100,
    5: 200,
    7: 300,
  },
  processingFeeFactorsByLayerCount: {
    3: 1.1,
    5: 1.36,
    7: 2.12,
  },
  utilizationRateRules: [
    { minQuantity: 1, rate: 0.8 },
    { minQuantity: 200, rate: 0.81 },
    { minQuantity: 500, rate: 0.85 },
    { minQuantity: 1000, rate: 0.88 },
    { minQuantity: 2000, rate: 0.9 },
    { minQuantity: 5000, rate: 0.95 },
  ],
  maxUtilizationRate: 0.95,
  padFeeYuan: 0,
};
