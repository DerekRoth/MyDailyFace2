import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

/**
 * Cross-component capture settings (photo overlay + alignment guides).
 *
 * These used to be synced between the settings and take-picture components via
 * localStorage plus hand-dispatched StorageEvents — but real `storage` events
 * don't fire in the tab that wrote the value, and the listeners leaked on every
 * component re-creation. A shared service with BehaviorSubjects is the pattern
 * this app already uses for the error overlay.
 */
@Injectable({
  providedIn: 'root'
})
export class CaptureSettingsService {
  private overlayOpacitySubject = new BehaviorSubject<number>(this.readNumber('overlayOpacity', 0.5));
  private alignmentGuidesEnabledSubject = new BehaviorSubject<boolean>(
    localStorage.getItem('alignmentOverlayEnabled') === 'true'
  );
  private eyeLinePositionSubject = new BehaviorSubject<number>(this.readNumber('alignmentEyeLinePosition', 40));
  private mouthLinePositionSubject = new BehaviorSubject<number>(this.readNumber('alignmentMouthLinePosition', 70));

  get overlayOpacity$(): Observable<number> {
    return this.overlayOpacitySubject.asObservable();
  }

  get alignmentGuidesEnabled$(): Observable<boolean> {
    return this.alignmentGuidesEnabledSubject.asObservable();
  }

  get eyeLinePosition$(): Observable<number> {
    return this.eyeLinePositionSubject.asObservable();
  }

  get mouthLinePosition$(): Observable<number> {
    return this.mouthLinePositionSubject.asObservable();
  }

  get overlayOpacity(): number {
    return this.overlayOpacitySubject.value;
  }

  get alignmentGuidesEnabled(): boolean {
    return this.alignmentGuidesEnabledSubject.value;
  }

  get eyeLinePosition(): number {
    return this.eyeLinePositionSubject.value;
  }

  get mouthLinePosition(): number {
    return this.mouthLinePositionSubject.value;
  }

  setOverlayOpacity(value: number): void {
    localStorage.setItem('overlayOpacity', value.toString());
    this.overlayOpacitySubject.next(value);
  }

  setAlignmentGuidesEnabled(enabled: boolean): void {
    localStorage.setItem('alignmentOverlayEnabled', enabled.toString());
    this.alignmentGuidesEnabledSubject.next(enabled);
  }

  setAlignmentPositions(eyeLinePosition: number, mouthLinePosition: number): void {
    localStorage.setItem('alignmentEyeLinePosition', eyeLinePosition.toString());
    localStorage.setItem('alignmentMouthLinePosition', mouthLinePosition.toString());
    this.eyeLinePositionSubject.next(eyeLinePosition);
    this.mouthLinePositionSubject.next(mouthLinePosition);
  }

  private readNumber(key: string, fallback: number): number {
    const stored = localStorage.getItem(key);
    const parsed = stored !== null ? parseFloat(stored) : NaN;
    return isNaN(parsed) ? fallback : parsed;
  }
}
