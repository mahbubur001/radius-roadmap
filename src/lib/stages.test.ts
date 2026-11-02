import { describe, expect, it } from "vitest";
import { cardStage, feedbackStage, stageStep } from "./stages";

describe("feedbackStage", () => {
  it("follows the inbox, then the status kind", () => {
    expect(feedbackStage({ review: "pending", kind: "open" })).toBe("new");
    expect(feedbackStage({ review: "approved", kind: "open" })).toBe("review");
    expect(feedbackStage({ review: "approved", kind: "planned" })).toBe(
      "planned",
    );
    expect(feedbackStage({ review: "approved", kind: "in_progress" })).toBe(
      "in_progress",
    );
  });

  it("done ideas are shipped, announced once in a published update", () => {
    expect(feedbackStage({ review: "approved", kind: "done" })).toBe("shipped");
    expect(
      feedbackStage({ review: "approved", kind: "done", announced: true }),
    ).toBe("announced");
  });

  it("declined or rejected ideas have no stage", () => {
    expect(feedbackStage({ review: "approved", kind: "declined" })).toBeNull();
    expect(feedbackStage({ review: "rejected", kind: "open" })).toBeNull();
  });
});

describe("cardStage", () => {
  it("uses the column's stage until the card is completed", () => {
    expect(cardStage({ completed: false, columnStage: "review" })).toBe(
      "review",
    );
    expect(cardStage({ completed: true, columnStage: "planned" })).toBe(
      "shipped",
    );
    expect(
      cardStage({ completed: true, columnStage: "planned", announced: true }),
    ).toBe("announced");
  });

  it("an announced flag doesn't skip ahead of an open card", () => {
    expect(
      cardStage({ completed: false, columnStage: "planned", announced: true }),
    ).toBe("planned");
  });
});

describe("stageStep", () => {
  it("counts the filled bars", () => {
    expect(stageStep("new")).toBe(1);
    expect(stageStep("announced")).toBe(6);
  });
});
