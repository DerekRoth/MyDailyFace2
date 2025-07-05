import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BrowsePicturesComponent } from './browse-pictures.component';

describe('BrowsePicturesComponent', () => {
  let component: BrowsePicturesComponent;
  let fixture: ComponentFixture<BrowsePicturesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BrowsePicturesComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(BrowsePicturesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
