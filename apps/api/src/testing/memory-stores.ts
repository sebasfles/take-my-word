import type { Settings } from "@take-my-word/shared";
import type { AppRuleRecord, AppRuleStore } from "../app-rules/store.ts";
import type { DictionaryStore, TermRecord } from "../dictionary/store.ts";
import type { DictationEntry, HistoryStore } from "../history/store.ts";
import type { SettingsStore } from "../settings/store.ts";
import type { StyleRecord, StyleStore } from "../styles/store.ts";

class Partitions<T> {
  private readonly users = new Map<string, Map<string, T>>();

  of(userId: string): Map<string, T> {
    let partition = this.users.get(userId);
    if (!partition) {
      partition = new Map();
      this.users.set(userId, partition);
    }
    return partition;
  }
}

export function memoryStores() {
  const terms = new Partitions<TermRecord>();
  const styleItems = new Partitions<StyleRecord>();
  const rules = new Partitions<AppRuleRecord>();
  const settingsItems = new Map<string, Settings>();
  const dictations = new Partitions<DictationEntry>();
  const expiries = new Partitions<number>();

  const dictionary: DictionaryStore = {
    list: (userId) => Promise.resolve([...terms.of(userId).values()]),
    count: (userId) => Promise.resolve(terms.of(userId).size),
    add(userId, record) {
      const partition = terms.of(userId);
      if (partition.has(record.key)) return Promise.resolve(false);
      partition.set(record.key, record);
      return Promise.resolve(true);
    },
    updateAliases(userId, key, aliases) {
      const partition = terms.of(userId);
      const current = partition.get(key);
      if (!current) return Promise.resolve(undefined);
      const updated = { ...current, aliases };
      partition.set(key, updated);
      return Promise.resolve(updated);
    },
    remove: (userId, key) => Promise.resolve(terms.of(userId).delete(key)),
  };

  const styles: StyleStore = {
    list: (userId) => Promise.resolve([...styleItems.of(userId).values()]),
    get: (userId, id) => Promise.resolve(styleItems.of(userId).get(id)),
    count: (userId) => Promise.resolve(styleItems.of(userId).size),
    create(userId, record) {
      styleItems.of(userId).set(record.id, record);
      return Promise.resolve();
    },
    update(userId, id, input) {
      const partition = styleItems.of(userId);
      const current = partition.get(id);
      if (!current) return Promise.resolve(undefined);
      const updated = { ...current, ...input };
      partition.set(id, updated);
      return Promise.resolve(updated);
    },
    remove: (userId, id) => Promise.resolve(styleItems.of(userId).delete(id)),
  };

  const appRules: AppRuleStore = {
    list: (userId) => Promise.resolve([...rules.of(userId).values()]),
    count: (userId) => Promise.resolve(rules.of(userId).size),
    create(userId, rule) {
      const partition = rules.of(userId);
      if (partition.has(rule.appId)) return Promise.resolve(false);
      partition.set(rule.appId, rule);
      return Promise.resolve(true);
    },
    update(userId, appId, { styleId, keystroke }) {
      const partition = rules.of(userId);
      if (!partition.has(appId)) return Promise.resolve(undefined);
      const updated: AppRuleRecord = {
        appId,
        ...(styleId !== undefined && { styleId }),
        keystroke,
      };
      partition.set(appId, updated);
      return Promise.resolve(updated);
    },
    remove: (userId, appId) => Promise.resolve(rules.of(userId).delete(appId)),
    detachStyle(userId, appId, styleId) {
      const partition = rules.of(userId);
      const current = partition.get(appId);
      if (current?.styleId === styleId) {
        partition.set(appId, { appId, keystroke: current.keystroke });
      }
      return Promise.resolve();
    },
  };

  const settings: SettingsStore = {
    get: (userId) => Promise.resolve(settingsItems.get(userId)),
    create(userId, value) {
      const current = settingsItems.get(userId);
      if (current) return Promise.resolve(current);
      settingsItems.set(userId, value);
      return Promise.resolve(value);
    },
    put(userId, value) {
      settingsItems.set(userId, value);
      return Promise.resolve();
    },
    resetDefaultStyle(userId, styleId, to) {
      const current = settingsItems.get(userId);
      if (current?.defaultStyleId === styleId) {
        settingsItems.set(userId, { ...current, defaultStyleId: to });
      }
      return Promise.resolve();
    },
  };

  const history: HistoryStore = {
    page(userId, { limit, after, now }) {
      const sorted = [...dictations.of(userId).values()]
        .filter((entry) => (expiries.of(userId).get(entry.sk) ?? 0) > now.getTime() / 1000)
        .sort((a, b) => b.sk.localeCompare(a.sk))
        .filter((entry) => after === undefined || entry.sk < after);
      const entries = sorted.slice(0, limit);
      const last = sorted.length > limit ? entries.at(-1)?.sk : undefined;
      return Promise.resolve({ entries, ...(last !== undefined && { last }) });
    },
    remove: (userId, sk) => Promise.resolve(dictations.of(userId).delete(sk)),
  };

  return {
    dictionary,
    styles,
    appRules,
    settings,
    history,
    seedDictation(userId: string, entry: DictationEntry, expiresAt: number) {
      dictations.of(userId).set(entry.sk, entry);
      expiries.of(userId).set(entry.sk, expiresAt);
    },
  };
}
