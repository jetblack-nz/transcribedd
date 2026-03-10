# Shared Code

Shared TypeScript types, utilities, and constants used across the web application and potentially the Electron macOS app (if chosen).

## Purpose

This folder contains code that is imported by multiple parts of the application:
- **Frontend** (React app)
- **Backend** (Express API)
- **macOS App** (if using Electron/TypeScript)

## Structure

```
shared/
├── types/
│   ├── job.ts          # Job-related types
│   ├── user.ts         # User-related types
│   ├── podcast.ts      # Podcast data types
│   └── api.ts          # API request/response types
├── constants/
│   ├── config.ts       # Shared configuration
│   ├── status.ts       # Job status constants
│   └── errors.ts       # Error codes and messages
├── utils/
│   ├── validation.ts   # Input validation utilities
│   ├── formatting.ts   # Text formatting helpers
│   └── time.ts         # Time/duration utilities
└── schemas/
    └── validation.ts   # Zod or Joi schemas
```

## Usage

### In Backend
```typescript
import { Job, JobStatus } from '@transcribedd/shared/types';
import { validateEmail } from '@transcribedd/shared/utils';
```

### In Frontend
```typescript
import type { Job, User } from '@transcribedd/shared/types';
import { JOB_STATUS } from '@transcribedd/shared/constants';
```

## Setup

Add to `package.json` in both frontend and backend:

```json
{
  "dependencies": {
    "@transcribedd/shared": "file:../shared"
  }
}
```

Or use npm workspaces (recommended):

Root `package.json`:
```json
{
  "name": "transcribedd-monorepo",
  "workspaces": [
    "web-app/frontend",
    "web-app/backend",
    "shared"
  ]
}
```

## TypeScript Configuration

`shared/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "declaration": true,
    "outDir": "./dist",
    "strict": true,
    "esModuleInterop": true
  },
  "include": ["**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

## Building

```bash
cd shared
npm run build
```

## Example Types

### Job Type
```typescript
// types/job.ts
export enum JobStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

export interface Job {
  id: string;
  userId: string;
  podcastTitle: string;
  episodeTitle: string;
  episodeUrl: string;
  audioFileUrl?: string;
  transcriptUrl?: string;
  status: JobStatus;
  createdAt: Date;
  completedAt?: Date;
  errorMessage?: string;
}
```

### API Response Types
```typescript
// types/api.ts
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
```

## Best Practices

1. **Type-only imports**: Use `import type` when possible
2. **No side effects**: Shared code should be pure
3. **Tree-shakeable**: Export individual functions, not defaults
4. **Documented**: Add JSDoc comments for complex types
5. **Validated**: Use Zod or similar for runtime validation

## Development

When developing shared code:
1. Make changes in `/shared`
2. Rebuild: `npm run build`
3. Changes automatically reflect in frontend/backend (with workspaces)

## Testing

```bash
cd shared
npm test
```

## Contributing

When adding new shared code:
- Add TypeScript types for all exports
- Write unit tests
- Update this README
- Keep dependencies minimal
