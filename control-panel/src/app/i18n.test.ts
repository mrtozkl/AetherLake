import test from "node:test";
import assert from "node:assert/strict";
import { translations, t, type Locale, type TranslationKey } from "./i18n.ts";

test("i18n - English and Turkish translations must have matching keys", () => {
    const enKeys = Object.keys(translations.en).sort();
    const trKeys = Object.keys(translations.tr).sort();

    const missingInTr = enKeys.filter(key => !(key in translations.tr));
    const missingInEn = trKeys.filter(key => !(key in translations.en));

    assert.deepStrictEqual(
        missingInTr,
        [],
        `Missing Turkish translations for keys: ${missingInTr.join(", ")}`
    );

    assert.deepStrictEqual(
        missingInEn,
        [],
        `Missing English translations for keys: ${missingInEn.join(", ")}`
    );

    assert.strictEqual(
        enKeys.length,
        trKeys.length,
        `Expected equal number of keys in both locales. en: ${enKeys.length}, tr: ${trKeys.length}`
    );
});

test("i18n - Translation values must be non-empty strings", () => {
    const locales: Locale[] = ["en", "tr"];

    for (const locale of locales) {
        const dict = translations[locale];
        for (const [key, value] of Object.entries(dict)) {
            assert.ok(
                typeof value === "string" && value.trim().length > 0,
                `Translation for key "${key}" in locale "${locale}" must not be empty`
            );
        }
    }
});

test("i18n - t() function returns expected translations", () => {
    assert.strictEqual(t("en", "common.signIn"), "Sign In");
    assert.strictEqual(t("tr", "common.signIn"), "Giriş Yap");
    assert.strictEqual(t("en", "nav.overview"), "Overview");
    assert.strictEqual(t("tr", "nav.overview"), "Genel Bakış");
});
