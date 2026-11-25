/** A public, machine-readable feed of scholarship calls that its publisher allows programs to read. */
export interface Feed {
  /** Stable slug, e.g. "euraxess-funding". */
  id: string;
  label: string;
  url: string;
  format: "rss" | "atom" | "json";
  /** Main language of the items, ISO 639-1. */
  lang: string;
  /** What the feed covers, in a few words. */
  scope: string;
  /** Date the feed last answered with items, YYYY-MM-DD. */
  checked: string;
}

const C = "2026-11-25";

// Each feed answered 200 with dated items on the `checked` day and its robots.txt allows the path.
// Read titles, dates, categories and links only: several publishers forbid republishing their article text.
export const FEEDS: Feed[] = [
  // Aggregators, English
  { id: "scholars4dev", label: "Scholars4Dev", url: "https://www.scholars4dev.com/feed/", format: "rss", lang: "en", scope: "Scholarships for students from developing countries, all levels", checked: C },
  { id: "opportunitydesk-scholarships", label: "Opportunity Desk: scholarships", url: "https://opportunitydesk.org/category/fellowships-and-scholarships/feed/", format: "rss", lang: "en", scope: "Scholarship calls worldwide, deadline in the description", checked: C },
  { id: "opportunitydesk-fellowships", label: "Opportunity Desk: fellowships", url: "https://opportunitydesk.org/category/fellowships/feed/", format: "rss", lang: "en", scope: "Fellowships, leadership and research programmes", checked: C },
  { id: "ofa-scholarships", label: "Opportunities for Africans: scholarships", url: "https://www.opportunitiesforafricans.com/category/scholarships/feed/", format: "rss", lang: "en", scope: "Scholarships open to African students", checked: C },
  { id: "ofa-fellowships", label: "Opportunities for Africans: fellowships", url: "https://www.opportunitiesforafricans.com/category/fellowships/feed/", format: "rss", lang: "en", scope: "Fellowships and research stays open to Africans", checked: C },
  { id: "scholarshipscorner-scholarships", label: "Scholarships Corner: scholarships", url: "https://scholarshipscorner.website/category/scholarships/feed/", format: "rss", lang: "en", scope: "Government and university scholarships, master and PhD", checked: C },
  { id: "scholarshipscorner-fellowships", label: "Scholarships Corner: fellowships", url: "https://scholarshipscorner.website/category/fellowships/feed/", format: "rss", lang: "en", scope: "Funded fellowships, summer research and internships", checked: C },
  { id: "scholarshipscorner-exchange", label: "Scholarships Corner: exchange programmes", url: "https://scholarshipscorner.website/category/exchange-programs/feed/", format: "rss", lang: "en", scope: "Short funded exchanges and leadership programmes", checked: C },
  { id: "opportunitiescircle-scholarships", label: "Opportunities Circle: scholarships", url: "https://www.opportunitiescircle.com/category/scholarships/feed/", format: "rss", lang: "en", scope: "Scholarships for international students, master and PhD", checked: C },
  { id: "oyaop", label: "OYA Opportunities", url: "https://oyaop.com/feed/", format: "rss", lang: "en", scope: "Scholarships, fellowships, exchanges and conferences", checked: C },
  { id: "opportunitiescorners", label: "Opportunities Corners", url: "https://opportunitiescorners.com/feed/", format: "rss", lang: "en", scope: "Summer schools, exchanges, internships and scholarships (6 items)", checked: C },
  // Aggregators, French
  { id: "concoursn-bourses", label: "Concoursn: bourses", url: "https://www.concoursn.com/category/bourses/feed/", format: "rss", lang: "fr", scope: "Bourses d'études pour étudiants africains francophones", checked: C },
  { id: "infosconcours-bourses", label: "Infos Concours Éducation: bourses", url: "https://infosconcourseducation.com/category/bourses/feed/", format: "rss", lang: "fr", scope: "Bourses de master et de doctorat, France, Canada, Europe", checked: C },
  // Research funding and positions
  { id: "fundit", label: "Fund┋it", url: "https://fundit.fr/fr/rss.xml", format: "rss", lang: "fr", scope: "Appels et bourses de recherche en sciences humaines et sociales, doctorat et postdoc", checked: C },
  { id: "calenda", label: "Calenda (OpenEdition)", url: "https://calenda.org/feed.php", format: "rss", lang: "fr", scope: "Agenda SHS : garder la catégorie « Bourse, prix et emploi »", checked: C },
  { id: "inspire-phd", label: "INSPIRE-HEP jobs: PhD", url: "https://inspirehep.net/api/jobs?sort=mostrecent&size=25&rank=PHD", format: "json", lang: "en", scope: "Funded PhD positions in physics and related fields", checked: C },
  { id: "inspire-postdoc", label: "INSPIRE-HEP jobs: postdoc", url: "https://inspirehep.net/api/jobs?sort=mostrecent&size=25&rank=POSTDOC", format: "json", lang: "en", scope: "Postdoctoral positions in physics and related fields", checked: C },
  { id: "cambridge-studentships", label: "University of Cambridge: studentships", url: "https://www.jobs.cam.ac.uk/job/?category=6&format=rss", format: "rss", lang: "en", scope: "Funded PhD studentships at Cambridge", checked: C },
  { id: "msca-news", label: "Marie Skłodowska-Curie Actions", url: "https://marie-sklodowska-curie-actions.ec.europa.eu/rss.xml", format: "rss", lang: "en", scope: "MSCA call openings and news, doctoral and postdoctoral", checked: C },
  // Tunisia-facing official sources
  { id: "daad-tunisie", label: "DAAD Tunisie", url: "https://www.daad.tn/fr/feed/", format: "rss", lang: "fr", scope: "Appels DAAD pour la Tunisie et séances d'information", checked: C },
  { id: "us-embassy-tunisia-education", label: "U.S. Embassy in Tunisia: education", url: "https://tn.usembassy.gov/category/education/feed/", format: "rss", lang: "en", scope: "Fulbright, Humphrey and other U.S. exchange calls for Tunisians", checked: C },
  { id: "eu-neighbours-south-opportunities", label: "EU Neighbours South: opportunities", url: "https://south.euneighbours.eu/opportunity/feed/", format: "rss", lang: "en", scope: "EU-funded calls for the Southern Neighbourhood, Tunisia included", checked: C },
];
