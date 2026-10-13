import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { getDict } from "@/lib/i18n/server";
import { Wordmark } from "@/components/logo";
import { Door } from "@/components/landing/door";
import s from "@/components/landing/styles";

export default async function NotFound() {
  const { t } = await getDict();
  const N = t.landing2.notFound;
  return (
    <div className={`${s.night} ${s.sky} relative flex flex-1 flex-col overflow-hidden`}>
      <div className="pattern pattern-fade" aria-hidden="true" />
      <header className="relative mx-auto w-full max-w-6xl px-4 py-5 sm:px-6">
        <Link href="/" aria-label={t.landing2.nav.home} className="inline-block rounded-md">
          <Wordmark />
        </Link>
      </header>
      <main id="main" className="relative grid flex-1 place-items-center px-4 pb-20 pt-6 sm:px-6">
        <div className="grid grid-cols-1 max-w-3xl items-center gap-12 md:grid-cols-[auto_1fr] md:gap-16">
          <Door closed className="mx-auto w-40 sm:w-52" />
          <div className="text-center md:text-left">
            <p className="mono text-sm font-semibold tracking-[0.2em] text-saffron">{N.kicker}</p>
            <h1 className="mt-3 text-[clamp(2.4rem,6vw,4rem)] leading-[0.98]">{N.title}</h1>
            <p className="mt-4 text-lg text-ink-2">{N.text}</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3 md:justify-start">
              <Link href="/" className="btn btn-secondary btn-lg">
                <ArrowLeft size={18} aria-hidden="true" /> {N.home}
              </Link>
              <Link href="/app" className="btn btn-primary btn-lg">
                {N.app} <ArrowRight size={18} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
