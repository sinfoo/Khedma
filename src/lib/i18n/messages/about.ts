import { defineMessages } from "../define";

// Owned by the /about page. Access as t.about2.<key>.
export default defineMessages({
  en: {
    metaTitle: "About",
    metaDescription: "Khedma is an end-of-year project (PFA) by Safwen Bibeni and Mahmoud Abid, first-year computer science engineering students at ENIT.",
    nav: "About",
    kicker: "About Khedma",
    title: "Built by students, for everyone looking for their first job.",
    lede: "Khedma is our end-of-year project (PFA) for the first year of computer science engineering at ENIT. We made it with love and care for the Tunisian community, and for job seekers everywhere.",
    facts: [
      { k: "Project", v: "PFA · 1st year" },
      { k: "Program", v: "Computer science engineering · INFO 2" },
      { k: "School", v: "ENIT · Tunis" },
      { k: "Languages", v: "Français · English" },
    ],
    why: {
      title: "Why Khedma",
      p1: "Finding a first job or an internship is one of the hardest problems young people face today, in Tunisia and around the world. Offers are scattered across dozens of sites, every company asks for a different CV, and most applications get no answer.",
      p2: "Students lose hours copying the same information, guessing what recruiters want, and losing track of where they applied. Khedma puts the whole search in one place and does the repetitive work, so you can spend your energy on the applications that matter.",
      name: "Khedma means \"work\" in Tunisian Arabic.",
    },
    does: {
      title: "What it does",
      items: [
        { t: "Search", d: "Searches LinkedIn and job boards in the countries you choose, then ranks offers for your profile." },
        { t: "Evaluate", d: "Scores each offer against your CV: what matches, what is missing, and whether the posting looks legitimate." },
        { t: "Tailor", d: "Adapts your CV and writes a cover letter for each offer, without inventing anything." },
        { t: "Apply", d: "Prepares form answers and messages, then tracks every application, interview and follow-up." },
        { t: "Practice", d: "Mock interviews with a bilingual question bank, STAR stories and debriefs." },
        { t: "Learn", d: "Shows the skills your target offers ask for, and what to learn next." },
      ],
    },
    values: {
      title: "What we care about",
      items: [
        { t: "Your data stays with you", d: "Everything runs on your computer. No account, no server, no tracking." },
        { t: "Honest by design", d: "The AI never invents experience or skills. You stay the author of every word you send." },
        { t: "You press send", d: "Khedma prepares applications. It never submits them, solves CAPTCHAs or sends emails for you." },
        { t: "Accessible to all", d: "Keyboard navigation, screen readers, AA contrast, reduced motion, French and English." },
      ],
    },
    team: {
      title: "The team",
      lead: "Two first-year computer science engineering students at ENIT, class INFO 2.",
      role: "Co-creator · 1st year INFO 2",
    },
    school: {
      title: "ENIT",
      text: "The École Nationale d'Ingénieurs de Tunis, part of the University of Tunis El Manar, is the oldest engineering school in Tunisia. The end-of-year project (PFA) is where first-year students build a complete project from idea to working product.",
    },
    stack: {
      title: "How it is built",
      lead: "A modern web stack that runs entirely on your machine.",
    },
    open: {
      title: "Open source",
      text: "The code is public. Read it, run it, report a bug or suggest an idea on GitHub.",
      cta: "View on GitHub",
    },
    cta: { title: "Ready to start?", primary: "Open Khedma", secondary: "Read the guide" },
    made: "Made with love in Tunis.",
  },
  fr: {
    metaTitle: "À propos",
    metaDescription: "Khedma est un projet de fin d'année (PFA) réalisé par Safwen Bibeni et Mahmoud Abid, élèves ingénieurs en première année informatique à l'ENIT.",
    nav: "À propos",
    kicker: "À propos de Khedma",
    title: "Conçu par des étudiants, pour tous ceux qui cherchent leur premier emploi.",
    lede: "Khedma est notre projet de fin d'année (PFA) de première année du cycle ingénieur en informatique à l'ENIT. Nous l'avons réalisé avec amour et soin pour la communauté tunisienne, et pour les chercheurs d'emploi du monde entier.",
    facts: [
      { k: "Projet", v: "PFA · 1ère année" },
      { k: "Filière", v: "Génie informatique · INFO 2" },
      { k: "École", v: "ENIT · Tunis" },
      { k: "Langues", v: "Français · English" },
    ],
    why: {
      title: "Pourquoi Khedma",
      p1: "Trouver un premier emploi ou un stage est l'un des problèmes les plus difficiles pour les jeunes aujourd'hui, en Tunisie comme ailleurs. Les offres sont dispersées sur des dizaines de sites, chaque entreprise attend un CV différent, et la plupart des candidatures restent sans réponse.",
      p2: "Les étudiants perdent des heures à recopier les mêmes informations, à deviner ce que veulent les recruteurs et à oublier où ils ont postulé. Khedma réunit toute la recherche au même endroit et fait le travail répétitif, pour que vous gardiez votre énergie pour les candidatures qui comptent.",
      name: "Khedma signifie « travail » en tunisien.",
    },
    does: {
      title: "Ce que fait Khedma",
      items: [
        { t: "Chercher", d: "Interroge LinkedIn et les sites d'emploi des pays que vous choisissez, puis classe les offres selon votre profil." },
        { t: "Évaluer", d: "Note chaque offre par rapport à votre CV : ce qui correspond, ce qui manque, et si l'annonce semble fiable." },
        { t: "Adapter", d: "Adapte votre CV et rédige une lettre de motivation pour chaque offre, sans rien inventer." },
        { t: "Postuler", d: "Prépare les réponses aux formulaires et les messages, puis suit chaque candidature, entretien et relance." },
        { t: "S'entraîner", d: "Entretiens blancs avec une banque de questions bilingue, histoires STAR et débriefs." },
        { t: "Progresser", d: "Montre les compétences demandées par vos offres cibles et ce qu'il faut apprendre ensuite." },
      ],
    },
    values: {
      title: "Nos principes",
      items: [
        { t: "Vos données restent chez vous", d: "Tout fonctionne sur votre ordinateur. Pas de compte, pas de serveur, pas de pistage." },
        { t: "Honnête par conception", d: "L'IA n'invente jamais d'expérience ni de compétence. Vous restez l'auteur de chaque mot envoyé." },
        { t: "C'est vous qui envoyez", d: "Khedma prépare les candidatures. Il ne les soumet jamais, ne résout pas de CAPTCHA et n'envoie pas d'e-mails à votre place." },
        { t: "Accessible à tous", d: "Navigation au clavier, lecteurs d'écran, contraste AA, animations réduites, français et anglais." },
      ],
    },
    team: {
      title: "L'équipe",
      lead: "Deux élèves ingénieurs en première année informatique à l'ENIT, classe INFO 2.",
      role: "Co-créateur · 1ère année INFO 2",
    },
    school: {
      title: "ENIT",
      text: "L'École Nationale d'Ingénieurs de Tunis, membre de l'Université de Tunis El Manar, est la plus ancienne école d'ingénieurs de Tunisie. Le projet de fin d'année (PFA) permet aux élèves de première année de mener un projet complet, de l'idée au produit fonctionnel.",
    },
    stack: {
      title: "Comment c'est construit",
      lead: "Une pile web moderne qui tourne entièrement sur votre machine.",
    },
    open: {
      title: "Code ouvert",
      text: "Le code est public. Lisez-le, lancez-le, signalez un bug ou proposez une idée sur GitHub.",
      cta: "Voir sur GitHub",
    },
    cta: { title: "Prêt à commencer ?", primary: "Ouvrir Khedma", secondary: "Lire le guide" },
    made: "Fait avec amour à Tunis.",
  },
});
