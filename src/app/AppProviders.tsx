import React from "react";
import { I18nProvider } from "@/shared/i18n";
import { AlertProvider, ContextMenuProvider, TooltipProvider } from "@/shared/ui";

export const AppProviders: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <I18nProvider>
    <TooltipProvider>
      <AlertProvider>
        <ContextMenuProvider>{children}</ContextMenuProvider>
      </AlertProvider>
    </TooltipProvider>
  </I18nProvider>
);
