// Study fields and levels read from free text (a CV, a feed item). Word lists in French and English, on norm() text.
// Words that scholarship pages use for something else ("health insurance", "higher education", "these") are left out.
import type { StudyField, StudyLevel } from "./types";
import { norm } from "./model";

const FIELD_WORDS: Record<StudyField, RegExp> = {
  "computer-science": /\b(informatique|computer|computing|software|logiciels?|developer|developpeu(r|se)|programming|programmation|python|javascript|typescript|react|sql|data (science|engineer\w*|analy\w+)|machine learning|deep learning|intelligence artificielle|artificial intelligence|ia|cybersecur\w+|cloud|devops|backend|frontend|full[- ]?stack|reseaux|networks?|telecom\w*|ict)\b/g,
  engineering: /\b(ingenieurs?|ingenierie|engineering|engineers?|mecanique|mechanical|electri(que|cal)|electroni(que|cs)|genie civil|industriel(le)?|industrial|automati(que|on)|roboti(que|cs)|energeti(que|cs)|energy|energie|materiaux|materials|aeronauti\w+|aerospace|embarque\w*|embedded|mecatroni\w+|genie chimique|technology|technologies?)\b/g,
  mathematics: /\b(mathemati\w+|maths?|statisti\w+|actuari\w+|recherche operationnelle|operations research|probabilit\w+)\b/g,
  "natural-sciences": /\b(physi(que|cs)|chimie|chemistry|biolog(ie|y)|geolog(ie|y)|biotechnolog\w+|biochimie|biochemistry|natural sciences?|sciences? naturelles?|life sciences?|sciences de la vie|astronom\w+)\b/g,
  "medicine-health": /\b(medecine|medicine|medical (school|studies|sciences?)|pharma\w+|infirmi\w+|nursing|dentaire|dental|biomedical|(public|global) health|health sciences?|sante publique|sciences de la sante)\b/g,
  "agriculture-environment": /\b(agronom\w+|agricult\w+|environnement\w*|environment\w*|climat\w*|climate|water|hydrau\w+|forest\w*|ecolog\w+|agroalimentaire|food science|sustainab\w+|developpement durable)\b/g,
  "architecture-urban": /\b(urbanisme|urban (planning|design|studies)|architecte d'interieur|ecole d'architecture|school of architecture|architectural|landscape|paysag\w+)\b/g,
  "business-economics": /\b(gestion|management|marketing|finance|economie|economics?|comptab\w+|accounting|commerce|business|mba|audit|entrepreneur\w*)\b/g,
  law: /\b(droit|law|juridique|juriste|llm|human rights|droits de l'homme)\b/g,
  "social-sciences": /\b(sociolog\w+|psycholog\w+|sciences? politiques?|political science|international relations|relations internationales|anthropolog\w+|geographi\w+|social sciences?|sciences sociales|public policy|development studies|journalis\w+)\b/g,
  humanities: /\b(litterature|literature|histoire|history|philosoph\w+|linguisti\w+|humanities|humanites|sciences humaines|traduction|translation|theolog\w+|archeolog\w+|archaeolog\w+)\b/g,
  "arts-design": /\b(design graphique|graphic design|beaux-arts|fine arts|visual arts|performing arts|arts plastiques|cinema|film|musi(que|c)|illustration|photograph\w+|fashion)\b/g,
  education: /\b(teacher training|formation des enseignants|teaching degree|pedagog\w+|sciences de l'education|education sciences?|didacti\w+)\b/g,
};

/** How many different words of each field appear in `text`. */
export function fieldHits(text: string): Partial<Record<StudyField, number>> {
  const t = norm(text);
  const out: Partial<Record<StudyField, number>> = {};
  for (const [field, re] of Object.entries(FIELD_WORDS) as [StudyField, RegExp][]) {
    const n = new Set(t.match(re) ?? []).size;
    if (n) out[field] = n;
  }
  return out;
}

const LEVEL_WORDS: [StudyLevel, RegExp][] = [
  ["licence", /\b(licence|bachelors?|undergraduates?|bsc|b\.sc|l[123]|first[- ]cycle|premier cycle)\b/],
  ["master", /\b(masters?|mastere|msc|m\.sc|mba|llm|m[12]|postgraduates?|graduate (students?|studies|school|program\w*|degrees?))\b/],
  ["doctorat", /\b(ph\.?d|doctora(l|le|t|te|ux)|doctorant\w*|dphil|these (de|en|cifre)|(en|une|de) these)\b/],
  ["postdoc", /\bpost[- ]?doc\w*/],
  ["recherche", /\b(research (stays?|visits?|fellowships?|grants?)|visiting (researchers?|scholars?|fellows?|professors?)|sejours? de recherche|sejours? scientifiques?|chercheurs? (invites?|confirmes?))\b/],
  ["court", /\b(summer schools?|winter schools?|ecoles? d'ete|exchange|echange|semester abroad|short[- ]term|short courses?|courte duree|training courses?|language courses?|cours de langue)\b/],
];

/** Study levels named in `text`, in catalogue order. "Post-doctoral" is a postdoc, never a doctorate. */
export function levelsIn(text: string): StudyLevel[] {
  const t = norm(text);
  const rest = t.replace(/post[- ]?doc\w*/g, " ");
  return LEVEL_WORDS.filter(([l, re]) => re.test(l === "postdoc" ? t : rest)).map(([l]) => l);
}
