// Course providers whose catalog is not open to apps (no API or feed, or reading is blocked): Khedma lists them
// and opens their own search in the student's browser. Pure and client-safe.
import type { CertKind, FieldKey } from "./model";

export interface Provider {
  name: string;
  /** Home page, opened when the student has typed no search. */
  url: string;
  /** Their search for the student's words; {q} is replaced. */
  search?: string;
  fields: FieldKey[];
  cost: "free" | "paid" | "mixed";
  cert: CertKind;
}

/** Display names of the fetched catalogs (sources.ts). */
export const SOURCE_NAMES: Record<string, string> = {
  microsoft: "Microsoft Learn",
  funmooc: "FUN-MOOC",
  mit: "MIT Learn",
  edx: "edX",
  skillsboost: "Google Cloud Skills Boost",
  alison: "Alison",
  codecademy: "Codecademy",
  trailhead: "Trailhead",
  freecodecamp: "freeCodeCamp",
  odin: "The Odin Project",
  deeplearning: "DeepLearning.AI",
  unity: "Unity Learn",
  netacad: "Cisco Networking Academy",
  hubspot: "HubSpot Academy",
  edraak: "Edraak",
  rwaq: "Rwaq",
  duolingo: "Duolingo",
  coupons: "Udemy free coupons",
};

