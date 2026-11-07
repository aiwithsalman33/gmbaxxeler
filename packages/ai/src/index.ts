import { postPrompt, replyPrompt, type PostInput, type ReplyInput } from "./prompts";

export * from "./prompts";

const API = "https://api.openai.com/v1";
const MAX_OUTPUT_TOKENS = 300;
const MAX_POST_TOKENS = 1200;

export const DEFAULT_VISION_MODEL = "gpt-4o-mini";

export interface RenameInput {
  image: Buffer;
  mime: string;
  businessName: string;
  service: string | null;
  city: string | null;
  originalName: string;
}

export interface AiUsageInfo {
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export interface RenameResult extends AiUsageInfo {
  name: string;
}

export interface AiResult extends AiUsageInfo {
  text: string;
}

export interface PostRequest extends PostInput {
  image: Buffer;
  mime: string;
}

export interface AiClient {
  renameImage(input: RenameInput): Promise<RenameResult>;
  generatePost(input: PostRequest): Promise<AiResult>;
  generateReply(input: ReplyInput): Promise<AiResult>;
}

const CTA_LABELS: Record<string, string> = { LEARN_MORE: "Learn more", BOOK: "Book", ORDER: "Order", SHOP: "Shop", SIGN_UP: "Sign up", CALL: "Call" };

export function aiLabelForCta(type: string): string {
  return CTA_LABELS[type] ?? "Learn more";
}

export function renamePrompt(input: Omit<RenameInput, "image" | "mime">): string {
  return [
    "Write one SEO-friendly filename for this photo on a Google Business Profile.",
    "Describe what the photo actually shows, and use lowercase words separated by hyphens.",
    "Use 4 to 8 words with no file extension. Reply with the filename only.",
    `Business: ${input.businessName}`,
    input.service ? `Service: ${input.service}` : null,
    input.city ? `City: ${input.city}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export class OpenAiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "OpenAiError";
  }
}

async function failure(response: Response): Promise<OpenAiError> {
  const body = (await response.json().catch(() => null)) as { error?: { code?: string } } | null;
  return new OpenAiError(response.status, `OpenAI returned ${response.status}${body?.error?.code ? ` (${body.error.code})` : ""}`);
}

export class OpenAiClient implements AiClient {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly http: typeof fetch = fetch,
  ) {}

  private async complete(content: unknown, maxTokens: number): Promise<AiResult> {
    const response = await this.http(`${API}/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ model: this.model, max_completion_tokens: maxTokens, messages: [{ role: "user", content }] }),
    });
    if (!response.ok) throw await failure(response);
    const body = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const text = body.choices?.[0]?.message?.content?.trim();
    if (!text) throw new OpenAiError(502, "OpenAI returned no text");
    return { text, model: this.model, inputTokens: body.usage?.prompt_tokens ?? 0, outputTokens: body.usage?.completion_tokens ?? 0 };
  }

  // Images go inline, because Google-facing URLs can be private in development.
  private imagePart(image: Buffer, mime: string, detail: "low" | "auto") {
    return { type: "image_url", image_url: { url: `data:${mime};base64,${image.toString("base64")}`, detail } };
  }

  async renameImage(input: RenameInput): Promise<RenameResult> {
    const { text, ...usage } = await this.complete([{ type: "text", text: renamePrompt(input) }, this.imagePart(input.image, input.mime, "low")], MAX_OUTPUT_TOKENS);
    return { name: text, ...usage };
  }

  generatePost(input: PostRequest): Promise<AiResult> {
    return this.complete([{ type: "text", text: postPrompt(input) }, this.imagePart(input.image, input.mime, "auto")], MAX_POST_TOKENS);
  }

  generateReply(input: ReplyInput): Promise<AiResult> {
    return this.complete(replyPrompt(input), MAX_OUTPUT_TOKENS);
  }
}

export async function listModels(apiKey: string, http: typeof fetch = fetch): Promise<string[]> {
  const response = await http(`${API}/models`, { headers: { authorization: `Bearer ${apiKey}` } });
  if (!response.ok) throw await failure(response);
  const body = (await response.json()) as { data?: { id: string }[] };
  return (body.data ?? []).map((model) => model.id).filter((id) => /^(gpt|o\d|chatgpt)/.test(id)).sort();
}

/** Used with AI_ADAPTER=mock, so the flow can be demoed without a key. */
export class MockAiClient implements AiClient {
  async renameImage(input: RenameInput): Promise<RenameResult> {
    const parts = [input.businessName, input.service, input.city, input.originalName.replace(/\.\w+$/, "")];
    return { name: parts.filter(Boolean).join(" "), model: "mock", inputTokens: 120, outputTokens: 12 };
  }

  async generatePost({ knowledge, recentPosts, ctaLabel }: PostRequest): Promise<AiResult> {
    const area = knowledge.targetAreas[0] ?? "your area";
    const service = knowledge.services[0] ?? "our services";
    const sentence = `Customers across ${area} choose ${knowledge.businessName} for ${service} because every visit is handled with care, clear advice and attention to detail. `;
    const text = `Update ${recentPosts.length + 1} from ${knowledge.businessName} in ${area}. ${sentence.repeat(6)}Tap ${ctaLabel} to see what we can do for you.`;
    return { text, model: "mock", inputTokens: 400, outputTokens: 220 };
  }

  async generateReply({ reviewerName, rating }: ReplyInput): Promise<AiResult> {
    const text = rating <= 3
      ? `Hi ${reviewerName}, we're sorry your visit fell short. Please contact us so we can put this right.`
      : `Thank you so much, ${reviewerName}! It means a lot to our team, and we look forward to seeing you again.`;
    return { text, model: "mock", inputTokens: 200, outputTokens: 30 };
  }
}
