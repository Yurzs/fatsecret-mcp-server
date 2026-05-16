# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x     | Yes       |

## Reporting a Vulnerability

If you discover a security vulnerability, please **do not** open a public GitHub issue.

Instead, email **yurislender@gmail.com** with:

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

You will receive a response within 72 hours. We will work with you to understand and address the issue before any public disclosure.

## Security Measures in This Project

- All OAuth tokens and API secrets are stored in environment variables, never in code
- Error messages are sanitized via `redactSensitive()` to prevent credential leakage
- Input strings are sanitized to strip control characters and enforce length limits
- Rate limiting prevents API quota exhaustion (30/min burst, 4,500/day)
- CI pipeline includes `npm audit` and secret-scanning checks
- Dependencies are kept minimal to reduce attack surface