// Checked 2026-10-26: each one either has no open catalog, blocks automated reading, or forbids it in robots.txt.
export const DIRECTORY: Provider[] = [
  // Premium vendors: paid exams and certificates employers recognise, often with free learning paths.
  { name: "NVIDIA Deep Learning Institute", url: "https://www.nvidia.com/en-us/training/", search: "https://www.nvidia.com/en-us/training/find-training/?search={q}", fields: ["ai", "data"], cost: "mixed", cert: "paid" },
  { name: "AWS Skill Builder", url: "https://skillbuilder.aws", search: "https://skillbuilder.aws/search?searchText={q}", fields: ["cloud", "ai", "security"], cost: "mixed", cert: "proctored" },
  { name: "Oracle MyLearn", url: "https://mylearn.oracle.com", search: "https://mylearn.oracle.com/ou/search?keyword={q}", fields: ["cloud", "data"], cost: "mixed", cert: "proctored" },
  { name: "IBM SkillsBuild", url: "https://skillsbuild.org", search: "https://skillsbuild.org/learning-catalog?search={q}", fields: ["ai", "data", "security", "soft"], cost: "free", cert: "completion" },
  { name: "Coursera (Google, Meta, IBM certificates)", url: "https://www.coursera.org", search: "https://www.coursera.org/search?query={q}", fields: ["programming", "data", "business", "ux", "ai", "languages"], cost: "mixed", cert: "paid" },
  { name: "Grow with Google certificates", url: "https://grow.google/certificates/", fields: ["data", "ux", "security", "business"], cost: "paid", cert: "paid" },
  { name: "Google Skillshop", url: "https://skillshop.exceedlms.com/student/catalog", search: "https://skillshop.exceedlms.com/student/catalog/list?search={q}", fields: ["business"], cost: "free", cert: "completion" },
  { name: "SolidWorks (CSWA, CSWP)", url: "https://my.solidworks.com/training", fields: ["engineering"], cost: "paid", cert: "proctored" },
  { name: "Autodesk Learning", url: "https://www.autodesk.com/learn", search: "https://www.autodesk.com/learn/search?query={q}", fields: ["engineering", "design", "gamedev"], cost: "free", cert: "completion" },
  { name: "MATLAB Onramp", url: "https://matlabacademy.mathworks.com/", fields: ["engineering", "science", "data"], cost: "free", cert: "completion" },
  { name: "Interaction Design Foundation", url: "https://www.interaction-design.org/courses", fields: ["ux", "design"], cost: "paid", cert: "paid" },
  // Big platforms, free and paid.
  { name: "Udemy", url: "https://www.udemy.com", search: "https://www.udemy.com/courses/search/?q={q}", fields: ["programming", "design", "business", "languages", "gamedev", "ai"], cost: "mixed", cert: "completion" },
  { name: "edX", url: "https://www.edx.org", search: "https://www.edx.org/search?q={q}", fields: ["programming", "data", "business", "science", "engineering"], cost: "mixed", cert: "paid" },
  { name: "FutureLearn", url: "https://www.futurelearn.com", search: "https://www.futurelearn.com/search?q={q}", fields: ["business", "science", "languages", "soft"], cost: "mixed", cert: "paid" },
  { name: "OpenClassrooms", url: "https://openclassrooms.com/fr/", search: "https://openclassrooms.com/fr/search?query={q}", fields: ["programming", "web", "data", "business"], cost: "mixed", cert: "paid" },
  { name: "OpenLearn (Open University)", url: "https://www.open.edu/openlearn/", search: "https://www.open.edu/openlearn/search-results?q={q}", fields: ["science", "languages", "business", "engineering"], cost: "free", cert: "completion" },
  { name: "LinkedIn Learning", url: "https://www.linkedin.com/learning", search: "https://www.linkedin.com/learning/search?keywords={q}", fields: ["business", "design", "programming", "soft"], cost: "paid", cert: "completion" },
  { name: "NPTEL / SWAYAM", url: "https://nptel.ac.in", search: "https://nptel.ac.in/courses?searchText={q}", fields: ["engineering", "science", "programming"], cost: "free", cert: "proctored" },
  { name: "Khan Academy", url: "https://www.khanacademy.org", search: "https://www.khanacademy.org/search?page_search_query={q}", fields: ["science", "programming", "finance"], cost: "free", cert: "none" },
  { name: "Saylor Academy", url: "https://learn.saylor.org", search: "https://learn.saylor.org/course/search.php?search={q}", fields: ["business", "science", "programming", "languages"], cost: "free", cert: "completion" },
  // AI and machine learning, free.
  { name: "Kaggle Learn", url: "https://www.kaggle.com/learn", fields: ["data", "ai"], cost: "free", cert: "completion" },
  { name: "Hugging Face Learn", url: "https://huggingface.co/learn", fields: ["ai"], cost: "free", cert: "completion" },
  { name: "fast.ai", url: "https://course.fast.ai", fields: ["ai"], cost: "free", cert: "none" },
  { name: "Google Machine Learning Crash Course", url: "https://developers.google.com/machine-learning/crash-course", fields: ["ai"], cost: "free", cert: "none" },
  { name: "Elements of AI", url: "https://www.elementsofai.com", fields: ["ai"], cost: "free", cert: "completion" },
  { name: "Harvard CS50", url: "https://cs50.harvard.edu", fields: ["programming", "ai", "web"], cost: "free", cert: "completion" },
  // Design, 3D and game dev.
  { name: "Canva Design School", url: "https://www.canva.com/designschool/courses/", fields: ["design"], cost: "free", cert: "none" },
  { name: "Adobe tutorials", url: "https://helpx.adobe.com/learning.html", search: "https://helpx.adobe.com/search.html?q={q}", fields: ["design", "ux"], cost: "free", cert: "none" },
  { name: "Unreal Engine learning", url: "https://dev.epicgames.com/community/unreal-engine/learning", search: "https://dev.epicgames.com/community/search?query={q}", fields: ["gamedev"], cost: "free", cert: "none" },
  { name: "Godot documentation and tutorials", url: "https://docs.godotengine.org/en/stable/", search: "https://docs.godotengine.org/en/stable/search.html?q={q}", fields: ["gamedev"], cost: "free", cert: "none" },
  { name: "Blender Studio", url: "https://studio.blender.org/training/", fields: ["gamedev", "design"], cost: "paid", cert: "none" },
  // Languages.
  { name: "TV5Monde Apprendre le français", url: "https://apprendre.tv5monde.com/fr", fields: ["languages"], cost: "free", cert: "none" },
  { name: "BBC Learning English", url: "https://www.bbc.co.uk/learningenglish", fields: ["languages"], cost: "free", cert: "none" },
  { name: "British Council LearnEnglish", url: "https://learnenglish.britishcouncil.org", fields: ["languages"], cost: "mixed", cert: "proctored" },
  { name: "Goethe-Institut", url: "https://www.goethe.de/en/spr/kup.html", fields: ["languages"], cost: "mixed", cert: "proctored" },
  { name: "Busuu", url: "https://www.busuu.com", fields: ["languages"], cost: "mixed", cert: "completion" },
  // Business and marketing.
  { name: "Semrush Academy", url: "https://www.semrush.com/academy/courses/", fields: ["business"], cost: "free", cert: "completion" },
  // Careers in the region.
  { name: "Manara (MENA tech careers, free AWS cohorts)", url: "https://manara.tech/individuals", fields: ["cloud", "ai", "soft"], cost: "free", cert: "completion" },
];

/** A provider's link for these words: its search when it has one, else its home page. */
export const providerLink = (p: Provider, q: string) => (p.search && q.trim() ? p.search.replace("{q}", encodeURIComponent(q.trim())) : p.url);
