// @vitest-environment happy-dom
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import UsageDisplay from "./UsageDisplay.vue";

describe("UsageDisplay", () => {
  it("uses the Codex 5-hour limit label", () => {
    const wrapper = mount(UsageDisplay, {
      props: {
        usage: {
          primary: {
            used_percent: 25,
            window_duration_minutes: 300,
            resets_at: Date.now() / 1000 + 3600,
          },
        },
        updatedAt: new Date().toISOString(),
      },
    });

    expect(wrapper.text()).toContain("5-hour limit");
    expect(wrapper.text()).not.toContain("5h limit");
  });
});
