import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export const PwaInstallButton = () => {
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const capturePrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const finishInstallation = () => setInstallPrompt(null);
    window.addEventListener("beforeinstallprompt", capturePrompt);
    window.addEventListener("appinstalled", finishInstallation);
    return () => {
      window.removeEventListener("beforeinstallprompt", capturePrompt);
      window.removeEventListener("appinstalled", finishInstallation);
    };
  }, []);

  if (!installPrompt) return null;

  const install = async () => {
    try {
      await installPrompt.prompt();
      await installPrompt.userChoice;
    } finally {
      setInstallPrompt(null);
    }
  };

  return (
    <aside className="pwa-install" aria-label="Life OS installieren">
      <span>Life OS kann auf diesem Gerät als App installiert werden.</span>
      <button className="secondary-button" onClick={() => void install()}>
        App installieren
      </button>
    </aside>
  );
};
