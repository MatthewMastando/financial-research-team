import { readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";
import { reportSchema } from "../shared/report";
writeFileSync(
  "docs/report.schema.json",
  JSON.stringify(z.toJSONSchema(reportSchema), null, 2) + "\n",
);
// The transport fixture has a stable submission ID and may already have a
// receipt. Validate it without regenerating bytes from changing UI demo data.
reportSchema.parse(
  JSON.parse(readFileSync("docs/synthetic-report.json", "utf8")),
);
