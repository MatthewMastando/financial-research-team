import { it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "../src/components/Markdown";
it("renders untrusted Markdown without executable HTML, unsafe links or remote images", () => {
  const html = renderToStaticMarkup(
    <Markdown>
      {
        "<script>alert(1)</script>\n\n[bad](javascript:alert%281%29)\n\n![tracker](https://attacker.test/pixel)\n\n[safe](https://example.com/source)"
      }
    </Markdown>,
  );
  expect(html).not.toContain("<script");
  expect(html).not.toContain("javascript:");
  expect(html).not.toContain("<img");
  expect(html).toContain('href="https://example.com/source"');
  expect(html).toContain('rel="noopener noreferrer"');
});
