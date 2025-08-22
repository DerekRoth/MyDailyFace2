import { Injectable } from '@angular/core';
import { CameraService } from './camera.service';
import { IndexedDbService } from './indexed-db.service';

interface FaceVariation {
  skinTone: string;
  eyeColor: string;
  hairColor: string;
  hairStyle: string;
  facialHair: string;
  backgroundType: string;
  backgroundColor: string;
  moodVariation: number; // 0-1 for slight facial expression changes
  ageProgression: number; // 0-1 for subtle aging over time
  faceShape: string;
  eyebrowThickness: number;
}

@Injectable({
  providedIn: 'root'
})
export class TestDataGeneratorService {

  constructor(
    private cameraService: CameraService,
    private indexedDbService: IndexedDbService
  ) {
    // Apply stored animation speed on startup
    this.initializeAnimationSpeed();
  }

  private initializeAnimationSpeed(): void {
    const storedSpeed = this.getAnimationSpeed();
    if (storedSpeed !== 1) {
      this.setAnimationSpeed(storedSpeed);
    }
  }

  async generateTestData(): Promise<{ success: number; failed: number }> {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setFullYear(endDate.getFullYear() - 2); // 2 years ago
    
    let success = 0;
    let failed = 0;
    
    // Generate one photo per day for the past 2 years
    const currentDate = new Date(startDate);
    
    while (currentDate <= endDate) {
      try {
        const daysSinceStart = Math.floor((currentDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
        const faceVariation = this.generateFaceVariation(daysSinceStart);
        const svgBlob = await this.generateFaceSVG(faceVariation, currentDate);
        
        if (svgBlob) {
          const id = this.generateId(currentDate);
          await this.indexedDbService.savePhoto(svgBlob, id, new Date(currentDate));
          success++;
        } else {
          failed++;
        }
      } catch (error) {
        console.error('Error generating test photo for', currentDate, error);
        failed++;
      }
      
      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    return { success, failed };
  }

  private generateFaceVariation(dayIndex: number): FaceVariation {
    // Use dayIndex as seed for consistent but varied results
    const seed = dayIndex;
    
    return {
      skinTone: this.pickFromArray(['#FDBCB4', '#EEA086', '#D08B5B', '#AE5D29', '#8B4513', '#F7E7CE', '#E8B894', '#C68642'], seed),
      eyeColor: this.pickFromArray(['#8B4513', '#4A5D23', '#2E5266', '#3C4142', '#228B22', '#000080', '#708090'], seed + 1),
      hairColor: this.pickFromArray(['#2C1B18', '#8B4513', '#D2B48C', '#FFD700', '#DC143C', '#000000', '#654321', '#A0522D', '#C0C0C0'], seed + 2),
      hairStyle: this.pickFromArray(['short', 'medium', 'long', 'curly', 'wavy', 'buzz'], seed + 3),
      facialHair: this.pickFromArray(['none', 'mustache', 'beard', 'goatee', 'stubble'], seed + 4),
      backgroundType: this.pickFromArray(['solid', 'gradient', 'pattern'], seed + 5),
      backgroundColor: this.pickFromArray(['#E6F3FF', '#FFE6E6', '#E6FFE6', '#FFF5E6', '#F0E6FF', '#E6FFFF', '#FFFFE6'], seed + 6),
      faceShape: this.pickFromArray(['oval', 'round', 'square', 'heart'], seed + 7),
      eyebrowThickness: 1 + ((seed + 8) % 3), // 1-3
      moodVariation: ((seed * 7) % 100) / 100, // 0-1 variation
      ageProgression: dayIndex / (365 * 2) // Gradual aging over 2 years
    };
  }

  private pickFromArray<T>(array: T[], seed: number): T {
    return array[seed % array.length];
  }

  private async generateFaceSVG(variation: FaceVariation, date: Date): Promise<Blob | null> {
    try {
      const svg = this.createFaceSVG(variation, date);
      
      // Convert SVG to Blob
      const svgBlob = new Blob([svg], { type: 'image/svg+xml' });
      
      // Convert SVG to PNG for better compatibility
      return await this.svgToImageBlob(svg);
    } catch (error) {
      console.error('Error generating face SVG:', error);
      return null;
    }
  }

  private createFaceSVG(variation: FaceVariation, date: Date): string {
    const { skinTone, eyeColor, hairColor, hairStyle, facialHair, backgroundType, backgroundColor, 
            moodVariation, ageProgression, faceShape, eyebrowThickness } = variation;
    
    // Calculate realistic proportions
    const baseFaceWidth = faceShape === 'round' ? 65 : faceShape === 'square' ? 60 : faceShape === 'heart' ? 58 : 62;
    const faceWidth = baseFaceWidth + (ageProgression * 8);
    const faceHeight = faceShape === 'round' ? 65 : faceShape === 'square' ? 68 : faceShape === 'heart' ? 75 : 70;
    
    // Eye variations
    const eyeSize = 6 + (moodVariation * 3);
    const eyeSpacing = faceWidth * 0.3;
    const leftEyeX = 100 - eyeSpacing;
    const rightEyeX = 100 + eyeSpacing;
    
    // Mood-based expressions
    const irisPosition = moodVariation > 0.7 ? -0.5 : moodVariation < 0.3 ? 0.5 : 0;
    const mouthCurve = moodVariation > 0.6 ? 
      `M${80},${135 + faceHeight * 0.1} Q100,${145 + faceHeight * 0.1} ${120},${135 + faceHeight * 0.1}` : 
      moodVariation < 0.3 ? 
      `M${80},${145 + faceHeight * 0.1} Q100,${135 + faceHeight * 0.1} ${120},${145 + faceHeight * 0.1}` : 
      `M${80},${140 + faceHeight * 0.1} L${120},${140 + faceHeight * 0.1}`;
    
    // Age progression effects
    const wrinkles = ageProgression > 0.4 ? `
      <path d="M${leftEyeX - 15},${85} Q${leftEyeX - 10},${90} ${leftEyeX - 5},${85}" stroke="${this.darkenColor(skinTone, 30)}" stroke-width="0.8" fill="none"/>
      <path d="M${rightEyeX + 5},${85} Q${rightEyeX + 10},${90} ${rightEyeX + 15},${85}" stroke="${this.darkenColor(skinTone, 30)}" stroke-width="0.8" fill="none"/>
      <path d="M85,${120 + faceHeight * 0.1} Q90,${125 + faceHeight * 0.1} 95,${120 + faceHeight * 0.1}" stroke="${this.darkenColor(skinTone, 25)}" stroke-width="0.6" fill="none"/>
      <path d="M105,${120 + faceHeight * 0.1} Q110,${125 + faceHeight * 0.1} 115,${120 + faceHeight * 0.1}" stroke="${this.darkenColor(skinTone, 25)}" stroke-width="0.6" fill="none"/>
    ` : '';
    
    // Background generation
    const background = this.generateBackground(backgroundType, backgroundColor, date);
    
    // Hair generation
    const hair = this.generateHair(hairStyle, hairColor, faceWidth, faceHeight);
    
    // Facial hair generation
    const facialHairSVG = this.generateFacialHair(facialHair, hairColor, faceWidth, faceHeight, ageProgression);
    
    // Face shading for depth
    const faceShading = `
      <defs>
        <radialGradient id="faceGradient${date.getTime()}" cx="0.3" cy="0.3" r="0.8">
          <stop offset="0%" stop-color="${this.lightenColor(skinTone, 15)}"/>
          <stop offset="70%" stop-color="${skinTone}"/>
          <stop offset="100%" stop-color="${this.darkenColor(skinTone, 15)}"/>
        </radialGradient>
        <filter id="faceShadow${date.getTime()}">
          <feDropShadow dx="2" dy="2" stdDeviation="3" flood-opacity="0.3"/>
        </filter>
      </defs>
    `;
    
    return `
      <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
        ${faceShading}
        
        <!-- Background -->
        ${background}
        
        <!-- Hair (behind head) -->
        ${hair}
        
        <!-- Head shadow -->
        <ellipse cx="102" cy="102" rx="${faceWidth}" ry="${faceHeight}" fill="rgba(0,0,0,0.1)"/>
        
        <!-- Face with gradient -->
        <ellipse cx="100" cy="100" rx="${faceWidth}" ry="${faceHeight}" 
                 fill="url(#faceGradient${date.getTime()})" 
                 filter="url(#faceShadow${date.getTime()})"/>
        
        <!-- Face highlight -->
        <ellipse cx="95" cy="95" rx="${faceWidth * 0.3}" ry="${faceHeight * 0.4}" 
                 fill="${this.lightenColor(skinTone, 25)}" opacity="0.3"/>
        
        <!-- Eyes with realistic details -->
        <ellipse cx="${leftEyeX}" cy="90" rx="${eyeSize}" ry="${eyeSize * 0.7}" fill="white"/>
        <ellipse cx="${rightEyeX}" cy="90" rx="${eyeSize}" ry="${eyeSize * 0.7}" fill="white"/>
        
        <!-- Iris and pupils -->
        <circle cx="${leftEyeX + irisPosition}" cy="90" r="${eyeSize * 0.6}" fill="${eyeColor}"/>
        <circle cx="${rightEyeX + irisPosition}" cy="90" r="${eyeSize * 0.6}" fill="${eyeColor}"/>
        <circle cx="${leftEyeX + irisPosition}" cy="90" r="${eyeSize * 0.3}" fill="#000"/>
        <circle cx="${rightEyeX + irisPosition}" cy="90" r="${eyeSize * 0.3}" fill="#000"/>
        
        <!-- Eye highlights -->
        <circle cx="${leftEyeX + irisPosition + 1}" cy="88" r="1.5" fill="white" opacity="0.8"/>
        <circle cx="${rightEyeX + irisPosition + 1}" cy="88" r="1.5" fill="white" opacity="0.8"/>
        
        <!-- Eyebrows -->
        <path d="M${leftEyeX - 12},${78} Q${leftEyeX},${75 - eyebrowThickness} ${leftEyeX + 12},${78}" 
              stroke="${this.darkenColor(hairColor, 20)}" stroke-width="${eyebrowThickness}" fill="none"/>
        <path d="M${rightEyeX - 12},${78} Q${rightEyeX},${75 - eyebrowThickness} ${rightEyeX + 12},${78}" 
              stroke="${this.darkenColor(hairColor, 20)}" stroke-width="${eyebrowThickness}" fill="none"/>
        
        <!-- Nose with shading -->
        <ellipse cx="100" cy="105" rx="4" ry="12" fill="${this.darkenColor(skinTone, 15)}"/>
        <ellipse cx="99" cy="103" rx="2.5" ry="8" fill="${this.lightenColor(skinTone, 10)}"/>
        <ellipse cx="97" cy="110" rx="1.5" ry="2" fill="${this.darkenColor(skinTone, 30)}"/>
        <ellipse cx="103" cy="110" rx="1.5" ry="2" fill="${this.darkenColor(skinTone, 30)}"/>
        
        <!-- Mouth with lips -->
        <path d="${mouthCurve}" stroke="${this.darkenColor(skinTone, 40)}" stroke-width="2" fill="none"/>
        <path d="${mouthCurve}" stroke="#CD5C5C" stroke-width="1.5" fill="none" opacity="0.6"/>
        
        <!-- Facial hair -->
        ${facialHairSVG}
        
        <!-- Aging effects -->
        ${wrinkles}
        
        <!-- Subtle cheek definition -->
        <ellipse cx="75" cy="110" rx="8" ry="15" fill="${this.darkenColor(skinTone, 10)}" opacity="0.3"/>
        <ellipse cx="125" cy="110" rx="8" ry="15" fill="${this.darkenColor(skinTone, 10)}" opacity="0.3"/>
      </svg>
    `;
  }

  private darkenColor(hex: string, percent: number): string {
    const num = parseInt(hex.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = (num >> 16) - amt;
    const G = (num >> 8 & 0x00FF) - amt;
    const B = (num & 0x0000FF) - amt;
    return '#' + (0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 +
      (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 +
      (B < 255 ? B < 1 ? 0 : B : 255)).toString(16).slice(1);
  }

  private lightenColor(hex: string, percent: number): string {
    const num = parseInt(hex.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = (num >> 16) + amt;
    const G = (num >> 8 & 0x00FF) + amt;
    const B = (num & 0x0000FF) + amt;
    return '#' + (0x1000000 + (R > 255 ? 255 : R) * 0x10000 +
      (G > 255 ? 255 : G) * 0x100 +
      (B > 255 ? 255 : B)).toString(16).slice(1);
  }

  private generateBackground(type: string, color: string, date: Date): string {
    const seed = date.getDate() + date.getMonth() * 31;
    
    switch (type) {
      case 'gradient':
        const color2 = this.lightenColor(color, 20);
        const angle = (seed * 45) % 360;
        return `
          <defs>
            <linearGradient id="bgGradient${date.getTime()}" x1="0%" y1="0%" x2="100%" y2="100%" gradientTransform="rotate(${angle})">
              <stop offset="0%" stop-color="${color}"/>
              <stop offset="100%" stop-color="${color2}"/>
            </linearGradient>
          </defs>
          <rect width="200" height="200" fill="url(#bgGradient${date.getTime()})"/>
        `;
      case 'pattern':
        const patternColor = this.darkenColor(color, 15);
        return `
          <defs>
            <pattern id="bgPattern${date.getTime()}" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
              <rect width="20" height="20" fill="${color}"/>
              <circle cx="10" cy="10" r="2" fill="${patternColor}" opacity="0.3"/>
            </pattern>
          </defs>
          <rect width="200" height="200" fill="url(#bgPattern${date.getTime()})"/>
        `;
      default: // solid
        return `<rect width="200" height="200" fill="${color}"/>`;
    }
  }

  private generateHair(style: string, color: string, faceWidth: number, faceHeight: number): string {
    const hairShadow = this.darkenColor(color, 25);
    
    switch (style) {
      case 'short':
        return `
          <ellipse cx="100" cy="65" rx="${faceWidth * 0.85}" ry="20" fill="${color}"/>
          <ellipse cx="100" cy="60" rx="${faceWidth * 0.7}" ry="15" fill="${hairShadow}"/>
        `;
      case 'medium':
        return `
          <ellipse cx="100" cy="60" rx="${faceWidth * 1.1}" ry="30" fill="${color}"/>
          <ellipse cx="100" cy="55" rx="${faceWidth * 0.9}" ry="25" fill="${hairShadow}"/>
        `;
      case 'long':
        return `
          <ellipse cx="100" cy="55" rx="${faceWidth * 1.3}" ry="40" fill="${color}"/>
          <ellipse cx="100" cy="50" rx="${faceWidth * 1.1}" ry="35" fill="${hairShadow}"/>
          <ellipse cx="85" cy="85" rx="12" ry="25" fill="${color}"/>
          <ellipse cx="115" cy="85" rx="12" ry="25" fill="${color}"/>
        `;
      case 'curly':
        return `
          <ellipse cx="100" cy="60" rx="${faceWidth * 0.95}" ry="25" fill="${color}"/>
          <circle cx="80" cy="60" r="8" fill="${color}"/>
          <circle cx="120" cy="60" r="8" fill="${color}"/>
          <circle cx="85" cy="50" r="6" fill="${color}"/>
          <circle cx="115" cy="50" r="6" fill="${color}"/>
          <circle cx="100" cy="45" r="7" fill="${color}"/>
        `;
      case 'wavy':
        return `
          <path d="M${100 - faceWidth * 1.2},65 Q${100 - faceWidth * 0.6},50 100,60 Q${100 + faceWidth * 0.6},50 ${100 + faceWidth * 1.2},65 Q${100 + faceWidth * 0.8},75 100,70 Q${100 - faceWidth * 0.8},75 ${100 - faceWidth * 1.2},65 Z" 
                fill="${color}"/>
          <path d="M${100 - faceWidth * 1.0},60 Q${100 - faceWidth * 0.4},45 100,55 Q${100 + faceWidth * 0.4},45 ${100 + faceWidth * 1.0},60" 
                stroke="${hairShadow}" stroke-width="3" fill="none"/>
        `;
      case 'buzz':
        return `
          <ellipse cx="100" cy="70" rx="${faceWidth * 0.75}" ry="15" fill="${color}" opacity="0.7"/>
          <ellipse cx="100" cy="65" rx="${faceWidth * 0.6}" ry="10" fill="${hairShadow}" opacity="0.5"/>
        `;
      default:
        return `<ellipse cx="100" cy="65" rx="${faceWidth * 0.9}" ry="25" fill="${color}"/>`;
    }
  }

  private generateFacialHair(type: string, hairColor: string, faceWidth: number, faceHeight: number, ageProgression: number): string {
    const facialHairColor = this.darkenColor(hairColor, 10);
    const density = 0.7 + (ageProgression * 0.3); // Thicker with age
    
    switch (type) {
      case 'mustache':
        return `
          <ellipse cx="100" cy="118" rx="15" ry="3" fill="${facialHairColor}" opacity="${density}"/>
          <ellipse cx="100" cy="117" rx="12" ry="2" fill="${this.darkenColor(facialHairColor, 20)}" opacity="${density * 0.8}"/>
        `;
      case 'beard':
        return `
          <ellipse cx="100" cy="135" rx="${faceWidth * 0.8}" ry="25" fill="${facialHairColor}" opacity="${density}"/>
          <ellipse cx="100" cy="132" rx="${faceWidth * 0.6}" ry="20" fill="${this.darkenColor(facialHairColor, 15)}" opacity="${density * 0.9}"/>
          <ellipse cx="100" cy="118" rx="15" ry="3" fill="${facialHairColor}" opacity="${density}"/>
        `;
      case 'goatee':
        return `
          <ellipse cx="100" cy="130" rx="12" ry="15" fill="${facialHairColor}" opacity="${density}"/>
          <ellipse cx="100" cy="127" rx="8" ry="12" fill="${this.darkenColor(facialHairColor, 20)}" opacity="${density * 0.8}"/>
        `;
      case 'stubble':
        return `
          <ellipse cx="100" cy="125" rx="${faceWidth * 0.7}" ry="20" fill="${facialHairColor}" opacity="${density * 0.4}"/>
          <ellipse cx="100" cy="118" rx="12" ry="2" fill="${facialHairColor}" opacity="${density * 0.5}"/>
        `;
      default: // none
        return '';
    }
  }

  private async svgToImageBlob(svgString: string): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }
      
      canvas.width = 200;
      canvas.height = 200;
      
      const img = new Image();
      
      img.onload = () => {
        ctx.drawImage(img, 0, 0);
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Could not create blob from canvas'));
          }
        }, 'image/jpeg', 0.8);
      };
      
      img.onerror = () => reject(new Error('Could not load SVG as image'));
      
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(svgBlob);
      img.src = url;
      
      // Clean up URL after use
      img.addEventListener('load', () => URL.revokeObjectURL(url));
    });
  }

  private generateId(date: Date): string {
    return `test_${date.getFullYear()}_${(date.getMonth() + 1).toString().padStart(2, '0')}_${date.getDate().toString().padStart(2, '0')}_${date.getTime().toString(36)}`;
  }

  async clearTestData(): Promise<void> {
    const photos = await this.indexedDbService.getAllPhotos();
    const testPhotos = photos.filter(photo => photo.id.startsWith('test_'));
    
    for (const photo of testPhotos) {
      await this.indexedDbService.deletePhoto(photo.id);
    }
  }

  // Animation debugging
  setAnimationSpeed(multiplier: number): void {
    // Apply CSS custom property to slow down all transitions and animations
    document.documentElement.style.setProperty('--animation-speed-multiplier', multiplier.toString());
    
    // Store preference
    localStorage.setItem('debugAnimationSpeed', multiplier.toString());
  }

  getAnimationSpeed(): number {
    const stored = localStorage.getItem('debugAnimationSpeed');
    return stored ? parseFloat(stored) : 1;
  }

  resetAnimationSpeed(): void {
    document.documentElement.style.removeProperty('--animation-speed-multiplier');
    localStorage.removeItem('debugAnimationSpeed');
  }

  // Helper method to get timing adjusted for debug speed
  getAdjustedTimeout(baseTimeoutMs: number): number {
    const multiplier = this.getAnimationSpeed();
    return Math.round(baseTimeoutMs * multiplier);
  }
}