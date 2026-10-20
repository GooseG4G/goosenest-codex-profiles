// @vitest-environment happy-dom
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import UICollectionItemIdentity from "./UICollectionItemIdentity.vue";

describe("UICollectionItemIdentity", () => {
  it("renders the standard status and copy slots", () => {
    const wrapper = mount(UICollectionItemIdentity, {
      slots: { status: '<i class="dot" />', default: "Identity" },
    });

    expect(wrapper.classes()).not.toContain("disclosure");
    expect(wrapper.find(".dot").exists()).toBe(true);
    expect(wrapper.get(".list-copy").text()).toBe("Identity");
  });

  it("enables optical disclosure geometry only when requested", () => {
    const wrapper = mount(UICollectionItemIdentity, {
      props: { disclosure: true },
      slots: {
        disclosure: '<svg class="chevron" />',
        status: '<i class="dot" />',
        default: "Profile",
      },
    });

    expect(wrapper.classes()).toContain("disclosure");
    expect(wrapper.find(".list-disclosure .chevron").exists()).toBe(true);
  });
});
