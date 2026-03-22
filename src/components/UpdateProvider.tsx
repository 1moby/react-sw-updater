import React, { createContext, useContext } from 'react';
import {
  useUpdateChecker,
  type UpdateCheckerOptions,
  type UpdateCheckerResult,
} from '../hooks/useUpdateChecker';

const UpdateContext = createContext<UpdateCheckerResult | null>(null);

export interface UpdateProviderProps extends UpdateCheckerOptions {
  children: React.ReactNode;
}

export function UpdateProvider({
  children,
  ...options
}: UpdateProviderProps) {
  const checker = useUpdateChecker(options);

  return (
    <UpdateContext.Provider value={checker}>{children}</UpdateContext.Provider>
  );
}

export function useUpdateContext(): UpdateCheckerResult {
  const ctx = useContext(UpdateContext);
  if (!ctx) {
    throw new Error(
      'useUpdateContext must be used within an <UpdateProvider>',
    );
  }
  return ctx;
}
