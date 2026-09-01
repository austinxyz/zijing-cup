import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { profileUrl } from "./utr";

describe("profileUrl", () => {
  it("points at the player's UTR profile page", () => {
    expect(profileUrl("abc123")).toBe(
      "https://app.utrsports.net/profiles/abc123",
    );
  });

  it("escapes an id so a stray character cannot rewrite the path", () => {
    // Profile ids are typed by hand into the admin screens. A slash would
    // otherwise walk to a different page on the UTR site, which reads as a
    // working link to the wrong person's profile.
    expect(profileUrl("a/b")).toBe("https://app.utrsports.net/profiles/a%2Fb");
  });
});

describe("the UTR site address", () => {
  it("has exactly one literal in the frontend source", () => {
    // The spec's reason for a single constant: three screens link to the same
    // site, and a second literal is how one of them silently keeps pointing at
    // an old address after the other two are updated.
    const root = join(import.meta.dirname, "..");

    function sourceFiles(dir: string): string[] {
      let found: string[] = [];
      for (const entry of readdirSync(join(root, dir), {
        withFileTypes: true,
      })) {
        const rel = `${dir}/${entry.name}`;
        if (entry.isDirectory()) found = found.concat(sourceFiles(rel));
        else if (/\.tsx?$/.test(entry.name) && !entry.name.includes(".test."))
          found.push(rel);
      }
      return found;
    }

    const holders = ["app", "lib", "components"]
      .flatMap(sourceFiles)
      .filter((file) =>
        readFileSync(join(root, file), "utf8").includes("app.utrsports.net"),
      );

    expect(holders).toEqual(["lib/utr.ts"]);
  });
});
