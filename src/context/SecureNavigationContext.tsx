import React, { createContext, useContext, useState, useCallback } from 'react';

interface SecureNavigationContextType {
    registerId: (realId: string) => string;
    getRealId: (aliasId: string) => string | undefined;
}

const SecureNavigationContext = createContext<SecureNavigationContextType | undefined>(undefined);

export const SecureNavigationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    // Diccionario interno: { "user-xyz": "2eaa0c08-049e-48c7-b916-367468f11d26" }
    const [idMap, setIdMap] = useState<Record<string, string>>({});

    // Registra un UUID real y retorna un alias seguro
    const registerId = useCallback((realId: string) => {
        // Generamos un alias corto o un hash basado en el tiempo para que cambie constantemente
        const alias = `usr-${btoa(realId).substring(0, 8).toLowerCase()}`;

        setIdMap((prev) => ({
            ...prev,
            [alias]: realId,
        }));

        return alias;
    }, []);

    // Recupera el UUID real usando el alias
    const getRealId = useCallback((aliasId: string) => {
        return idMap[aliasId];
    }, [idMap]);

    return (
        <SecureNavigationContext.Provider value={{ registerId, getRealId }}>
            {children}
        </SecureNavigationContext.Provider>
    );
};

// Hook personalizado para usar el contexto de forma limpia
export const useSecureNavigation = () => {
    const context = useContext(SecureNavigationContext);
    if (!context) {
        throw new Error('useSecureNavigation debe ser usado dentro de un SecureNavigationProvider');
    }
    return context;
};