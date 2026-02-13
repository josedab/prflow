import { vi } from 'vitest';

// Default mock for @prflow/db so tests don't require a running PostgreSQL instance.
// Individual tests can override with their own vi.mock('@prflow/db', ...) calls.
vi.mock('@prflow/db', async (importOriginal) => {
  const mockQueryRaw = vi.fn().mockResolvedValue([{ '?column?': 1 }]);

  const createMockModel = () => ({
    findUnique: vi.fn().mockResolvedValue(null),
    findFirst: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockImplementation((args: { data: Record<string, unknown> }) => Promise.resolve({ id: 'mock-id', ...args.data })),
    update: vi.fn().mockImplementation((args: { data: Record<string, unknown> }) => Promise.resolve({ id: 'mock-id', ...args.data })),
    upsert: vi.fn().mockImplementation((args: { create: Record<string, unknown> }) => Promise.resolve({ id: 'mock-id', ...args.create })),
    delete: vi.fn().mockResolvedValue({ id: 'mock-id' }),
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    count: vi.fn().mockResolvedValue(0),
    aggregate: vi.fn().mockResolvedValue({}),
  });

  const mockDb = new Proxy({} as Record<string, unknown>, {
    get(target, prop) {
      if (prop === '$queryRaw' || prop === '$queryRawUnsafe') return mockQueryRaw;
      if (prop === '$connect') return vi.fn().mockResolvedValue(undefined);
      if (prop === '$disconnect') return vi.fn().mockResolvedValue(undefined);
      if (prop === '$transaction') return vi.fn().mockImplementation((fn: (tx: unknown) => unknown) => fn(mockDb));
      if (typeof prop === 'string' && !prop.startsWith('$')) {
        if (!target[prop]) {
          target[prop] = createMockModel();
        }
        return target[prop];
      }
      return undefined;
    },
  });

  return {
    db: mockDb,
    prisma: mockDb,
  };
});
