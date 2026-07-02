import type {
  MatchingSchemePdfData,
  MatchingSchemePdfLabeledValue,
  MatchingSchemePdfPaperLayer,
  MatchingSchemePdfSchemeSummary,
} from "@/modules/import-export/matching-scheme-pdf-types";

export function renderMatchingSchemePdfHtml(data: MatchingSchemePdfData): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(data.title)}</title>
  <style>
    body {
      color: #172033;
      font-family: "Microsoft YaHei", "Noto Sans CJK SC", Arial, sans-serif;
      font-size: 13px;
      line-height: 1.6;
      margin: 0;
      padding: 28px;
    }
    h1, h2, h3 {
      margin: 0;
    }
    h1 {
      border-bottom: 2px solid #2f6b4f;
      font-size: 26px;
      padding-bottom: 10px;
    }
    h2 {
      color: #244c3a;
      font-size: 17px;
      margin-top: 24px;
    }
    table {
      border-collapse: collapse;
      table-layout: fixed;
      width: 100%;
    }
    th,
    td {
      border: 1px solid #cdd7d0;
      padding: 7px 8px;
      text-align: left;
      vertical-align: top;
      overflow-wrap: anywhere;
      word-break: break-word;
    }
    th {
      background: #edf4ef;
      color: #1e3d30;
      font-weight: 700;
    }
    tr {
      break-inside: avoid;
    }
    .meta {
      color: #526173;
      margin: 10px 0 18px;
    }
    .section {
      break-inside: avoid;
    }
    .conclusion {
      background: #f4f8f5;
      border-left: 4px solid #2f6b4f;
      margin-top: 10px;
      padding: 10px 12px;
    }
  </style>
</head>
<body>
  <h1>${escapeHtml(data.title)}</h1>
  <p class="meta">记录编号：${escapeHtml(data.schemeId)}　保存时间：${escapeHtml(formatDateTime(data.savedAt))}　${data.isManuallyAdjusted ? "用户已手动调整" : "未手动调整"}</p>
  ${renderKeyValueSection("输入参数", data.boxSpec)}
  ${
    data.exportVisibility.showOriginalRecommendations
      ? renderOriginalRecommendations(data.originalRecommendations)
      : ""
  }
  <section class="section">
    <h2>最终确认方案</h2>
    ${renderLabeledTable("方案配置", data.finalScheme.configuration)}
    ${renderPaperLayers(data.finalScheme.paperLayers)}
    ${renderLabeledTable("强度校核", data.finalScheme.strength)}
    ${data.exportVisibility.showCost ? renderLabeledTable("成本", data.finalScheme.cost) : ""}
  </section>
  <section class="section">
    <h2>推荐结论</h2>
    <p class="conclusion">${escapeHtml(data.recommendationConclusion)}</p>
  </section>
</body>
</html>`;
}

function renderKeyValueSection(title: string, rows: Record<string, string>): string {
  return `<section class="section">
    <h2>${escapeHtml(title)}</h2>
    <table>
      <tbody>
        ${Object.entries(rows)
          .map(
            ([label, value]) =>
              `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`,
          )
          .join("")}
      </tbody>
    </table>
  </section>`;
}

function renderOriginalRecommendations(items: MatchingSchemePdfSchemeSummary[]): string {
  return `<section class="section">
    <h2>原始三套推荐</h2>
    <table>
      <thead>
        <tr>
          <th>方案</th>
          <th>配置</th>
          <th>强度</th>
          <th>成本</th>
          <th>结论</th>
        </tr>
      </thead>
      <tbody>
        ${items
          .map(
            (item) => `<tr>
              <td>${escapeHtml(item.title)}</td>
              <td>${escapeHtml(formatRows(item.configuration))}</td>
              <td>${escapeHtml(formatRows(item.strength))}</td>
              <td>${escapeHtml(formatRows(item.cost))}</td>
              <td>${escapeHtml(item.conclusion)}</td>
            </tr>`,
          )
          .join("")}
      </tbody>
    </table>
  </section>`;
}

function renderLabeledTable(title: string, rows: MatchingSchemePdfLabeledValue[]): string {
  return `<h3>${escapeHtml(title)}</h3>
  <table>
    <tbody>
      ${rows
        .map((row) => `<tr><th>${escapeHtml(row.label)}</th><td>${escapeHtml(row.value)}</td></tr>`)
        .join("")}
    </tbody>
  </table>`;
}

function renderPaperLayers(layers: MatchingSchemePdfPaperLayer[]): string {
  return `<h3>各层原纸</h3>
  <table>
    <thead>
      <tr>
        <th>层位</th>
        <th>纸号</th>
        <th>纸名</th>
        <th>纸厂</th>
        <th>克重</th>
      </tr>
    </thead>
    <tbody>
      ${layers
        .map(
          (layer) => `<tr>
            <td>${escapeHtml(layer.role)}</td>
            <td>${escapeHtml(layer.paperCode)}</td>
            <td>${escapeHtml(layer.paperName)}</td>
            <td>${escapeHtml(layer.factoryName)}</td>
            <td>${escapeHtml(layer.gramWeight)}</td>
          </tr>`,
        )
        .join("")}
    </tbody>
  </table>`;
}

function formatRows(rows: MatchingSchemePdfLabeledValue[]): string {
  return rows.map((row) => `${row.label}：${row.value}`).join("；");
}

function formatDateTime(value: Date): string {
  return value.toISOString().replace("T", " ").slice(0, 19);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
