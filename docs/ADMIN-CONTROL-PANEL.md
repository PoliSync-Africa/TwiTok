# TwiTok Admin Control Panel

## Principle

The TwiTok platform has two separate security domains:

- **Public user application:** creators, viewers, businesses and communities.
- **Private admin control plane:** platform owner and authorized staff.

The platform owner must **not** be created as an ordinary TwiTok user merely to obtain administration access.

## Initial administrator role

The initial owner role is:

- `OWNER_ADMIN`

This role has platform-level privileges subject to audit logging and strong authentication.

## Planned admin modules

1. Platform overview
2. User and account management
3. Content moderation
4. Safety reports and appeals
5. Youth protection / Family Safety
6. LIVE management
7. Creator verification and creator economy
8. Communities
9. Marketplace
10. Advertising
11. Analytics
12. Notifications and announcements
13. Platform configuration
14. Security and access control
15. Audit logs
16. Emergency controls

## Security requirements

Admin authentication must be separate from public user authentication.

Required before production:

- MFA/passkeys
- short-lived admin sessions
- role-based access control
- server-side authorization on every admin API
- audit logging for every privileged action
- session revocation
- IP/device risk controls where appropriate
- re-authentication for destructive actions
- no client-side-only admin protection

The admin UI is therefore a control-plane interface; it is not the security boundary. The backend must enforce the role.

## Initial owner configuration

Production owner identity should be supplied through secure server-side configuration and a database-backed admin identity record. Never hard-code a password, token, or secret into the repository.
