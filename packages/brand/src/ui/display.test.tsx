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

  it("draws a level history while listening and drops it once the voice stops", () => {
    const { container, rerender } = render(
      <OverlayPill state="listening" label="Listening" levels={[0, 0.5, 2]} />,
    );
    const bars = () => [...container.querySelectorAll(".waveform-bar")].map(levelOf);
    expect(container.querySelector(".waveform")?.getAttribute("data-mode")).toBe("history");
    expect(bars()).toEqual(["0", "0.5", "1"]);
    rerender(<OverlayPill state="processing" label="Processing" levels={[1, 1, 1]} />);
    expect(container.querySelector(".waveform")?.getAttribute("data-mode")).toBe("level");
    expect(bars()).toEqual(["", "", "", "", ""]);
  });

  it("can trade the bars for a spinner, a check or an alert outside listening", () => {
    const { container, rerender } = render(
      <OverlayPill state="listening" indicator="state" label="Listening" levels={[0.2, 0.4]} />,
    );
    const marks = () => ({
      wave: container.querySelector(".waveform") !== null,
      spinner: container.querySelector(".tmw-spinner") !== null,
      glyph: container.querySelector(".tmw-overlay-glyph") !== null,
    });
    expect(marks()).toEqual({ wave: true, spinner: false, glyph: false });
    rerender(<OverlayPill state="processing" indicator="state" label="Processing" />);
    expect(marks()).toEqual({ wave: false, spinner: true, glyph: false });
    expect(screen.getByRole("status").textContent).toBe("Processing");
    rerender(<OverlayPill state="error" indicator="state" label="No microphone" />);
    expect(marks()).toEqual({ wave: false, spinner: false, glyph: true });
    rerender(<OverlayPill state="processing" label="Processing" />);
    expect(marks()).toEqual({ wave: true, spinner: false, glyph: false });
  });

  it("alerts on an error and keeps an action inside the pill", () => {
    render(
      <OverlayPill
        state="error"
        label="Microphone blocked."
        action={<button type="button">Open settings</button>}
      />,
    );
    const pill = screen.getByRole("alert");
    expect(pill.textContent).toBe("Microphone blocked.Open settings");
    expect(screen.getByRole("button", { name: "Open settings" }).closest(".tmw-overlay")).toBe(
      pill,
    );
    expect(screen.queryByRole("status")).toBeNull();
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
