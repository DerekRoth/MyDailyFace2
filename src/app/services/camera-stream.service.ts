import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class CameraStreamService {
  private stream: MediaStream | null = null;

  async getStream(): Promise<MediaStream> {
    if (this.stream && this.stream.getTracks().length > 0) {
      // Re-enable existing tracks
      this.stream.getTracks().forEach(track => track.enabled = true);
      return this.stream;
    }

    // Request new camera access
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user' },
      audio: false
    });

    return this.stream;
  }

  pauseStream(): void {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.enabled = false);
    }
  }

  stopStream(): void {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
  }

  hasStream(): boolean {
    return this.stream !== null && this.stream.getTracks().length > 0;
  }
}