// oxlint-disable-next-line import/no-unassigned-import -- Registers Testing Library's Vitest matchers.
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

function createObjectUrl(blob: Blob): string {
  return `blob:test-${blob.size}`;
}

function revokeObjectUrl(_url: string): void {
  // Object URLs are deterministic in JSDOM and have no browser resources to release.
}

function canvasContext(): null {
  // Thumbnail contrast sampling falls back safely when JSDOM has no canvas renderer.
  return null;
}

afterEach(() => {
  cleanup();
});

HTMLDialogElement.prototype.showModal = function showModal(): void {
  this.setAttribute("open", "");
};

HTMLDialogElement.prototype.close = function close(): void {
  this.removeAttribute("open");
};

Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: vi.fn((query: string): MediaQueryList => ({
    addEventListener: () => {
      // Media queries are static in JSDOM tests.
    },
    addListener: () => {
      // Legacy media-query listeners are static in JSDOM tests.
    },
    dispatchEvent: vi.fn(() => false),
    matches: false,
    media: query,
    onchange: null,
    removeEventListener: () => {
      // Media queries are static in JSDOM tests.
    },
    removeListener: () => {
      // Legacy media-query listeners are static in JSDOM tests.
    },
  })),
});

Object.defineProperty(window, "scrollTo", {
  configurable: true,
  value: vi.fn(),
});

Object.defineProperty(URL, "createObjectURL", {
  configurable: true,
  value: createObjectUrl,
});

Object.defineProperty(URL, "revokeObjectURL", {
  configurable: true,
  value: revokeObjectUrl,
});

Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
  configurable: true,
  value: canvasContext,
});
