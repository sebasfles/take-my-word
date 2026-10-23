import { Badge } from "@take-my-word/brand";
import { AccountSection } from "@/components/account-section.tsx";
import { LocalTime } from "@/components/local-time.tsx";
import {
  bothLoaded,
  contextLabels,
  languageList,
  languageName,
  refinerNames,
  styleLabel,
  transcriberNames,
  usageMinutes,
} from "@/lib/account.ts";
import { format } from "@/lib/i18n.ts";
import { loadAccount } from "@/lib/server/account.ts";
import { sectionMetadata } from "@/lib/server/metadata.ts";
import { currentDictionary, currentLocale, currentUsername } from "@/lib/server/request.ts";

export const generateMetadata = () => sectionMetadata((t) => t.app.title);

export default async function AccountPage() {
  const t = await currentDictionary();
  const locale = await currentLocale();
  const username = await currentUsername();
  const data = await loadAccount(async (api) => {
    const [settings, styles, usage] = await Promise.all([
      api.settings(),
      api.styles(),
      api.usage(),
    ]);
    const both = bothLoaded([settings, styles]);
    return both.kind === "ok"
      ? ({ kind: "ok", value: [...both.value, usage.kind === "ok" ? usage.value : null] } as const)
      : both;
  });

  return (
    <AccountSection
      t={t}
      title={format(t.account.greeting, { username })}
      intro={t.app.readOnly}
      data={data}
    >
      {([settings, styles, usage]) => {
        const style = styleLabel(settings.defaultStyleId, styles, t.styles);
        const rows = [
          { label: t.account.username, value: username, testId: "account-username" },
          { label: t.account.defaultStyle, value: style.name, testId: "default-style" },
          {
            label: t.account.language,
            value: languageName(settings.locale, locale),
            testId: "account-language",
          },
          {
            label: t.account.dictationLanguages,
            value: languageList(settings.dictationLanguages, locale),
            testId: "account-dictation-languages",
          },
          {
            label: t.account.context,
            value:
              settings.context.picks.length === 0 && settings.context.detail === "" ? (
                t.account.contextEmpty
              ) : (
                <>
                  {settings.context.picks.length > 0 && (
                    <span className="context-picks">
                      {contextLabels(settings.context, t.account).map((label) => (
                        <Badge key={label}>{label}</Badge>
                      ))}
                    </span>
                  )}
                  {settings.context.detail !== "" && (
                    <span className="context-detail" data-testid="account-context-detail">
                      {settings.context.detail}
                    </span>
                  )}
                </>
              ),
            testId: "account-context",
          },
          ...(usage === null
            ? []
            : [
                {
                  label: t.account.usage,
                  value: (
                    <>
                      {format(t.account.usageValue, usageMinutes(usage))}
                      <span className="details-note">
                        {t.account.usageResets}{" "}
                        <LocalTime value={usage.resetsAt} locale={locale} timeOnly />
                      </span>
                    </>
                  ),
                  testId: "account-usage",
                },
              ]),
          {
            label: t.account.transcriber,
            value: transcriberNames[settings.providers.transcriber],
            testId: "account-transcriber",
          },
          {
            label: t.account.refiner,
            value: refinerNames[settings.providers.refiner],
            testId: "account-refiner",
          },
        ];
        return (
          <dl className="card details">
            {rows.map((row) => (
              <div key={row.testId} className="details-row">
                <dt>{row.label}</dt>
                <dd data-testid={row.testId}>{row.value}</dd>
              </div>
            ))}
          </dl>
        );
      }}
    </AccountSection>
  );
}
