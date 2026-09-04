import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import { PwaInstallButton } from "../../src/components/PwaInstallButton";

it("zeigt den Browser-Installationsdialog nur nach bestätigter Installierbarkeit", async () => {
  const user = userEvent.setup();
  const prompt = vi.fn().mockResolvedValue(undefined);
  render(<PwaInstallButton />);
  expect(
    screen.queryByRole("button", { name: "App installieren" }),
  ).not.toBeInTheDocument();

  const event = new Event("beforeinstallprompt", { cancelable: true });
  Object.assign(event, {
    prompt,
    userChoice: Promise.resolve({ outcome: "accepted" }),
  });
  fireEvent(window, event);
  await user.click(
    await screen.findByRole("button", { name: "App installieren" }),
  );

  expect(prompt).toHaveBeenCalledOnce();
  expect(
    screen.queryByRole("button", { name: "App installieren" }),
  ).not.toBeInTheDocument();
});
