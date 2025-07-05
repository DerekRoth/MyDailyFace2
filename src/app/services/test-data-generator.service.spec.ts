import { TestBed } from '@angular/core/testing';

import { TestDataGeneratorService } from './test-data-generator.service';

describe('TestDataGeneratorService', () => {
  let service: TestDataGeneratorService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(TestDataGeneratorService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
