import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sourceRoot = dirname(fileURLToPath(import.meta.url));
const runtimeTokens = new Set(["toast-swipe-x"]);

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory()
      ? sourceFiles(path)
      : [".css", ".vue"].includes(extname(path))
        ? [path]
        : [];
  });
}

describe("design token contract", () => {
  const files = sourceFiles(sourceRoot);
  const definitions = new Set<string>();
  const usages = new Set<string>();

  for (const file of files) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/--([a-z0-9-]+)\s*:/g)) {
      definitions.add(match[1]!);
    }
    for (const match of source.matchAll(/var\(--([a-z0-9-]+)/g)) {
      usages.add(match[1]!);
    }
  }

  it("has no undefined or orphaned tokens", () => {
    const undefinedTokens = [...usages].filter(
      (token) => !definitions.has(token) && !runtimeTokens.has(token),
    );
    const orphanedTokens = [...definitions].filter(
      (token) => !usages.has(token),
    );

    expect(undefinedTokens).toEqual([]);
    expect(orphanedTokens).toEqual([]);
  });

  it("keeps physical color values in the central token file", () => {
    const rawColorPattern = /#[0-9a-f]{3,8}\b|rgb\(/i;
    const violations = files.flatMap((file) => {
      if (file === join(sourceRoot, "style.css")) return [];
      const source = readFileSync(file, "utf8");
      return rawColorPattern.test(source) ? [relative(sourceRoot, file)] : [];
    });

    expect(violations).toEqual([]);
  });
});
