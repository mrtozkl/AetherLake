"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { type Locale, t as translate, type TranslationKey } from "./i18n";

interface LocaleContextType {
    locale: Locale;
    setLocale: (l: Locale) => void;
    t: (key: TranslationKey) => string;
}

const LocaleContext = createContext<LocaleContextType>({
    locale: "en",
    setLocale: () => {},
    t: (key) => key,
});

export function LocaleProvider({ children }: { children: ReactNode }) {
    const [locale, setLocaleState] = useState<Locale>("en");

    useEffect(() => {
        const saved = localStorage.getItem("aetherlake-locale") as Locale | null;
        if (saved === "en" || saved === "tr") {
            setLocaleState(saved);
        }
    }, []);

    const setLocale = (l: Locale) => {
        setLocaleState(l);
        localStorage.setItem("aetherlake-locale", l);
    };

    const t = (key: TranslationKey) => translate(locale, key);

    return (
        <LocaleContext.Provider value={{ locale, setLocale, t }}>
            {children}
        </LocaleContext.Provider>
    );
}

export function useLocale() {
    return useContext(LocaleContext);
}
