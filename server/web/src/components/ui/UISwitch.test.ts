// @vitest-environment happy-dom
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import UISwitch from "./UISwitch.vue";

describe("UISwitch", () => {
  it("exposes its state and requests the opposite value when clicked", async () => {
    const wrapper = mount(UISwitch, {
      props: {
        modelValue: true,
        accessibleLabel: "Disable profile@example.com",
      },
    });
    const control = wrapper.get('[role="switch"]');

    expect(control.attributes("aria-checked")).toBe("true");
    expect(control.attributes("aria-label")).toBe(
      "Disable profile@example.com",
    );

    await control.trigger("click");

    expect(wrapper.emitted("change")).toEqual([[false]]);
  });

  it("blocks changes while the update is pending", async () => {
    const wrapper = mount(UISwitch, {
      props: {
        modelValue: false,
        accessibleLabel: "Enable profile@example.com",
        pending: true,
      },
    });
    const control = wrapper.get('[role="switch"]');

    expect(control.attributes("aria-busy")).toBe("true");
    expect(control.attributes()).toHaveProperty("disabled");

    await control.trigger("click");

    expect(wrapper.emitted("change")).toBeUndefined();
  });
});
