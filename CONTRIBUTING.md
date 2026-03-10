# Contributing to Transcribedd

Thank you for your interest in contributing to Transcribedd! This document provides guidelines and instructions for contributing.

## 🎯 Ways to Contribute

- **Report bugs** - Submit detailed bug reports
- **Suggest features** - Propose new features or improvements
- **Write code** - Fix bugs or implement features
- **Improve docs** - Enhance documentation and examples
- **Test** - Help test new features and report issues

## 🚀 Getting Started

### 1. Fork and Clone

```bash
# Fork the repository on GitHub
# Then clone your fork
git clone https://github.com/YOUR-USERNAME/transcribedd.git
cd transcribedd
```

### 2. Set Up Development Environment

```bash
# Run setup script
./scripts/setup/init-dev.sh

# Or manually:
# Install dependencies
cd web-app/backend && npm install
cd ../frontend && npm install
cd ../../shared && npm install

# Copy environment files
cp web-app/backend/.env.example web-app/backend/.env
cp web-app/frontend/.env.example web-app/frontend/.env

# Configure your Azure credentials and API keys
# Edit the .env files
```

### 3. Create a Branch

```bash
# Create a feature branch
git checkout -b feature/your-feature-name

# Or a bug fix branch
git checkout -b fix/bug-description
```

## 📝 Development Workflow

### Making Changes

1. **Write Code**
   - Follow the code style guidelines below
   - Add tests for new functionality
   - Update documentation as needed

2. **Test Locally**
   ```bash
   # Run tests
   npm test
   
   # Run linter
   npm run lint
   
   # Type check (TypeScript)
   npm run type-check
   ```

3. **Commit Changes**
   ```bash
   git add .
   git commit -m "feat: add podcast search caching"
   ```

### Commit Message Format

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

**Examples:**
```
feat(api): add podcast search caching
fix(ui): correct job status display
docs(readme): update installation instructions
test(backend): add job service tests
```

### Pull Request Process

1. **Push to Your Fork**
   ```bash
   git push origin feature/your-feature-name
   ```

2. **Create Pull Request**
   - Go to GitHub and create a PR
   - Fill out the PR template
   - Link any related issues

3. **Code Review**
   - Respond to feedback
   - Make requested changes
   - Push updates to your branch

4. **Merge**
   - Once approved, a maintainer will merge
   - Delete your branch after merge

## 💻 Code Style Guidelines

### TypeScript/JavaScript

```typescript
// Use TypeScript for type safety
interface Job {
  id: string;
  status: JobStatus;
}

// Use async/await over promises
async function fetchJobs(): Promise<Job[]> {
  const response = await api.get('/jobs');
  return response.data;
}

// Use meaningful variable names
const transcriptionJob = await createJob(episodeUrl);

// Add JSDoc comments for complex functions
/**
 * Transcribes an audio file using Whisper
 * @param audioPath - Path to the audio file
 * @param model - Whisper model to use
 * @returns Transcript text
 */
async function transcribe(audioPath: string, model: WhisperModel): Promise<string> {
  // ...
}
```

### React Components

```typescript
// Use functional components with TypeScript
interface PodcastCardProps {
  podcast: Podcast;
  onSelect: (id: string) => void;
}

export const PodcastCard: React.FC<PodcastCardProps> = ({ podcast, onSelect }) => {
  return (
    <div onClick={() => onSelect(podcast.id)}>
      <h3>{podcast.title}</h3>
    </div>
  );
};
```

### Swift (macOS App)

```swift
// Use meaningful names
struct TranscriptionJob {
    let id: String
    let audioURL: URL
    var status: JobStatus
}

// Use async/await for asynchronous operations
func fetchJobs() async throws -> [TranscriptionJob] {
    let url = URL(string: "\(apiEndpoint)/jobs")!
    let (data, _) = try await URLSession.shared.data(from: url)
    return try JSONDecoder().decode([TranscriptionJob].self, from: data)
}

// Add documentation comments
/// Downloads an audio file from the specified URL
/// - Parameter url: The URL of the audio file
/// - Returns: The local file URL where the audio was saved
func downloadAudio(from url: URL) async throws -> URL {
    // ...
}
```

