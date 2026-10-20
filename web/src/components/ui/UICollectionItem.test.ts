// @vitest-environment happy-dom
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import UICollectionItem from "./UICollectionItem.vue";

describe("UICollectionItem", () => {
  it("keeps passive rows non-interactive", () => {
    const wrapper = mount(UICollectionItem, { slots: { default: "Device" } });

    expect(wrapper.element.tagName).toBe("ARTICLE");
    expect(wrapper.find("button").exists()).toBe(false);
    expect(wrapper.attributes("role")).toBeUndefined();
    expect(wrapper.find(".collection-details").exists()).toBe(false);
  });

  it("renders optional interaction and details slots without owning behavior", () => {
    const wrapper = mount(UICollectionItem, {
      slots: {
        interaction: '<button class="item-action" />',
        default: "Profile",
        details: "Usage",
      },
    });

    expect(wrapper.classes()).toContain("has-interaction");
    expect(wrapper.find(".item-action").exists()).toBe(true);
    expect(wrapper.get(".collection-details").text()).toBe("Usage");
  });
});
