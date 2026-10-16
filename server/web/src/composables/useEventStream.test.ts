// @vitest-environment happy-dom

import { mount } from "@vue/test-utils";
import { defineComponent } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useEventStream } from "./useEventStream";

class FakeWebSocket extends EventTarget {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readonly url: string;
  readyState = FakeWebSocket.CONNECTING;
  close = vi.fn(() => {
    this.readyState = FakeWebSocket.CLOSED;
  });
  send = vi.fn();

  constructor(url: string | URL) {
    super();
    this.url = String(url);
    FakeWebSocket.instances.push(this);
  }

  emitMessage(data: unknown) {
    this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(data) }));
  }
}

describe("useEventStream", () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    sessionStorage.clear();
    vi.stubGlobal("WebSocket", FakeWebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("replays from the saved cursor and persists the next event", () => {
    sessionStorage.setItem("events.cursor", "12-0");
    const received = vi.fn();
    const wrapper = mount(
      defineComponent({
        setup() {
          const stream = useEventStream({
            path: "/api/v1/events",
            storageKey: "events.cursor",
            onEvent: received,
          });
          stream.connect();
          return {};
        },
        template: "<div />",
      }),
    );

    const socket = FakeWebSocket.instances[0];
    expect(socket.url).toContain("after=12-0");

    socket.emitMessage({ stream_id: "13-0", type: "profile.usage.updated" });

    expect(sessionStorage.getItem("events.cursor")).toBe("13-0");
    expect(received).toHaveBeenCalledWith(
      expect.objectContaining({ stream_id: "13-0" }),
    );

    wrapper.unmount();
    expect(socket.close).toHaveBeenCalledWith(1000);
  });

  it("does not advance the cursor when the event handler fails", () => {
    sessionStorage.setItem("events.cursor", "12-0");
    const wrapper = mount(
      defineComponent({
        setup() {
          const stream = useEventStream({
            path: "/api/v1/events",
            storageKey: "events.cursor",
            onEvent: () => {
              throw new Error("handler failed");
            },
          });
          stream.connect();
          return {};
        },
        template: "<div />",
      }),
    );

    FakeWebSocket.instances[0].emitMessage({
      stream_id: "13-0",
      type: "profile.usage.updated",
    });

    expect(sessionStorage.getItem("events.cursor")).toBe("12-0");
    expect(FakeWebSocket.instances[0].close).toHaveBeenCalledWith(
      1011,
      "Event handling failed",
    );
    wrapper.unmount();
  });
});
