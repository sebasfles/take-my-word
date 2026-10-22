import { AccountSection } from "@/components/account-section.tsx";
import {
  bothLoaded,
  languageList,
  languageName,
  refinerNames,
  styleLabel,
  transcriberNames,
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
  const data = await loadAccount(async (api) =>
    bothLoaded(await Promise.all([api.settings(), api.styles()])),
  );

  return (
    <AccountSection
      t={t}
      title={format(t.account.greeting, { username })}
      intro={t.app.readOnly}
      data={data}
    >
      {([settings, styles]) => {
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
