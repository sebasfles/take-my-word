import { type SubmitEvent, useState } from "react";
import { Button, TextInput } from "@take-my-word/brand";
import { type AccountStep, bridge, problemOf } from "../../bridge.ts";
import { type MessageId, t } from "../../i18n.ts";

export function SignInForm({
  notice,
  onStep,
}: {
  notice: MessageId | null;
  onStep: (step: AccountStep) => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MessageId | null>(notice);

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    bridge
      .signIn(username, password)
      .then((step) => {
        setPassword("");
        onStep(step);
      })
      .catch((reason: unknown) => {
        setError(problemOf(reason).message);
      })
      .finally(() => {
        setBusy(false);
      });
  };

  return (
    <form className="window-form" onSubmit={submit}>
      <TextInput
        label={t("signIn.username")}
        name="username"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        autoFocus
        required
        value={username}
        onChange={(event) => {
          setUsername(event.target.value);
        }}
        aria-describedby={error ? "sign-in-error" : undefined}
      />
      <TextInput
        label={t("signIn.password")}
        name="password"
        type="password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(event) => {
          setPassword(event.target.value);
        }}
        aria-describedby={error ? "sign-in-error" : undefined}
      />
      {error && (
        <p id="sign-in-error" className="form-error" role="alert">
          {t(error)}
        </p>
      )}
      <Button type="submit" block loading={busy}>
        {t(busy ? "signIn.submitting" : "signIn.submit")}
      </Button>
    </form>
  );
}

export function ChoosePasswordForm({
  onStep,
  onBackToSignIn,
}: {
  onStep: (step: AccountStep) => void;
  onBackToSignIn: (message: MessageId) => void;
}) {
  const [password, setPassword] = useState("");
  const [repeated, setRepeated] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MessageId | null>(null);

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (password !== repeated) {
      setError("choosePassword.mismatch");
      return;
    }
    setBusy(true);
    setError(null);
    bridge
      .choosePassword(password)
      .then(onStep)
      .catch((reason: unknown) => {
        const problem = problemOf(reason);
        if (problem.backToSignIn) onBackToSignIn(problem.message);
        else setError(problem.message);
      })
      .finally(() => {
        setBusy(false);
      });
  };

  return (
    <form className="window-form" onSubmit={submit}>
      <TextInput
        label={t("choosePassword.new")}
        name="new-password"
        type="password"
        autoComplete="new-password"
        autoFocus
        required
        hint={t("choosePassword.rules")}
        value={password}
        onChange={(event) => {
          setPassword(event.target.value);
        }}
        aria-describedby={error ? "choose-password-error" : undefined}
      />
      <TextInput
        label={t("choosePassword.repeat")}
        name="repeat-password"
        type="password"
        autoComplete="new-password"
        required
        value={repeated}
        onChange={(event) => {
          setRepeated(event.target.value);
        }}
        aria-describedby={error ? "choose-password-error" : undefined}
      />
      {error && (
        <p id="choose-password-error" className="form-error" role="alert">
          {t(error)}
        </p>
      )}
      <Button type="submit" block loading={busy}>
        {t(busy ? "common.saving" : "choosePassword.submit")}
      </Button>
    </form>
  );
}
