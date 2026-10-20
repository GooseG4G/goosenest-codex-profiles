// @vitest-environment happy-dom
import { mount } from "@vue/test-utils";
import { defineComponent, nextTick } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useMinuteClock } from "./useMinuteClock";

afterEach(() => vi.useRealTimers());

describe("useMinuteClock", () => {
  it("updates once a minute and clears its timer on unmount", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-20T10:00:00Z"));
    const clearInterval = vi.spyOn(window, "clearInterval");
    const component = defineComponent({
      setup() {
        return { now: useMinuteClock() };
      },
      template: "<span>{{ now }}</span>",
    });
    const wrapper = mount(component);

    vi.setSystemTime(new Date("2026-10-20T10:01:00Z"));
    vi.advanceTimersByTime(60_000);
    await nextTick();
    expect(wrapper.text()).toBe(String(Date.now()));

    wrapper.unmount();
    expect(clearInterval).toHaveBeenCalledOnce();
    clearInterval.mockRestore();
  });
});
