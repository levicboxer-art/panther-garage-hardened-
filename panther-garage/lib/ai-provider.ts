export function aiConfig() {
  return {
    apiKey: process.env.OPENAI_API_KEY || process.env.AI_API_KEY || "",
    baseUrl: process.env.OPENAI_API_BASE || process.env.AI_BASE_URL || "https://api.openai.com/v1",
    model: process.env.AI_MODEL || "gpt-4o-mini",
  };
}
