export const userKey = (userId: string) => `USER#${userId}`;
export const quotaKey = (day: string) => `QUOTA#${day}`;
export const settingsKey = "SETTINGS";

export const dictationPrefix = "DICTATION#";
export const dictationKey = (createdAt: string, requestId: string) =>
  `${dictationPrefix}${createdAt}#${requestId}`;
export const dictationRetentionSeconds = 90 * 86_400;

export const termPrefix = "DICT#";
export const termKey = (normalizedTerm: string) => `${termPrefix}${normalizedTerm}`;

export const stylePrefix = "STYLE#";
export const styleKey = (styleId: string) => `${stylePrefix}${styleId}`;

export const appRulePrefix = "APPRULE#";
export const appRuleKey = (appId: string) => `${appRulePrefix}${appId}`;
