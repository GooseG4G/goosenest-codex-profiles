// @vitest-environment happy-dom
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
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

  it("dismisses its tooltip on Escape while hovered", async () => {
    const wrapper = mount(UISwitch, {
      props: {
        modelValue: false,
        accessibleLabel: "Enable profile@example.com",
      },
    });
    const control = wrapper.get('[role="switch"]');

    await control.trigger("mouseenter");
    await nextTick();
    expect(document.body.querySelector('[role="tooltip"]')).not.toBeNull();

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 520));

    expect(document.body.querySelector('[role="tooltip"]')).toBeNull();
    wrapper.unmount();
  });

  it("uses the action tooltip without changing its accessible name", async () => {
    const wrapper = mount(UISwitch, {
      props: {
        modelValue: true,
        accessibleLabel: "Disable profile@example.com",
        tooltip: "Disable",
      },
    });
    const control = wrapper.get('[role="switch"]');

    expect(control.attributes("aria-label")).toBe("Disable profile@example.com");
    await control.trigger("mouseenter");
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(document.body.textContent).toContain("Disable");
    expect(document.body.textContent).not.toContain("Disable profile@example.com");
    wrapper.unmount();
  });

  it("does not open a tooltip for disabled or pending controls", async () => {
    const cases: Array<{
      modelValue: boolean;
      accessibleLabel: string;
      disabled?: boolean;
      pending?: boolean;
    }> = [
      {
        modelValue: false,
        accessibleLabel: "Enable profile@example.com",
        disabled: true,
      },
      {
        modelValue: false,
        accessibleLabel: "Enable profile@example.com",
        pending: true,
      },
    ];
    for (const props of cases) {
      const wrapper = mount(UISwitch, { props });
      await wrapper.get('[role="switch"]').trigger("mouseenter");
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(document.body.querySelector('[role="tooltip"]')).toBeNull();
      wrapper.unmount();
    }
  });
});
