import { createContext, useContext, type ReactNode } from 'react';
import { useStore, type StoreType } from './useStore';

const StoreContext = createContext<StoreType | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const store = useStore();
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useAppStore(): StoreType {
  const context = useContext(StoreContext);
  if (!context) throw new Error('useAppStore must be used within StoreProvider');
  return context;
}
