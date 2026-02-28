"use client";

import { useState } from "react";
import type {
  CurrentHostSetting,
  HostActionType,
  HostMessage,
} from "@/lib/quiz-types";

type HostCommunicationState = {
  isLoading: boolean;
  error: boolean;
};

type SendActionParams = {
  actionType: HostActionType;
  action: string;
  currentSetting: CurrentHostSetting;
  additionalData?: Record<string, unknown>;
  useAiHost: boolean;
  provider?: "openai" | "anthropic" | "google";
  apiKey?: string;
  onStreamChunk?: (text: string) => void;
};

type UseHostCommunicationProps = {
  conversationHistory: HostMessage[];
  setConversationHistory: React.Dispatch<React.SetStateAction<HostMessage[]>>;
};

export function useHostCommunication({
  conversationHistory,
  setConversationHistory,
}: UseHostCommunicationProps) {
  const [state, setState] = useState<HostCommunicationState>({
    isLoading: false,
    error: false,
  });

  async function sendAction({
    actionType,
    action,
    currentSetting,
    additionalData,
    useAiHost,
    provider,
    apiKey,
    onStreamChunk,
  }: SendActionParams): Promise<string | null> {
    if (!useAiHost) {
      return null;
    }

    setState({ isLoading: true, error: false });

    try {
      const response = await fetch("/api/quiz/host", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          actionType,
          action,
          currentSetting,
          additionalData,
          history: conversationHistory,
          provider,
          apiKey,
        }),
      });

      if (!response.ok || !response.body) {
        setState({ isLoading: false, error: true });
        return null;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        fullText += chunk;
        onStreamChunk?.(fullText);
      }

      const finalText = fullText.trim();
      if (!finalText) {
        setState({ isLoading: false, error: false });
        return null;
      }

      setConversationHistory((prev) => [
        ...prev,
        { role: "user", content: action },
        { role: "assistant", content: finalText },
      ]);

      setState({ isLoading: false, error: false });
      return finalText;
    } catch {
      setState({ isLoading: false, error: true });
      return null;
    }
  }

  return {
    sendAction,
    isLoading: state.isLoading,
    error: state.error,
  };
}
