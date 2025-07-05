import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TakePictureComponent } from './take-picture.component';

describe('TakePictureComponent', () => {
  let component: TakePictureComponent;
  let fixture: ComponentFixture<TakePictureComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TakePictureComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TakePictureComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
