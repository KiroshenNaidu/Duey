'use client';

import React, { ReactNode, useMemo } from 'react';
import { initializeFirebase } from './index';
import { FirebaseProvider, setFirebaseInstances } from './provider';

export function FirebaseClientProvider({ children }: { children: ReactNode }) {
  const { app, firestore, auth } = useMemo(() => {
    const instances = initializeFirebase();
    setFirebaseInstances(instances.app, instances.firestore, instances.auth);
    return instances;
  }, []);

  return (
    <FirebaseProvider app={app} firestore={firestore} auth={auth}>
      {children}
    </FirebaseProvider>
  );
}
