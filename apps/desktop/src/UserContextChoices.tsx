import { TextArea } from "@take-my-word/brand";
import {
  type UserContext,
  type UserContextPick,
  userContextLimits,
  userContextPicks,
} from "@take-my-word/shared";
import { useId } from "react";
import { t } from "./i18n.ts";

export function toggledPick(
  picks: readonly UserContextPick[],
  pick: UserContextPick,
): UserContextPick[] {
  if (picks.includes(pick)) return picks.filter((other) => other !== pick);
  return picks.length < userContextLimits.maxPicks ? [...picks, pick] : [...picks];
}

export function UserContextChoices({
  value,
  onChange,
  disabled = false,
}: {
  value: UserContext;
  onChange: (next: UserContext) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const full = value.picks.length >= userContextLimits.maxPicks;
  return (
    <div className="context-choices">
      <fieldset className="context-picks" disabled={disabled} aria-describedby={`${id}-count`}>
        <legend className="tmw-label">{t("context.picks")}</legend>
        <div className="pick-chips">
          {userContextPicks.map((pick) => {
            const checked = value.picks.includes(pick);
            return (
              <label key={pick} className="pick-chip" data-checked={checked ? "" : undefined}>
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={!checked && full}
                  onChange={() => {
                    onChange({ ...value, picks: toggledPick(value.picks, pick) });
                  }}
                />
                {t(`context.pick.${pick}`)}
              </label>
            );
          })}
        </div>
        <p id={`${id}-count`} className="tmw-hint">
          {t("context.picks.count", { count: value.picks.length })}
        </p>
      </fieldset>
      <TextArea
        label={t("context.detail")}
        hint={t("context.detail.count", { count: value.detail.length })}
        rows={2}
        maxLength={userContextLimits.maxDetailLength}
        placeholder={t("context.detail.placeholder")}
        disabled={disabled}
        value={value.detail}
        onChange={(event) => {
          onChange({ ...value, detail: event.target.value });
        }}
      />
    </div>
  );
}
