// @vitest-environment happy-dom
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import type { UsageResets } from "../../api";
import UsageResetWidget from "./UsageResetWidget.vue";

function resets(stale: boolean): UsageResets {
  return {
    available_count: 1,
    credits: [
      {
        reset_id: "reset-1",
        status: "available",
        reset_type: "codexRateLimits",
        title: "Full reset",
        description: null,
        granted_at: Math.floor(Date.now() / 1000),
        expires_at: null,
      },
    ],
    updated_at: new Date().toISOString(),
    stale,
    refreshing: stale,
  };
}

describe("UsageResetWidget", () => {
  it("remains inert while reset credits are loading", async () => {
    const wrapper = mount(UsageResetWidget, {
      props: { resets: resets(true) },
    });

    const summary = wrapper.get("button.reset-summary");
    expect(summary.attributes("disabled")).toBeDefined();
    expect(summary.attributes("aria-label")).toBe("Loading usage limit resets");

    await wrapper.get(".reset-widget").trigger("click");
    expect(wrapper.find(".credits").exists()).toBe(false);
  });

  it("becomes expandable after fresh reset credits arrive", async () => {
    const wrapper = mount(UsageResetWidget, {
      props: { resets: resets(true) },
    });

    await wrapper.setProps({ resets: resets(false) });
    const summary = wrapper.get("button.reset-summary");
    expect(summary.attributes("disabled")).toBeUndefined();

    await wrapper.get(".reset-widget").trigger("click");
    expect(wrapper.find(".credits").exists()).toBe(true);
  });
});
