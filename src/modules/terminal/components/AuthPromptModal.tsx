import React from "react";
import type {
  SftpAuthPromptEventDto,
  SftpHostKeyPromptEventDto,
} from "@/modules/sftp";
import type {
  SessionAuthPromptEventDto,
  SessionHostKeyPromptEventDto,
} from "../types";
import { HostKeyPromptModal } from "./HostKeyPromptModal";
import { SecretPromptModal } from "./SecretPromptModal";

interface AuthPromptModalProps {
  authPrompt: SessionAuthPromptEventDto | SftpAuthPromptEventDto | null;
  authPromptSource?: "pty" | "sftp";
  hostKeyPrompt: SessionHostKeyPromptEventDto | SftpHostKeyPromptEventDto | null;
  hostKeyPromptSource?: "pty" | "sftp";
  onCloseAuth: () => void;
  onCloseHostKey: () => void;
  onReconnectTab: (tabId: string) => void;
}

export const AuthPromptModal: React.FC<AuthPromptModalProps> = ({
  authPrompt,
  authPromptSource = "pty",
  hostKeyPrompt,
  hostKeyPromptSource = "pty",
  onCloseAuth,
  onCloseHostKey,
  onReconnectTab,
}) => {
  if (hostKeyPrompt) {
    return (
      <HostKeyPromptModal
        prompt={hostKeyPrompt}
        source={hostKeyPromptSource}
        onClose={onCloseHostKey}
        onReconnectTab={onReconnectTab}
      />
    );
  }

  return (
    <SecretPromptModal
      prompt={authPrompt}
      source={authPromptSource}
      onClose={onCloseAuth}
    />
  );
};
