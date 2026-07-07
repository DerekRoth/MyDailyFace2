import { LocaleService } from './locale.service';

describe('LocaleService', () => {
  let service: LocaleService;

  beforeEach(() => {
    localStorage.removeItem('selected-language');
    service = new LocaleService();
  });

  afterEach(() => {
    localStorage.removeItem('selected-language');
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('falls back to the key itself for unknown translations', () => {
    expect(service.getTranslation('nonexistent.key')).toBe('nonexistent.key');
  });

  it('has the exact same translation keys in every language', () => {
    const table = (service as any).buildTranslations() as Record<string, Record<string, string>>;
    const languages = Object.keys(table);
    expect(languages).toContain('en');

    const englishKeys = Object.keys(table['en']).sort();
    expect(englishKeys.length).toBeGreaterThan(0);

    for (const language of languages) {
      const keys = Object.keys(table[language]).sort();
      expect(keys)
        .withContext(`language '${language}' must have the same keys as 'en'`)
        .toEqual(englishKeys);
    }
  });

  it('switches languages and notifies subscribers', () => {
    const seen: string[] = [];
    const subscription = service.currentLanguage$.subscribe(lang => seen.push(lang));

    service.setLanguage('fr');
    expect(service.currentLanguage).toBe('fr');
    expect(service.getTranslation('nav.take_picture')).not.toBe('nav.take_picture');
    expect(seen).toContain('fr');

    subscription.unsubscribe();
  });
});
