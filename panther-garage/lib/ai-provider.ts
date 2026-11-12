import "server-only";

export type AIProvider = "huggingface" | "deepseek" | "none";

export function aiConfig() {
  const huggingFaceKey = process.env.HUGGINGFACE_API_KEY || "";
  const deepseekKey = process.env.DEEPSEEK_API_KEY || "";
  const useHuggingFace = Boolean(huggingFaceKey);
  const apiKey = useHuggingFace ? huggingFaceKey : deepseekKey;
  const provider: AIProvider = useHuggingFace
    ? "huggingface"
    : deepseekKey
      ? "deepseek"
      : "none";

  return {
    apiKey,
    baseUrl: (
      useHuggingFace
        ? process.env.HUGGINGFACE_BASE_URL || "https://router.huggingface.co/v1"
        : process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com"
    ).replace(/\/+$/, ""),
    model: useHuggingFace
      ? process.env.HUGGINGFACE_MODEL || "Qwen/Qwen3.8-27B"
      : process.env.DEEPSEEK_MODEL || "deepseek-flash",
    provider,
    configured: Boolean(apiKey),
  };
}
