# Frontend — Transcribedd

React + TypeScript web application for podcast transcription.

## Tech Stack

- **React 19** with TypeScript
- **Vite** for build tooling
- **Tailwind CSS v4** for styling
- **React Router v7** for routing
- **React Query (TanStack Query)** for data fetching
- **Supabase JS** for backend integration

## Getting Started

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Run linter
npm run lint
```

## Testing

Comprehensive test suite with unit, integration, and E2E tests.

### Quick Start

```bash
# Run all unit/integration tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run tests with coverage
npm run test:coverage

# Run E2E tests
npm run test:e2e

# Run E2E tests in UI mode
npm run test:e2e:ui
```

### Test Structure

- **Unit Tests**: Components and hooks (`src/**/*.test.{ts,tsx}`)
- **Integration Tests**: Pages and user flows (`src/pages/*.test.tsx`)
- **E2E Tests**: Full application flows (`e2e/*.spec.ts`)

### Documentation

- [TESTING.md](./TESTING.md) - Complete testing guide
- [TESTING_SUMMARY.md](./TESTING_SUMMARY.md) - Implementation overview
- [e2e/README.md](./e2e/README.md) - E2E test setup

### Coverage

Current test coverage: ~50+ tests covering:
- ✅ Authentication flow
- ✅ Job management
- ✅ Component interactions
- ✅ Hook behavior
- ✅ Error handling

## Project Structure

```
src/
├── components/       # Reusable UI components
├── hooks/           # Custom React hooks
├── pages/           # Page components
├── lib/             # Utilities and configuration
├── types/           # TypeScript type definitions
└── test/            # Test utilities and mocks
    ├── mocks/       # Mock data and services
    └── utils/       # Test helpers
```

## Environment Variables

Create a `.env.local` file:

```bash
VITE_SUPABASE_URL=your-supabase-url
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

## Key Features

- User authentication (sign in)
- Podcast search via Podcast Index
- Job creation and tracking
- Real-time job status updates
- Transcript download
- Worker token management

## Development Guidelines

- Use TypeScript strict mode
- Follow React hooks best practices
- Use Tailwind CSS for all styling
- Implement proper error handling
- Write tests for new features
- Keep components focused and reusable

## Resources

- [React Documentation](https://react.dev/)
- [Vite Documentation](https://vite.dev/)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [Supabase Documentation](https://supabase.com/docs)
- [React Query Documentation](https://tanstack.com/query/latest)
