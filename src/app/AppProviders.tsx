import React from "react";
import { I18nProvider } from "@/shared/i18n";
import { AlertProvider, ContextMenuProvider } from "@/shared/ui";

export const AppProviders: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <I18nProvider>
    <AlertProvider>
      <ContextMenuProvider>{children}</ContextMenuProvider>
    </AlertProvider>
  </I18nProvider>
);
