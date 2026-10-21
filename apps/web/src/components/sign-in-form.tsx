"use client";

import { useRouter } from "next/navigation";
import { useState, type SubmitEvent } from "react";
import type { Dictionary } from "@/lib/i18n.ts";
import { signedFetch } from "@/lib/signed-fetch.ts";

type Strings = Dictionary["signIn"];
type Step = "credentials" | "new-password";
type ErrorKey = "invalidCredentials" | "unavailable" | "mismatch" | "invalidPassword" | "expired";

const errorKeys: Record<string, ErrorKey> = {
  invalid_credentials: "invalidCredentials",
  invalid_password: "invalidPassword",
  expired: "expired",
};

async function post(path: string, body: unknown): Promise<{ step?: string; error?: ErrorKey }> {
  try {
    const response = await signedFetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      step?: string;
      error?: string;
    };
    if (response.ok && payload.step !== undefined) return { step: payload.step };
    return { error: errorKeys[payload.error ?? ""] ?? "unavailable" };
  } catch {
    return { error: "unavailable" };
  }
}

export function SignInForm({ t }: { t: Strings }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("credentials");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<ErrorKey | null>(null);
  const [pending, setPending] = useState(false);

  function finish(result: { step?: string; error?: ErrorKey }) {
    if (result.step === "done") {
      router.replace("/app");
      router.refresh();
      return;
    }
    if (result.step === "new-password") {
      setPassword("");
      setStep("new-password");
    }
    if (result.error === "expired") {
      setStep("credentials");
      setNewPassword("");
      setConfirmation("");
    }
    setError(result.error ?? null);
    setPending(false);
  }

  async function submitCredentials(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    finish(await post("/api/session", { username, password, remember }));
  }

  async function submitNewPassword(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (newPassword !== confirmation) {
      setError("mismatch");
      return;
    }
    setPending(true);
    setError(null);
    finish(await post("/api/session/password", { newPassword }));
  }

  const alert =
    error === null ? null : (
      <p id="sign-in-error" role="alert" className="form-error">
        {t[error]}
      </p>
    );
  const describedBy = error === null ? undefined : "sign-in-error";

  if (step === "new-password") {
    return (
      <form className="form" onSubmit={(event) => void submitNewPassword(event)}>
        <div className="form-heading">
          <h1>{t.newPasswordTitle}</h1>
          <p>{t.newPasswordIntro}</p>
        </div>
        <div className="field">
          <label htmlFor="new-password">{t.newPassword}</label>
          <input
            id="new-password"
            name="new-password"
            type="password"
            autoComplete="new-password"
            required
            autoFocus
            value={newPassword}
            onChange={(event) => {
              setNewPassword(event.target.value);
            }}
            aria-describedby={
              describedBy === undefined ? "password-rules" : `password-rules ${describedBy}`
            }
          />
          <p id="password-rules" className="field-hint">
            {t.passwordRules}
          </p>
        </div>
        <div className="field">
          <label htmlFor="confirm-password">{t.confirmPassword}</label>
          <input
            id="confirm-password"
            name="confirm-password"
            type="password"
            autoComplete="new-password"
            required
            value={confirmation}
            onChange={(event) => {
              setConfirmation(event.target.value);
            }}
            aria-describedby={describedBy}
          />
        </div>
        {alert}
        <button type="submit" className="button button-primary button-block" disabled={pending}>
          {pending ? t.saving : t.save}
        </button>
      </form>
    );
  }

  return (
    <form className="form" onSubmit={(event) => void submitCredentials(event)}>
      <div className="form-heading">
        <h1>{t.title}</h1>
        <p>{t.intro}</p>
      </div>
      <div className="field">
        <label htmlFor="username">{t.username}</label>
        <input
          id="username"
          name="username"
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          autoFocus
          value={username}
          onChange={(event) => {
            setUsername(event.target.value);
          }}
          aria-describedby={describedBy}
        />
      </div>
      <div className="field">
        <label htmlFor="password">{t.password}</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
          }}
          aria-describedby={describedBy}
        />
      </div>
      <label className="checkbox">
        <input
          type="checkbox"
          name="remember"
          checked={remember}
          onChange={(event) => {
            setRemember(event.target.checked);
          }}
        />
        <span>{t.remember}</span>
      </label>
      {alert}
      <button type="submit" className="button button-primary button-block" disabled={pending}>
        {pending ? t.submitting : t.submit}
      </button>
    </form>
  );
}
