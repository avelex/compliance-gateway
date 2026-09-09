import { describe, expect, it } from "vitest";
import { ago } from "./data";

describe("ago", () => {
  it("keeps seconds under a minute", () => {
    expect(ago(45)).toBe("45s");
  });

  it("drops a trailing zero seconds", () => {
    expect(ago(900)).toBe("15m");
    expect(ago(60)).toBe("1m");
  });

  it("keeps seconds when there are some", () => {
    expect(ago(90)).toBe("1m 30s");
  });

  it("drops trailing zero minutes on the hour", () => {
    expect(ago(7_200)).toBe("2h");
  });

  it("keeps minutes past the hour", () => {
    expect(ago(3_720)).toBe("1h 2m");
  });
});
