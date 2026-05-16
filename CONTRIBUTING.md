# Contributing to FatSecret MCP Server

Thanks for your interest in contributing! This project provides an MCP server for integrating FatSecret's nutrition API with Claude and other MCP-compatible clients.

## Getting Started

1. Fork the repo
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/fatsecret-mcp-server.git`
3. Install dependencies: `npm install`
4. Create a branch: `git checkout -b feature/your-feature`

## Development

```bash
# Build
npm run build

# Run tests
npm test

# Watch mode for tests
npm run test:watch

# Type check without emitting
npx tsc --noEmit
```

## Before Submitting a PR

- [ ] `npm run build` passes with zero errors
- [ ] `npm test` passes (all tests green)
- [ ] `npx tsc --noEmit` has no type errors
- [ ] New features include tests
- [ ] No hardcoded credentials or secrets in code
- [ ] Commit messages are clear and descriptive

## Code Style

- TypeScript strict mode enabled
- Use `z.object().strict()` for all Zod schemas (no extra fields)
- Prefer `unknown` over `any` where possible
- All public functions must have JSDoc comments
- Tool names use `fatsecret_` prefix with snake_case
- Error messages must pass through `redactSensitive()` before reaching clients

## Adding a New Tool

1. Add the tool registration in `src/index.ts`
2. Follow the existing pattern: Zod schema, annotations, async handler
3. Include `title`, `description` with args/returns docs, and proper annotations
4. Add tests covering success and error cases
5. Update README.md tool table

## Security

- Never log or return OAuth tokens, secrets, or credentials
- All error output must go through `redactSensitive()`
- Input strings must be sanitized with `sanitizeString()`
- Dates must be validated with `validateDate()`
- Rate limiting is enforced in `api-client.ts` — don't bypass it

## Reporting Issues

- Use GitHub Issues
- Include: steps to reproduce, expected vs actual behavior, Node version
- For security vulnerabilities, email yurislender@gmail.com directly (do not open a public issue)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
