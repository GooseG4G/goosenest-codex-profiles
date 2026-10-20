// @vitest-environment happy-dom
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import UICollectionView from "./UICollectionView.vue";

describe("UICollectionView", () => {
  it("renders the shared toolbar, heading and collection content", () => {
    const wrapper = mount(UICollectionView, {
      props: { heading: "Device", empty: false, emptyText: "No devices" },
      slots: { toolbar: "Search", default: "Device row" },
    });

    expect(wrapper.get(".collection-toolbar").text()).toBe("Search");
    expect(wrapper.get(".collection-heading").text()).toBe("Device");
    expect(wrapper.get(".collection-list").text()).toContain("Device row");
    expect(wrapper.find(".collection-empty").exists()).toBe(false);
  });

  it("replaces rows with the empty state", () => {
    const wrapper = mount(UICollectionView, {
      props: { heading: "User", empty: true, emptyText: "No users" },
      slots: { toolbar: "Search", default: "Hidden row" },
    });

    expect(wrapper.get(".collection-empty").text()).toBe("No users");
    expect(wrapper.text()).not.toContain("Hidden row");
  });
});
