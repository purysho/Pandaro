import { memoryRepository, type Repository } from '../persistence/db';

let current: Repository = memoryRepository();

export function repo(): Repository {
  return current;
}

export function setRepo(next: Repository): void {
  current = next;
}
