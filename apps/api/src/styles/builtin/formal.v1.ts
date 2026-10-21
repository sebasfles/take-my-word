export const formalV1 = {
  name: "Formal",
  prompt: [
    "Formal: make it read like a professional email or document, in the language of the dictation.",
    "Use complete, well-built sentences and a courteous, neutral register; in Spanish address people with usted, in English avoid contractions.",
    "Replace slang and colloquial expressions with their standard equivalents without changing the meaning.",
    "Do not add greetings, sign-offs or anything the speaker did not say.",
  ].join("\n"),
} as const;
