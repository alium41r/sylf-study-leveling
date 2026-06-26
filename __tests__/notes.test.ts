import { describe, it, expect, vi } from 'vitest';
import { GET, POST } from '../app/api/notes/route';
import { NextRequest } from 'next/server';

// Mock the Prisma ORM so we don't accidentally write to the real database during tests
vi.mock('@prisma/client', () => {
  const mockPrismaClient = {
    note: {
      findMany: vi.fn().mockResolvedValue([
        { id: 1, title: 'Test Note', content: 'This is a test note', userId: 1, user: { id: 1, name: 'John Doe' } }
      ]),
      create: vi.fn().mockImplementation((args) => Promise.resolve({ id: 2, ...args.data }))
    }
  };
  return {
    PrismaClient: class {
      constructor() {
        return mockPrismaClient;
      }
    }
  };
});

// Mock the adapter since we're mocking the PrismaClient anyway
vi.mock('@prisma/adapter-better-sqlite3', () => ({
  PrismaBetterSqlite3: vi.fn()
}));

describe('Notes API Backend Routes', () => {
  // Test 1: Verifies that the GET route correctly fetches and returns data
  it('GET should return a list of notes with status 200', async () => {
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toHaveLength(1);
    expect(data[0].title).toBe('Test Note');
  });

  // Test 2: Verifies that Zod validation catches missing/invalid data
  it('POST should block creation and return status 400 for invalid data', async () => {
    // Missing 'content' and 'userId' fields
    const req = new NextRequest('http://localhost/api/notes', {
      method: 'POST',
      body: JSON.stringify({ title: 'Incomplete Note' })
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Validation failed');
  });

  // Test 3: Verifies successful creation of a note when valid data is sent
  it('POST should successfully create a note and return status 201', async () => {
    const req = new NextRequest('http://localhost/api/notes', {
      method: 'POST',
      body: JSON.stringify({ title: 'Perfect Note', content: 'It has all fields', userId: 1 })
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.title).toBe('Perfect Note');
    expect(data.content).toBe('It has all fields');
  });
});
