export const userKey = (userId: string) => `USER#${userId}`;
export const quotaKey = (day: string) => `QUOTA#${day}`;
export const dictationKey = (createdAt: string, requestId: string) =>
  `DICTATION#${createdAt}#${requestId}`;

export const dictationRetentionSeconds = 90 * 86_400;
