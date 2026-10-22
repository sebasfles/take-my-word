"use client";

import { useRouter } from "next/navigation";
import { Button, Checkbox, TextInput } from "@take-my-word/brand";
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
        <TextInput
          id="new-password"
          name="new-password"
          type="password"
          autoComplete="new-password"
          required
          autoFocus
          label={t.newPassword}
          hint={t.passwordRules}
          value={newPassword}
          onChange={(event) => {
            setNewPassword(event.target.value);
          }}
          aria-describedby={describedBy}
        />
        <TextInput
          id="confirm-password"
          name="confirm-password"
          type="password"
          autoComplete="new-password"
          required
          label={t.confirmPassword}
          value={confirmation}
          onChange={(event) => {
            setConfirmation(event.target.value);
          }}
          aria-describedby={describedBy}
        />
        {alert}
        <Button type="submit" size="lg" block loading={pending}>
          {pending ? t.saving : t.save}
        </Button>
      </form>
    );
  }

  return (
    <form className="form" onSubmit={(event) => void submitCredentials(event)}>
      <div className="form-heading">
        <h1>{t.title}</h1>
        <p>{t.intro}</p>
      </div>
      <TextInput
        id="username"
        name="username"
        type="text"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        required
        autoFocus
        label={t.username}
        value={username}
        onChange={(event) => {
          setUsername(event.target.value);
        }}
        aria-describedby={describedBy}
      />
      <TextInput
        id="password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        label={t.password}
        value={password}
        onChange={(event) => {
          setPassword(event.target.value);
        }}
        aria-describedby={describedBy}
      />
      <Checkbox
        name="remember"
        label={t.remember}
        checked={remember}
        onChange={(event) => {
          setRemember(event.target.checked);
        }}
      />
      {alert}
      <Button type="submit" size="lg" block loading={pending}>
        {pending ? t.submitting : t.submit}
      </Button>
    </form>
  );
}
