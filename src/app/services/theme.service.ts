import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type ThemePreference = 'light' | 'dark' | 'system';
export type Theme = 'light' | 'dark';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private readonly STORAGE_KEY = 'theme-preference';
  private readonly preferenceSubject = new BehaviorSubject<ThemePreference>('system');
  private readonly themeSubject = new BehaviorSubject<Theme>('light');

  public readonly preference$ = this.preferenceSubject.asObservable();
  public readonly theme$ = this.themeSubject.asObservable();

  constructor() {
    this.loadPreference();
    this.setupSystemThemeListener();
    this.applyInitialTheme();
  }

  setPreference(preference: ThemePreference): void {
    this.preferenceSubject.next(preference);
    localStorage.setItem(this.STORAGE_KEY, preference);
    this.updateTheme();
  }

  getCurrentPreference(): ThemePreference {
    return this.preferenceSubject.value;
  }

  getCurrentTheme(): Theme {
    return this.themeSubject.value;
  }

  private loadPreference(): void {
    const saved = localStorage.getItem(this.STORAGE_KEY) as ThemePreference;
    if (saved && ['light', 'dark', 'system'].includes(saved)) {
      this.preferenceSubject.next(saved);
    }
  }

  private setupSystemThemeListener(): void {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', () => {
      if (this.getCurrentPreference() === 'system') {
        this.updateTheme();
      }
    });
  }

  private applyInitialTheme(): void {
    this.updateTheme();
  }

  private updateTheme(): void {
    const preference = this.getCurrentPreference();
    let theme: Theme;

    if (preference === 'system') {
      theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } else {
      theme = preference;
    }

    this.themeSubject.next(theme);
    this.applyThemeToDocument(theme);
  }

  private applyThemeToDocument(theme: Theme): void {
    document.documentElement.setAttribute('data-theme', theme);
  }
}