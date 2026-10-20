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

  it("keeps the normal presentation before 180 seconds", () => {
    const wrapper = mount(UsageDisplay, {
      props: {
        usage: {
          primary: {
            used_percent: 25,
            window_duration_minutes: 300,
            resets_at: Date.now() / 1000 + 3600,
          },
        },
        updatedAt: new Date(Date.now() - 179_000).toISOString(),
      },
    });

    expect(wrapper.find(".skeleton").exists()).toBe(false);
    expect(wrapper.get(".remaining").text()).toContain("75% left");
  });

  it("shows skeletons only after the 180-second stale threshold", () => {
    const wrapper = mount(UsageDisplay, {
      props: {
        usage: {
          primary: {
            used_percent: 25,
            window_duration_minutes: 300,
            resets_at: Date.now() / 1000 + 3600,
          },
        },
        updatedAt: new Date(Date.now() - 181_000).toISOString(),
      },
    });

    expect(wrapper.findAll(".skeleton")).toHaveLength(2);
    expect(wrapper.get(".track").classes()).toContain("is-stale");
  });
});
