import { pageTitle } from "@/lib/i18n/title";
import { getDict } from "@/lib/i18n/server";
import { PageHeader } from "@/components/kit";
import { ContactsPanel } from "@/components/pipeline/panels";
import { listAllContacts } from "@/lib/repo/apps";

export const generateMetadata = pageTitle("contacts");

/** The network: every person from every application, plus the ones met outside them. */
export default async function ContactsPage() {
  const { t } = await getDict();
  const c = t.apps2.contacts;
  return (
    <>
      <PageHeader title={t.shell2.nav.contacts} lead={c.pageLead} />
      <ContactsPanel appId={null} contacts={listAllContacts()} title={c.everyone} />
    </>
  );
}
