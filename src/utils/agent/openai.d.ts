import "openai";

declare module "openai/resources/chat/completions" {
  interface ChatCompletionCreateParamsBase {
    thinking?: { type: string };
  }

  interface ChatCompletionMessage {
    reasoning_content?: string | null;
  }

  interface ChatCompletionAssistantMessageParam {
    reasoning_content?: string | null;
  }
}
