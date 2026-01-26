# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

We take security vulnerabilities seriously. If you discover a security issue, please report it responsibly.

### How to Report

**Please do NOT report security vulnerabilities through public GitHub issues.**

Instead, please use [GitHub Security Advisories](https://github.com/josedab/prflow/security/advisories/new) to report vulnerabilities privately.

Include the following information in your report:

1. **Description** - A clear description of the vulnerability
2. **Steps to Reproduce** - Detailed steps to reproduce the issue
3. **Impact** - What an attacker could achieve by exploiting this vulnerability
4. **Affected Versions** - Which versions are affected
5. **Suggested Fix** - If you have a suggested fix, please include it

### What to Expect

- **Acknowledgment**: We will acknowledge receipt of your report within 48 hours
- **Updates**: We will provide updates on the status of your report within 7 days
- **Resolution**: We aim to resolve critical vulnerabilities within 30 days
- **Credit**: We will credit you in our security advisories (unless you prefer to remain anonymous)

### Scope

The following are in scope for security reports:

- PRFlow API (`apps/api`)
- PRFlow Web Dashboard (`apps/web`)
- PRFlow GitHub Action (`apps/action`)
- PRFlow VS Code Extension (`extensions/vscode-prflow`)
- All packages in `packages/`

### Out of Scope

- Vulnerabilities in dependencies (please report these to the upstream project)
- Issues that require physical access to the server
- Social engineering attacks
- Denial of service attacks

## Security Best Practices

When deploying PRFlow, ensure you follow these security practices:

### Environment Variables

- **Never commit `.env` files** to version control
- Use strong, unique values for `JWT_SECRET` (minimum 32 characters)
- Use strong, unique values for `SESSION_SECRET` (minimum 32 characters)
- Rotate secrets periodically

### GitHub App

- Keep your GitHub App private key secure
- Use webhook secrets to validate incoming webhooks
- Grant minimal required permissions to the GitHub App

### Production Deployment

- Always use HTTPS in production
- Configure proper CORS origins
- Enable rate limiting
- Use a reverse proxy (nginx, Caddy) with security headers
- Keep all dependencies up to date

### Database

- Use strong database passwords
- Restrict database network access
- Enable SSL/TLS for database connections
- Regularly backup your database

## Security Features

PRFlow includes built-in security features:

- **Secret Detection**: Automatically detects hardcoded secrets in code reviews
- **SQL Injection Detection**: Flags potential SQL injection vulnerabilities
- **XSS Detection**: Identifies cross-site scripting risks
- **Input Validation**: All inputs are validated using Zod schemas
- **Rate Limiting**: API endpoints are rate-limited
- **Secure Sessions**: JWT tokens with proper expiration and refresh

## Acknowledgments

We thank the following individuals for responsibly disclosing security issues:

*No security issues have been reported yet.*
