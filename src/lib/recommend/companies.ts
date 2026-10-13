// Tunisian employers that take ENIT interns / juniors, by field. Pure data.
// URLs returned 200 on 2026-10-13 (careers page when it exists, else the homepage).
import type { Field } from "./profile-model";

export interface TnCompany {
  name: string;
  url: string;
  fields: Field[];
  /** Where the company is mostly based. */
  city: string;
  /** Public ATS board, when one exists, so the source can be added in one click. */
  source?: { kind: "greenhouse" | "lever" | "ashby"; handle: string };
}

export const TN_COMPANIES: TnCompany[] = [
  { name: "Vermeg", url: "https://www.vermeg.com/careers/", fields: ["software", "web", "business"], city: "Tunis" },
  { name: "Sofrecom Tunisie", url: "https://www.sofrecom.com/", fields: ["software", "telecom", "devops", "networks"], city: "Tunis" },
  { name: "Actia Engineering Services", url: "https://www.actia.com/en/careers", fields: ["embedded", "electrical", "software"], city: "Tunis" },
  { name: "InstaDeep", url: "https://www.instadeep.com/careers/", fields: ["data", "software"], city: "Tunis" },
  { name: "Medius (ex-Expensya)", url: "https://www.expensya.com/", fields: ["web", "software", "mobile"], city: "Tunis" },
  { name: "Proxym", url: "https://www.proxym-group.com/", fields: ["web", "mobile", "software"], city: "Sousse" },
  { name: "Talan Tunisie", url: "https://www.talan.com/", fields: ["software", "data", "devops", "business"], city: "Tunis" },
  { name: "Sopra Steria", url: "https://www.soprasteria.com/careers", fields: ["software", "devops", "business", "web"], city: "Tunis" },
  { name: "Linedata", url: "https://www.linedata.com/careers", fields: ["software", "business", "web"], city: "Tunis" },
  { name: "Focus Corporation", url: "https://www.focus-corporation.com/", fields: ["software", "web", "business"], city: "Tunis" },
  { name: "Wevioo", url: "https://www.wevioo.com/en/careers", fields: ["software", "web", "business", "data"], city: "Tunis" },
  { name: "Medianet", url: "https://www.medianet.tn/", fields: ["web", "mobile", "software"], city: "Tunis" },
  { name: "Datavora", url: "https://www.datavora.com/careers", fields: ["data", "software"], city: "Tunis" },
  { name: "Vneuron", url: "https://www.vneuron.com/", fields: ["software", "data", "business"], city: "Tunis" },
  { name: "Satoripop", url: "https://www.satoripop.com/", fields: ["web", "mobile"], city: "Tunis" },
  { name: "Capgemini Engineering", url: "https://www.capgemini.com/careers/", fields: ["software", "devops", "data", "embedded"], city: "Tunis" },
  { name: "Devoteam", url: "https://www.devoteam.com/careers/", fields: ["devops", "networks", "software"], city: "Tunis" },
  { name: "Cynapsys", url: "https://www.cynapsys.de/en/careers/", fields: ["software", "embedded", "web"], city: "Tunis" },
  { name: "Elektrobit Tunisie", url: "https://www.elektrobit.com/careers/", fields: ["embedded", "software"], city: "Tunis" },
  { name: "KPIT", url: "https://www.kpit.com/careers/", fields: ["embedded", "software", "electrical"], city: "Tunis" },
  { name: "Ardia", url: "https://www.ardia.tn/", fields: ["embedded", "software"], city: "Tunis" },
  { name: "Sagemcom Tunisie", url: "https://www.sagemcom.com/", fields: ["embedded", "telecom", "electrical"], city: "Ben Arous" },
  { name: "Valeo", url: "https://www.valeo.com/en/careers/", fields: ["embedded", "electrical", "mechanical", "industrial"], city: "Ben Arous" },
  { name: "Yazaki", url: "https://www.yazaki-europe.com/careers", fields: ["electrical", "industrial"], city: "Bizerte" },
  { name: "Leoni", url: "https://www.leoni.com/", fields: ["electrical", "industrial", "mechanical"], city: "Sousse" },
  { name: "Dräxlmaier", url: "https://www.draexlmaier.com/", fields: ["electrical", "industrial", "mechanical"], city: "Sousse" },
  { name: "Orange Tunisie", url: "https://www.orange.tn/", fields: ["telecom", "networks", "data", "business"], city: "Tunis" },
  { name: "Tunisie Telecom", url: "https://www.tunisietelecom.tn/", fields: ["telecom", "networks"], city: "Tunis" },
  { name: "Sotetel", url: "https://www.sotetel.tn/", fields: ["telecom", "networks", "electrical"], city: "Tunis" },
  { name: "STEG", url: "https://www.steg.com.tn/", fields: ["electrical", "mechanical", "industrial"], city: "Tunis" },
  { name: "Sotuver", url: "https://www.sotuver.com.tn/", fields: ["industrial", "mechanical"], city: "Zaghouan" },
  { name: "Poulina Group", url: "https://www.poulina.com/", fields: ["industrial", "mechanical", "business", "civil"], city: "Tunis" },
  { name: "BIAT", url: "https://www.biat.com.tn/", fields: ["business", "software", "data"], city: "Tunis" },
  { name: "Attijari Bank", url: "https://www.attijaribank.com.tn/", fields: ["business", "software"], city: "Tunis" },
  { name: "Amen Bank", url: "https://www.amenbank.com.tn/", fields: ["business", "software"], city: "Tunis" },
  { name: "Deloitte Tunisie", url: "https://www.deloitte.com/tn/en/careers.html", fields: ["business", "data"], city: "Tunis" },
  { name: "KPMG Tunisie", url: "https://www.kpmg.com/tn/en/careers.html", fields: ["business"], city: "Tunis" },
  { name: "Ooredoo Tunisie", url: "https://www.ooredoo.tn/", fields: ["telecom", "networks", "data", "business"], city: "Tunis" },
  { name: "Axe Finance", url: "https://www.axefinance.com/careers", fields: ["software", "web", "business"], city: "Tunis" },
  { name: "Primatec Engineering", url: "https://www.primatec.de/", fields: ["embedded", "software", "electrical"], city: "Sfax" },
  { name: "Kromberg & Schubert", url: "https://www.kromberg-schubert.com/", fields: ["electrical", "industrial", "mechanical"], city: "Béja" },
  { name: "Hexabyte", url: "https://www.hexabyte.tn/", fields: ["networks", "telecom", "devops"], city: "Tunis" },
  { name: "Kaoun", url: "https://www.kaoun.com/", fields: ["web", "mobile", "software"], city: "Tunis" },
  { name: "IT Gate Group", url: "https://www.itgate-group.com/", fields: ["software", "business", "web"], city: "Tunis" },
  { name: "COMAR Assurances", url: "https://www.comar.tn/", fields: ["business", "data"], city: "Tunis" },
];
