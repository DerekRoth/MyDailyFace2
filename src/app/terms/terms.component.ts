import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-terms',
  imports: [CommonModule, RouterLink],
  templateUrl: './terms.component.html',
  styleUrl: './terms.component.css'
})
export class TermsComponent {
  lastUpdated = 'January 2025';
  contactEmail = 'roth.derek+mydailyface@gmail.com'; // Replace with your actual email
}
