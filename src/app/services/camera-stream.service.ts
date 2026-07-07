import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class CameraStreamService {
  // How long a paused stream may keep the camera claimed before it is fully
  // stopped. Short enough that the OS camera indicator goes off soon after
  // leaving the camera tab, long enough that quick tab-switching resumes fast.
  private readonly IDLE_STOP_DELAY = 30000;

  private stream: MediaStream | null = null;
  private idleStopTimeout: number | null = null;

  async getStream(): Promise<MediaStream> {
    this.cancelIdleStop();

    if (this.stream && this.stream.getTracks().some(track => track.readyState === 'live')) {
      // Re-enable existing tracks
      this.stream.getTracks().forEach(track => track.enabled = true);
      return this.stream;
    }

    // Request new camera access (also covers streams whose tracks have ended)
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user' },
      audio: false
    });

    return this.stream;
  }

  pauseStream(): void {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.enabled = false);
      // Release the hardware if the user doesn't come back soon — a merely
      // disabled track keeps the camera claimed (LED / privacy indicator on)
      this.cancelIdleStop();
      this.idleStopTimeout = window.setTimeout(() => this.stopStream(), this.IDLE_STOP_DELAY);
    }
  }

  stopStream(): void {
    this.cancelIdleStop();
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
  }

  hasStream(): boolean {
    return this.stream !== null && this.stream.getTracks().some(track => track.readyState === 'live');
  }

  private cancelIdleStop(): void {
    if (this.idleStopTimeout !== null) {
      clearTimeout(this.idleStopTimeout);
      this.idleStopTimeout = null;
    }
  }
}
