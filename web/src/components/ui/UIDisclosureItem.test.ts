// @vitest-environment happy-dom
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import UIActionItem from "./UIActionItem.vue";
import UIDisclosureItem from "./UIDisclosureItem.vue";

describe("row interactions", () => {
  it("keeps a generic row action free of disclosure state", () => {
    const wrapper = mount(UIActionItem, {
      props: { accessibleLabel: "Sign in again" },
    });

    expect(wrapper.attributes("aria-label")).toBe("Sign in again");
    expect(wrapper.attributes("aria-expanded")).toBeUndefined();
    expect(wrapper.attributes("aria-controls")).toBeUndefined();
  });

  it("adds disclosure state through the disclosure wrapper", async () => {
    const wrapper = mount(UIDisclosureItem, {
      props: {
        accessibleLabel: "Show usage",
        expanded: false,
        controls: "usage-profile",
      },
    });
    const button = wrapper.get("button");

    expect(button.attributes("aria-expanded")).toBe("false");
    expect(button.attributes("aria-controls")).toBe("usage-profile");
    await button.trigger("click");
    expect(wrapper.emitted("toggle")).toHaveLength(1);
  });
});
