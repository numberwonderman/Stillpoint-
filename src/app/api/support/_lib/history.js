/**
 * Conversation normalization helpers.
 *
 * The wire format from the client uses `{ role, text }`.
 * NOPE expects `{ role, content }`.
 * The AI SDK also wants `{ role, content }`.
 * `normalizeHistory` keeps the internal `{ role, text }` shape;
 * the converters below adapt it for each downstream consumer.
 */

import { MAX_HISTORY_MESSAGES } from "./constants";

export function normalizeHistory(rawHistory) {
  if (!Array.isArray(rawHistory)) {
    return [];
  }

  const normalized = [];

  for (const msg of rawHistory) {
    if (
      !msg ||
      typeof msg !== "object" ||
      typeof msg.text !== "string"
    ) {
      continue;
    }

    const text = msg.text.trim();

    if (!text) {
      continue;
    }

    if (
      msg.role !== "user" &&
      msg.role !== "assistant" &&
      msg.role !== "model"
    ) {
      continue;
    }

    normalized.push({
      role:
        msg.role === "assistant" ||
        msg.role === "model"
          ? "assistant"
          : "user",
      text: text.slice(0, 50_000),
    });
  }

  return normalized.slice(-MAX_HISTORY_MESSAGES);
}

export function toAiMessages(conversation) {
  return conversation.map((message) => ({
    role: message.role,
    content: message.text,
  }));
}

export function toNopeMessages(conversation) {
  return conversation.map((message) => ({
    role: message.role,
    content: message.text,
  }));
}

export function hasResources(resources) {
  return (
    Array.isArray(resources) &&
    resources.length > 0
  );
}

export function normalizeResourceQuery(query, fallback) {
  if (
    typeof query === "string" &&
    query.trim()
  ) {
    return query.trim().slice(0, 500);
  }

  return fallback.slice(0, 500);
}
