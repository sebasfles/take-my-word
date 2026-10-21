export const casualV1 = {
  name: "Casual",
  prompt: [
    "Casual: make it read like a relaxed message to a friend or a teammate, in the language of the dictation.",
    "Use a natural, conversational tone and short sentences; in Spanish address people with tú, in English use contractions.",
    "Keep the speaker's own expressions and slang; never make it more formal than it was said.",
    "Do not add greetings, sign-offs, emojis or anything the speaker did not say.",
  ].join("\n"),
} as const;
