import { pageTitle } from "@/lib/i18n/title";
import { Section } from "@/components/kit";
import { SearchPrefsForm, SweepButton } from "@/components/sources/search-prefs";
import { SourcesTabs } from "@/components/sources/tabs";
import { getDict } from "@/lib/i18n/server";
import { getSearchPrefs } from "@/lib/repo/sources";

export const generateMetadata = pageTitle("searchPrefs");

/** The Preferences tab: what every scan keeps or refuses, in one place. */
export default async function SearchPreferencesPage() {
  const { t } = await getDict();
  const p = t.sources2.prefs;
  return (
    <>
      <SourcesTabs current="prefs" />
      <header className="mb-[18px]">
        <h1 className="text-[1.75rem] leading-[1.1] tracking-[-0.025em] sm:text-[2rem]">{p.title}</h1>
        <p className="mt-1.5 text-muted">{p.lead}</p>
      </header>
      <div className="max-w-[860px] space-y-6">
        <Section id="search-prefs" title={p.formTitle} i={1}>
          <SearchPrefsForm prefs={getSearchPrefs()} />
        </Section>
        <Section id="sweep" title={p.sweep} i={2}>
          <p className="-mt-2 mb-3 text-sm text-muted">{p.sweepHint}</p>
          <SweepButton />
        </Section>
      </div>
    </>
  );
}
