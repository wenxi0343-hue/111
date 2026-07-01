import type { NormalizedBoxSpec } from "@/modules/box-spec/types";

import type { BoardAreaResult, DeviceLimitParameters, DeviceLimitResult } from "./types";

export function checkDeviceLimits(input: {
  board: BoardAreaResult;
  boxSpec: NormalizedBoxSpec;
  parameters: DeviceLimitParameters;
}): DeviceLimitResult {
  const { board, boxSpec, parameters } = input;
  const reasons: DeviceLimitResult["reasons"] = [];
  const { boardMachine, printerSlotter } = parameters;

  if (board.boardLengthMm > boardMachine.maxLengthMm) {
    reasons.push(createDeviceReason("BOARD_LENGTH_TOO_LARGE", `纸板长超过 ${boardMachine.maxLengthMm}mm`));
  }
  if (board.boardWidthMm > boardMachine.maxWidthMm) {
    reasons.push(createDeviceReason("BOARD_WIDTH_TOO_LARGE", `纸板宽超过 ${boardMachine.maxWidthMm}mm`));
  }
  if (board.boardLengthMm < boardMachine.minLengthMm) {
    reasons.push(createDeviceReason("BOARD_LENGTH_TOO_SMALL", `纸板长小于 ${boardMachine.minLengthMm}mm`));
  }
  if (board.boardWidthMm < boardMachine.minWidthMm) {
    reasons.push(createDeviceReason("BOARD_WIDTH_TOO_SMALL", `纸板宽小于 ${boardMachine.minWidthMm}mm`));
  }

  if (board.feedLengthMm > printerSlotter.maxFeedLengthMm) {
    reasons.push(
      createDeviceReason(
        "FEED_LENGTH_TOO_LARGE",
        `进纸总长超过 ${printerSlotter.maxFeedLengthMm}mm`,
      ),
    );
  }
  if (board.feedWidthMm > printerSlotter.maxFeedWidthMm) {
    reasons.push(
      createDeviceReason(
        "FEED_WIDTH_TOO_LARGE",
        `进纸总宽超过 ${printerSlotter.maxFeedWidthMm}mm`,
      ),
    );
  }
  if (board.feedLengthMm < printerSlotter.minFeedLengthMm) {
    reasons.push(
      createDeviceReason(
        "FEED_LENGTH_TOO_SMALL",
        `进纸总长小于 ${printerSlotter.minFeedLengthMm}mm`,
      ),
    );
  }
  if (board.feedWidthMm < printerSlotter.minFeedWidthMm) {
    reasons.push(
      createDeviceReason(
        "FEED_WIDTH_TOO_SMALL",
        `进纸总宽小于 ${printerSlotter.minFeedWidthMm}mm`,
      ),
    );
  }

  if (board.printLengthMm > printerSlotter.maxPrintLengthMm) {
    reasons.push(
      createDeviceReason(
        "PRINT_LENGTH_TOO_LARGE",
        `印刷面长超过 ${printerSlotter.maxPrintLengthMm}mm`,
      ),
    );
  }
  if (board.printWidthMm > printerSlotter.maxPrintWidthMm) {
    reasons.push(
      createDeviceReason(
        "PRINT_WIDTH_TOO_LARGE",
        `印刷面宽超过 ${printerSlotter.maxPrintWidthMm}mm`,
      ),
    );
  }

  if (
    board.slotIntervalsMm.firstPanel < printerSlotter.minSlotIntervalMm.firstPanel ||
    board.slotIntervalsMm.firstSlot < printerSlotter.minSlotIntervalMm.firstSlot ||
    board.slotIntervalsMm.secondPanel < printerSlotter.minSlotIntervalMm.secondPanel ||
    board.slotIntervalsMm.secondSlot < printerSlotter.minSlotIntervalMm.secondSlot
  ) {
    reasons.push(createDeviceReason("SLOT_INTERVAL_TOO_SMALL", "开槽间隔不满足 230-65-230-65mm"));
  }

  if (boxSpec.heightMm > printerSlotter.maxBoxHeightMm) {
    reasons.push(createDeviceReason("BOX_HEIGHT_TOO_LARGE", `箱高超过 ${printerSlotter.maxBoxHeightMm}mm`));
  }

  return {
    isManufacturable: reasons.length === 0,
    reasons,
  };
}

function createDeviceReason(code: string, message: string): DeviceLimitResult["reasons"][number] {
  return {
    type: "NOT_MANUFACTURABLE",
    code,
    message,
  };
}
