import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, Check, FileText, Globe2, Minus, UserRound } from "lucide-react";
import { getDict } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/dict";
import { getProfile } from "@/lib/db";
import { docsFor } from "@/lib/bourses/checklist";
import { inferCriteria } from "@/lib/bourses/criteria";
import { daysBetween, todayYmd } from "@/lib/bourses/deadline";
import { FEEDS } from "@/lib/bourses/feeds";
import { evaluate } from "@/lib/bourses/rank";
import { allBourses, findBourse, getTracking, lastCriteria } from "@/lib/bourses/store";
import { PageHeader, Progress, Section } from "@/components/kit";
import { COVER_KEYS, MatchRing, hostText } from "@/components/bourses/bourse-card";
import { Tracker } from "@/components/bourses/tracker";
import { chipTone, countryLabel, dateLabel, deadlineText, eligibilityText, feeLabel, languageLabel, moneyLabel, reasonText } from "@/components/bourses/text";

type Props = { params: Promise<{ id: string }> };

/** Countries the "Going abroad" guide covers, by anchor. */
const ABROAD = ["FR", "DE", "CH", "NL", "BE", "CA", "GB", "US"];

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: findBourse(decodeURIComponent(id))?.name ?? (await getDict()).t.bourses2.title };
}

export default async function BoursePage({ params }: Props) {
  const id = decodeURIComponent((await params).id);
  const { t, locale } = await getDict();
  const m = t.bourses2;
  const d = m.detail;
  const today = todayYmd();
  const b = findBourse(id, today);
  const tracking = getTracking(id);
  if (!b && !tracking) notFound();
  const back = { href: "/app/bourses", label: d.back };

  // A scholarship the student follows that left the catalogue: the notes and ticks stay reachable.
  if (!b)
    return (
      <>
        <PageHeader back={back} title={id} lead={m.mine.goneHint} />
        <Section id="suivi" title={m.track.title}>
          <Tracker id={id} tracking={tracking} docs={docsFor([]).map((key) => ({ key, label: m.docs[key] }))} />
        </Section>
      </>
    );

  const criteria = lastCriteria() ?? inferCriteria(getProfile(), today).criteria;
  const v = evaluate(b, criteria, today);
  const dl = deadlineText(t, v.deadline, locale, b.kind);
  const el = eligibilityText(t, v.eligibility, criteria.nationality, locale);
  const nat = countryLabel(criteria.nationality, locale);
  const groups = m.eligibility.groups as Record<string, string>;
  const who = (b.eligibleNationalities ?? []).map((e) => (e === "*" ? m.eligibility.any : (groups[e] ?? countryLabel(e, locale))));
  const money = moneyLabel(t, b, locale);
  const guide = b.hostCountries.find((h) => ABROAD.includes(h));
  const linked = b.kind === "call" && b.programId ? findBourse(b.programId, today) : null;
  const openCalls = b.kind === "program" ? allBourses(today).calls.filter((c) => c.programId === b.id && !c.closed) : [];
  const docs = docsFor(b.levels, b.providerType === "government").map((key) => ({ key, label: m.docs[key], hint: key === "language" && b.languageTests?.length ? b.languageTests.join(", ") : undefined }));

  // How far into the application window we are, when both ends are known.
  const { opensOn, date, status, daysLeft } = v.deadline;
  const inWindow = opensOn && date && (status === "open" || status === "closing");
  const pct = inWindow ? Math.round((daysBetween(opensOn, today) / Math.max(1, daysBetween(opensOn, date))) * 100) : null;

  const facts: [string, React.ReactNode][] = [
    [d.provider, b.kind === "program" ? [b.provider, b.providerType && m.providerTypes[b.providerType]].filter(Boolean).join(" · ") : (FEEDS.find((f) => f.id === b.feed)?.label ?? b.provider)],
    [d.host, hostText(t, b.hostCountries, locale, 12)],
    [d.levels, b.levels.length ? b.levels.map((l) => m.levels[l]).join(", ") : d.notStated],
    [d.fields, !b.fields.length ? d.notStated : b.fields.includes("*") ? m.card.anyField : b.fields.map((f) => (f === "*" ? m.card.anyField : m.fields[f])).join(", ")],
    [d.funding, b.funding ? m.funding[b.funding] : d.notStated],
    [d.amount, money ?? d.notStated],
    [d.fee, feeLabel(t, b) ?? d.notStated],
    [d.languages, b.languages.length ? b.languages.map((l) => languageLabel(l, locale)).join(", ") : d.notStated],
    ...(b.languageTests?.length ? [[d.tests, b.languageTests.join(", ")] as [string, React.ReactNode]] : []),
    ...(b.ageLimit !== undefined ? [[d.ageLimit, String(b.ageLimit)] as [string, React.ReactNode]] : []),
  ];

  return (
    <>
      <PageHeader
        back={back}
        eyebrow={b.kind === "call" ? m.card.call : m.card.program}
        title={b.name}
        lead={b.summary[locale] || (b.kind === "call" ? d.callNote : undefined)}
        actions={
          <a href={b.url} target="_blank" rel="noopener noreferrer" className="btn btn-primary">
            {b.kind === "call" ? d.openCall : d.official} <ArrowUpRight size={15} aria-hidden="true" />
            <span className="sr-only">{d.newTab}</span>
          </a>
        }
      />
      <ul className="-mt-1 mb-5 flex flex-wrap gap-1.5">
        {b.levels.map((l) => <li key={l} className="chip">{m.levels[l]}</li>)}
        {b.funding && <li className={chipTone(b.funding === "full" ? "success" : "")}>{m.funding[b.funding]}</li>}
        <li className={chipTone(dl.tone)}>
          {dl.label}
          {dl.detail && <span className="font-normal opacity-80">· {dl.detail}</span>}
        </li>
      </ul>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="grid gap-4">
          <Section id="facts" title={d.facts}>
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              {facts.map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">{label}</dt>
                  <dd className="mt-0.5 text-ink-2">{value}</dd>
                </div>
              ))}
              <div className="sm:col-span-2">
                <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">{d.covers}</dt>
                <dd className="mt-1">
                  {b.covers ? (
                    <ul className="flex flex-wrap gap-x-4 gap-y-1">
                      {COVER_KEYS.map((k) => (
                        <li key={k} className={`flex items-center gap-1.5 ${b.covers![k] ? "text-ink-2" : "text-muted"}`}>
                          {b.covers![k] ? <Check size={14} className="text-success" aria-hidden="true" /> : <Minus size={14} aria-hidden="true" />}
                          {m.covers[k]}
                          {!b.covers![k] && <span className="sr-only">: {d.notCovered}</span>}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="text-muted">{d.coversUnknown}</span>
                  )}
                </dd>
              </div>
            </dl>
            {b.tags && b.tags.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">{d.tags}</p>
                <ul className="mt-1.5 flex flex-wrap gap-1.5">
                  {b.tags.map((x) => <li key={x} className="chip">{x}</li>)}
                </ul>
              </div>
            )}
            <p className="mt-4 text-[0.78rem] text-muted">
              {b.verified && fmt(d.verified, { date: dateLabel(b.verified, locale) })}
              {b.published && `${fmt(d.published, { date: dateLabel(b.published, locale) })} `}
              {b.firstSeen && b.lastSeen && fmt(d.seen, { first: dateLabel(b.firstSeen, locale), last: dateLabel(b.lastSeen, locale) })}
            </p>
          </Section>

          <Section id="eligibility" title={d.eligibility} i={1}>
            <p className={`flex items-start gap-2 text-sm font-medium ${el.tone === "danger" ? "text-danger" : "text-ink"}`}>
              {el.tone === "success" && <Check size={16} className="mt-0.5 shrink-0 text-success" aria-hidden="true" />}
              {el.label}
            </p>
            <ul className="mt-2 grid gap-1 text-sm text-ink-2">
              {v.eligibility.via && v.eligibility.via in groups && <li>{fmt(m.eligibility.includes, { country: nat })}</li>}
              {v.eligibility.eligible === false && who.length > 0 && <li>{fmt(m.eligibility.reserved, { list: who.join(", ") })}</li>}
              {b.kind === "program" && criteria.nationality !== "TN" && <li>{m.eligibility.otherCountry}</li>}
              {b.kind === "program" && <li>{b.ageLimit !== undefined ? fmt(m.eligibility.ageLimit, { n: b.ageLimit }) : m.eligibility.noAgeLimit}</li>}
              {v.blockers.includes("age") && <li className="text-danger">{fmt(m.eligibility.ageOver, { age: criteria.age ?? 0 })}</li>}
            </ul>
          </Section>

          <Section id="match" title={d.match} i={2}>
            <div className="flex gap-4">
              <MatchRing score={v.score} label={fmt(m.card.matchLabel, { n: v.score })} size={60} />
              <div className="min-w-0 text-sm">
                <p className="text-muted">{d.matchLead}</p>
                <ul className="mt-2 grid gap-1 text-ink-2">
                  {v.reasons.map((r) => (
                    <li key={r.key} className="flex gap-2">
                      <Check size={14} className="mt-0.5 shrink-0 text-success" aria-hidden="true" /> {reasonText(t, r, locale)}
                    </li>
                  ))}
                </ul>
                {v.blockers.length > 0 && (
                  <>
                    <p className="mt-3 font-medium text-ink">{d.hidden}</p>
                    <ul className="mt-1 grid gap-1 text-ink-2">
                      {v.blockers.map((k) => <li key={k}>{m.blockers[k]}</li>)}
                    </ul>
                  </>
                )}
              </div>
            </div>
          </Section>

          <Section id="timeline" title={d.timeline} i={3}>
            <p className="text-sm">
              <span className={chipTone(dl.tone)}>{dl.label}</span>
            </p>
            {(opensOn || date) && (
              <ol className="mt-3 grid gap-2 text-sm text-ink-2">
                {opensOn && (
                  <li className="flex justify-between gap-3">
                    <span>{b.kind === "program" ? d.usualOpens : d.opens}</span> <span className="mono text-ink">{dateLabel(opensOn, locale)}</span>
                  </li>
                )}
                <li className="flex justify-between gap-3">
                  <span>{d.today}</span> <span className="mono text-ink">{dateLabel(today, locale)}</span>
                </li>
                {date && (
                  <li className="flex justify-between gap-3">
                    <span>
                      {b.kind === "program" ? d.usualDeadline : d.deadline}
                      {daysLeft !== null && daysLeft > 0 && <span className="text-muted"> ({fmt(d.inDays, { n: daysLeft })})</span>}
                    </span>
                    <span className="mono text-ink">{dateLabel(date, locale)}</span>
                  </li>
                )}
              </ol>
            )}
            {pct !== null && (
              <div className="mt-3">
                <Progress value={pct} label={fmt(d.window, { pct })} tone={status === "closing" ? "saffron" : "accent"} />
                <p className="mt-1.5 text-[0.78rem] text-muted">{fmt(d.window, { pct })}</p>
              </div>
            )}
            {b.kind === "program" && (
              <p className="mt-3 text-[0.8rem] text-muted">
                {[d.checkDates, v.deadline.approximate && d.approx, v.deadline.assumed && status !== "rolling" && d.windowAssumed].filter(Boolean).join(" ")}{" "}
                <a href={b.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-accent-text underline-offset-2 hover:underline">
                  {d.official} <span className="sr-only">{d.newTab}</span>
                </a>
              </p>
            )}
          </Section>

          {(linked || openCalls.length > 0) && (
            <Section id="linked" title={linked ? d.linkedProgram : d.linkedCalls} i={4}>
              <ul className="grid gap-1.5 text-sm">
                {(linked ? [linked] : openCalls).map((x) => (
                  <li key={x.id}>
                    <Link href={`/app/bourses/${x.id}`} className="font-semibold text-accent-text underline-offset-2 hover:underline">{x.name}</Link>
                    <span className="text-muted"> · {deadlineText(t, evaluate(x, criteria, today).deadline, locale, x.kind).label}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>

        <div className="grid gap-4">
          <Section id="suivi" title={m.track.title} i={1}>
            <Tracker id={b.id} tracking={tracking} docs={docs} />
          </Section>
          <Section id="tools" title={d.tools} i={2}>
            <ul className="grid gap-3 text-sm">
              {[
                { href: "/app/profile/cv", Icon: FileText, label: d.cv, hint: d.cvHint },
                { href: guide ? `/app/abroad#${guide.toLowerCase()}` : "/app/abroad", Icon: Globe2, label: d.abroad, hint: d.abroadHint },
                { href: "/app/profile", Icon: UserRound, label: d.profile, hint: d.profileHint },
              ].map(({ href, Icon, label, hint }) => (
                <li key={href} className="flex items-start gap-3">
                  <span className="tile tile-sm tone-accent" aria-hidden="true"><Icon size={16} /></span>
                  <span>
                    <Link href={href} className="font-semibold text-ink hover:text-accent-text">{label}</Link>
                    <span className="block text-muted">{hint}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      </div>
    </>
  );
}
