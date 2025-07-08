import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-privacy',
  imports: [CommonModule, RouterLink],
  templateUrl: './privacy.component.html',
  styleUrl: './privacy.component.css'
})
export class PrivacyComponent {
  lastUpdated = 'January 2025';
  contactEmail = 'roth.derek+mydailyface@gmail.com'; // Replace with your actual email
}
