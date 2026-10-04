import { writeFileSync } from "node:fs";
import { z } from "zod";
import { reportSchema } from "../shared/report";
import { demoReports } from "../src/lib/demo";
writeFileSync(
  "docs/report.schema.json",
  JSON.stringify(z.toJSONSchema(reportSchema), null, 2) + "\n",
);
const { id, received_at, is_current, ...input } = demoReports[2];
writeFileSync(
  "docs/synthetic-report.json",
  JSON.stringify(
    {
      ...input,
      submission_id: "synthetic-transport-001",
      title: "Synthetic ingestion fixture",
      summary:
        "A transport fixture. No market claim or recommendation is made.",
      desk_slug: "macro",
      assets: input.assets.map((a) => ({
        ...a,
        relationship: "context",
        watchlist_action: "none",
        reason: "Illustrative association only.",
      })),
      catalysts: [],
      thesis: null,
      invalidation: null,
    },
    null,
    2,
  ) + "\n",
);
