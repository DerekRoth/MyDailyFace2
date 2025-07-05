import { Injectable } from '@angular/core';
import { CameraService } from './camera.service';
import { IndexedDbService } from './indexed-db.service';

interface FaceVariation {
  skinTone: string;
  eyeColor: string;
  hairColor: string;
  hairStyle: string;
  moodVariation: number; // 0-1 for slight facial expression changes
  ageProgression: number; // 0-1 for subtle aging over time
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
      skinTone: this.pickFromArray(['#FDBCB4', '#EEA086', '#D08B5B', '#AE5D29', '#8B4513'], seed),
      eyeColor: this.pickFromArray(['#8B4513', '#4A5D23', '#2E5266', '#3C4142'], seed + 1),
      hairColor: this.pickFromArray(['#2C1B18', '#8B4513', '#D2B48C', '#FFD700', '#DC143C'], seed + 2),
      hairStyle: this.pickFromArray(['short', 'medium', 'long', 'curly'], seed + 3),
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
    const { skinTone, eyeColor, hairColor, hairStyle, moodVariation, ageProgression } = variation;
    
    // Add subtle variations based on mood and age
    const eyeSize = 8 + (moodVariation * 2);
    const mouthCurve = moodVariation > 0.6 ? 'M80,140 Q100,150 120,140' : moodVariation < 0.3 ? 'M80,140 Q100,135 120,140' : 'M80,140 L120,140';
    const faceWidth = 60 + (ageProgression * 10); // Slight face width increase over time
    const wrinkles = ageProgression > 0.5 ? '<path d="M70,120 Q75,125 80,120" stroke="#999" stroke-width="0.5" fill="none"/><path d="M120,120 Q115,125 120,120" stroke="#999" stroke-width="0.5" fill="none"/>' : '';
    
    // Hair styles
    let hairPath = '';
    switch (hairStyle) {
      case 'short':
        hairPath = `<ellipse cx="100" cy="70" rx="${faceWidth * 0.8}" ry="25" fill="${hairColor}"/>`;
        break;
      case 'medium':
        hairPath = `<ellipse cx="100" cy="65" rx="${faceWidth}" ry="35" fill="${hairColor}"/>`;
        break;
      case 'long':
        hairPath = `<ellipse cx="100" cy="60" rx="${faceWidth * 1.2}" ry="45" fill="${hairColor}"/>`;
        break;
      case 'curly':
        hairPath = `<ellipse cx="100" cy="65" rx="${faceWidth * 0.9}" ry="30" fill="${hairColor}"/>
                   <circle cx="85" cy="65" r="8" fill="${hairColor}"/>
                   <circle cx="115" cy="65" r="8" fill="${hairColor}"/>
                   <circle cx="90" cy="55" r="6" fill="${hairColor}"/>
                   <circle cx="110" cy="55" r="6" fill="${hairColor}"/>`;
        break;
    }
    
    return `
      <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
        <!-- Background -->
        <rect width="200" height="200" fill="#f0f0f0"/>
        
        <!-- Hair -->
        ${hairPath}
        
        <!-- Face -->
        <ellipse cx="100" cy="100" rx="${faceWidth}" ry="70" fill="${skinTone}" stroke="#ddd" stroke-width="2"/>
        
        <!-- Eyes -->
        <ellipse cx="85" cy="90" rx="${eyeSize}" ry="6" fill="white"/>
        <ellipse cx="115" cy="90" rx="${eyeSize}" ry="6" fill="white"/>
        <circle cx="85" cy="90" r="4" fill="${eyeColor}"/>
        <circle cx="115" cy="90" r="4" fill="${eyeColor}"/>
        <circle cx="86" cy="89" r="1.5" fill="white"/>
        <circle cx="116" cy="89" r="1.5" fill="white"/>
        
        <!-- Eyebrows -->
        <path d="M75,80 Q85,75 95,80" stroke="#654321" stroke-width="2" fill="none"/>
        <path d="M105,80 Q115,75 125,80" stroke="#654321" stroke-width="2" fill="none"/>
        
        <!-- Nose -->
        <ellipse cx="100" cy="105" rx="3" ry="8" fill="${this.darkenColor(skinTone, 20)}"/>
        <circle cx="98" cy="108" r="1" fill="${this.darkenColor(skinTone, 40)}"/>
        <circle cx="102" cy="108" r="1" fill="${this.darkenColor(skinTone, 40)}"/>
        
        <!-- Mouth -->
        <path d="${mouthCurve}" stroke="#8B4513" stroke-width="2" fill="none"/>
        
        <!-- Aging lines -->
        ${wrinkles}
        
        <!-- Date watermark (subtle) -->
        <text x="10" y="190" font-family="monospace" font-size="8" fill="#ccc">
          ${date.toISOString().split('T')[0]}
        </text>
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