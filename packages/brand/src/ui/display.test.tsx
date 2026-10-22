import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Waveform } from "../waveform.tsx";
import { EmptyState, Skeleton } from "./display.tsx";
import { OverlayPill } from "./overlay-pill.tsx";

afterEach(cleanup);

const levelOf = (element: Element | null) =>
  element === null ? null : (element as HTMLElement).style.getPropertyValue("--level");

describe("OverlayPill", () => {
  it("announces its state as a status", () => {
    render(<OverlayPill state="listening" label="Listening" />);
    expect(screen.getByRole("status").textContent).toBe("Listening");
  });

  it("follows the microphone level while listening and loops the demo without one", () => {
    const { container, rerender } = render(
      <OverlayPill state="listening" label="Listening" level={0.4} />,
    );
    const wave = () => container.querySelector(".waveform");
    expect(wave()?.getAttribute("data-mode")).toBe("level");
    expect(levelOf(wave())).toBe("0.4");
    rerender(<OverlayPill state="listening" label="Listening" />);
    expect(wave()?.getAttribute("data-mode")).toBe("demo");
    rerender(<OverlayPill state="done" label="Done" level={0.9} />);
    expect(levelOf(wave())).toBe("0");
  });
});

describe("Waveform", () => {
  it("clamps the level and stays out of the accessibility tree", () => {
    const { container } = render(
      <>
        <Waveform level={3} />
        <Waveform level={-1} />
      </>,
    );
    const waves = container.querySelectorAll(".waveform");
    expect([...waves].map(levelOf)).toEqual(["1", "0"]);
    expect([...waves].every((wave) => wave.getAttribute("aria-hidden") === "true")).toBe(true);
  });
});

describe("EmptyState and Skeleton", () => {
  it("give empty content a readable title and hide placeholders from assistive tech", () => {
    const { container } = render(
      <>
        <EmptyState
          title="No terms yet"
          body="Add them from the desktop app."
          testId="empty-state"
        />
        <Skeleton lines={3} />
      </>,
    );
    expect(screen.getByTestId("empty-state").textContent).toContain("No terms yet");
    expect(container.querySelector(".tmw-skeleton")?.getAttribute("aria-hidden")).toBe("true");
  });
});
