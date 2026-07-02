import { chromium } from "@playwright/test";

import type { MatchingSchemePdfData } from "@/modules/import-export/matching-scheme-pdf-types";
import { renderMatchingSchemePdfHtml } from "@/modules/import-export/render-matching-scheme-pdf-html";

interface GenerateMatchingSchemePdfInput {
  data: MatchingSchemePdfData;
  html?: string | undefined;
}

export async function generateMatchingSchemePdf({
  data,
  html = renderMatchingSchemePdfHtml(data),
}: GenerateMatchingSchemePdfInput): Promise<Buffer> {
  const browser = await chromium.launch();

  try {
    const page = await browser.newPage();

    await page.setContent(html, { waitUntil: "load" });

    return await page.pdf({
      format: "A4",
      printBackground: true,
      margin: {
        top: "16mm",
        right: "12mm",
        bottom: "16mm",
        left: "12mm",
      },
    });
  } finally {
    await browser.close();
  }
}