### General Guidelines

- **DRY**: Don't Repeat Yourself
- **KISS**: Keep It Simple, Stupid
- **YAGNI**: You Aren't Gonna Need It
- **Test your code**: Write unit and integration tests
- **Document**: Add comments for complex logic
- **Error handling**: Handle errors gracefully

## 🧪 Testing Guidelines

### Backend Tests

```typescript
// Use Jest for testing
describe('JobService', () => {
  it('should create a new job', async () => {
    const job = await jobService.create({
      userId: 'user123',
      episodeUrl: 'https://...'
    });
    
    expect(job.status).toBe(JobStatus.PENDING);
    expect(job.id).toBeDefined();
  });
});
```

### Frontend Tests

```typescript
// Use React Testing Library
import { render, screen } from '@testing-library/react';

test('renders podcast card', () => {
  const podcast = { title: 'Test Podcast' };
  render(<PodcastCard podcast={podcast} />);
  
  expect(screen.getByText('Test Podcast')).toBeInTheDocument();
});
```

### Run Tests

```bash
# All tests
npm test

# Watch mode
npm test -- --watch

# Coverage
npm test -- --coverage
```

## 📚 Documentation

- Update relevant README files
- Add JSDoc/TSDoc comments
- Update API documentation
- Include examples for new features

## 🐛 Bug Reports

When reporting bugs, include:

1. **Description**: Clear description of the bug
2. **Steps to Reproduce**: Detailed steps
3. **Expected Behavior**: What should happen
4. **Actual Behavior**: What actually happens
5. **Environment**:
   - OS and version
   - Node.js version
   - Browser (if applicable)
6. **Screenshots**: If applicable
7. **Logs**: Relevant error logs

Use the bug report template when creating an issue.

## 💡 Feature Requests

When requesting features:

1. **Problem**: What problem does this solve?
2. **Solution**: Proposed solution
3. **Alternatives**: Alternative solutions considered
4. **Additional Context**: Any other relevant info

## 🔍 Code Review Checklist

Before requesting review:

- [ ] Code follows style guidelines
- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] No console.logs or debug code
- [ ] All tests pass
- [ ] No linting errors
- [ ] Commit messages follow convention
- [ ] PR description is clear

## 🏗️ Project Structure

```
transcribedd/
├── docs/              # Documentation
│   └── plan/         # Planning documents
├── web-app/          # Web application
│   ├── backend/      # API server
│   └── frontend/     # React app
├── mac-app/          # macOS desktop app
├── shared/           # Shared code/types
├── scripts/          # Utility scripts
└── README.md
```

## 📞 Getting Help

- **Documentation**: Check [docs/](docs/) folder
- **Discussions**: Use GitHub Discussions for questions
- **Issues**: Check existing issues before creating new ones
- **Discord/Slack**: (Coming soon)

## 📜 License

By contributing, you agree that your contributions will be licensed under the same license as the project (see LICENSE file).

## 🙏 Thank You!

Your contributions make this project better for everyone. Thank you for taking the time to contribute!

---

## Quick Reference Commands

```bash
# Development
npm run dev                  # Start dev server
npm test                     # Run tests
npm run lint                 # Run linter
npm run type-check          # TypeScript check

# Build
npm run build               # Build for production

# Database
./scripts/db/migrate.sh     # Run migrations
./scripts/db/seed.sh        # Seed database

# Deployment (requires Azure credentials)
./scripts/deploy/deploy-backend.sh
./scripts/deploy/deploy-frontend.sh
```

## Code of Conduct

Be respectful, inclusive, and professional. Harassment and discrimination will not be tolerated.
