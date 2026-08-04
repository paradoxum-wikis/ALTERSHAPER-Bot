import "openai";

declare module "openai/resources/chat/completions" {
  interface ChatCompletionCreateParamsBase {
    thinking?: { type: "enabled" | "disabled" };
  }

  interface ChatCompletionMessage {
    reasoning_content?: string | null;
  }

  interface ChatCompletionAssistantMessageParam {
    reasoning_content?: string | null;
  }
}
