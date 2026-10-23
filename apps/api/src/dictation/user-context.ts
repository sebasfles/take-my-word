import type { Language, UserContext, UserContextPick } from "@take-my-word/shared";

const domains: Readonly<Record<UserContextPick, Readonly<Record<Language, string>>>> = {
  "software-development": { en: "software development", es: "desarrollo de software" },
  "data-ai": { en: "data and AI", es: "datos e IA" },
  design: { en: "design", es: "diseño" },
  "product-management": { en: "product management", es: "gestión de producto" },
  marketing: { en: "marketing", es: "marketing" },
  sales: { en: "sales", es: "ventas" },
  "customer-support": { en: "customer support", es: "atención al cliente" },
  "writing-content": { en: "writing and content", es: "redacción y contenido" },
  "research-academia": { en: "research and academia", es: "investigación y academia" },
  "biology-life-sciences": {
    en: "biology and life sciences",
    es: "biología y ciencias de la vida",
  },
  "medicine-health": { en: "medicine and health", es: "medicina y salud" },
  law: { en: "law", es: "derecho" },
  "finance-accounting": { en: "finance and accounting", es: "finanzas y contabilidad" },
  "education-teaching": { en: "education and teaching", es: "educación y docencia" },
  engineering: { en: "engineering", es: "ingeniería" },
  student: { en: "student", es: "estudiante" },
};

export function describeUserContext(context: UserContext, language: Language): string {
  const phrases = context.picks.map((pick) => domains[pick][language]).join(", ");
  const picks = phrases.charAt(0).toUpperCase() + phrases.slice(1);
  return [picks, context.detail].filter((part) => part !== "").join(". ");
}
